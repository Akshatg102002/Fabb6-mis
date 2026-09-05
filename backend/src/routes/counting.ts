import { Router } from 'express';
import { eq, and, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '../db/index.js';
import { pool } from '../db/index.js';
import { cycleCounts, cycleCountLines } from '../db/schema/index.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idempotency } from '../middleware/idempotency.js';
import { writeStockMovement } from '../services/stock-movement.js';
import {
  createCycleCountSchema,
  countQuerySchema,
  submitCountLinesSchema,
} from '../schemas/counting.js';
import { z } from 'zod';

const router = Router();

// GET /cycle-counts
router.get(
  '/cycle-counts',
  requireAuth,
  validate({ query: countQuerySchema }),
  async (req, res) => {
    const q = req.query as unknown as {
      page: number;
      limit: number;
      site_id?: string;
      status?: string;
    };

    const conditions = [];
    if (q.site_id) conditions.push(eq(cycleCounts.site_id, q.site_id));
    if (q.status)
      conditions.push(
        eq(cycleCounts.status, q.status as (typeof cycleCounts.status.enumValues)[number]),
      );

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (q.page - 1) * q.limit;

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(cycleCounts)
        .where(where)
        .limit(q.limit)
        .offset(offset)
        .orderBy(cycleCounts.created_at),
      db.select({ count: sql<number>`count(*)` }).from(cycleCounts).where(where),
    ]);

    const total = Number(countResult[0]?.count ?? 0);
    res.json({
      data: rows,
      meta: { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) },
    });
  },
);

// GET /cycle-counts/:id
router.get(
  '/cycle-counts/:id',
  requireAuth,
  validate({ params: z.object({ id: z.string().uuid() }) }),
  async (req, res) => {
    const cc = await db.query.cycleCounts.findFirst({
      where: eq(cycleCounts.id, req.params['id'] as string),
    });
    if (!cc) {
      res.status(404).json({ error: 'Cycle count not found' });
      return;
    }
    const lines = await db
      .select()
      .from(cycleCountLines)
      .where(eq(cycleCountLines.cycle_count_id, cc.id));
    res.json({ ...cc, lines });
  },
);

// POST /cycle-counts — schedule count
router.post(
  '/cycle-counts',
  requireAuth,
  requireRoles('supervisor', 'admin'),
  idempotency,
  validate({ body: createCycleCountSchema }),
  async (req, res) => {
    const body = req.body as {
      site_id: string;
      location_id?: string;
      scheduled_for?: string;
      count_number: string;
    };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const ccRes = await client.query<{ id: string }>(
        `INSERT INTO cycle_counts (site_id, location_id, scheduled_for, count_number, status)
         VALUES ($1,$2,$3,$4,'scheduled') RETURNING id`,
        [
          body.site_id,
          body.location_id ?? null,
          body.scheduled_for ?? null,
          body.count_number,
        ],
      );
      const ccId = ccRes.rows[0]!.id;

      // Populate lines from current stock_on_hand for the location/site
      const stockQuery = body.location_id
        ? `INSERT INTO cycle_count_lines (cycle_count_id, sku_id, batch_id, system_qty, line_number)
           SELECT $1, soh.sku_id, soh.batch_id, soh.quantity,
                  ROW_NUMBER() OVER (ORDER BY soh.sku_id, soh.batch_id)
           FROM stock_on_hand soh
           WHERE soh.location_id = $2 AND soh.quantity > 0`
        : `INSERT INTO cycle_count_lines (cycle_count_id, sku_id, batch_id, system_qty, line_number)
           SELECT $1, soh.sku_id, soh.batch_id, SUM(soh.quantity),
                  ROW_NUMBER() OVER (ORDER BY soh.sku_id, soh.batch_id)
           FROM stock_on_hand soh
           JOIN locations l ON l.id = soh.location_id
           WHERE l.site_id = $2 AND soh.quantity > 0
           GROUP BY soh.sku_id, soh.batch_id`;

      await client.query(stockQuery, [ccId, body.location_id ?? body.site_id]);
      await client.query('COMMIT');

      const cc = await db.query.cycleCounts.findFirst({ where: eq(cycleCounts.id, ccId) });
      const lines = await db
        .select()
        .from(cycleCountLines)
        .where(eq(cycleCountLines.cycle_count_id, ccId));

      res.status(201).json({ ...cc, lines });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
);

// POST /cycle-counts/:id/lines/:lineId/count — blind count entry
router.post(
  '/cycle-counts/:id/lines/:lineId/count',
  requireAuth,
  validate({
    params: z.object({ id: z.string().uuid(), lineId: z.string().uuid() }),
    body: z.object({
      counted_qty: z.number().int().min(0),
    }),
  }),
  async (req, res) => {
    const { id: ccId, lineId } = req.params as { id: string; lineId: string };
    const { counted_qty } = req.body as { counted_qty: number };

    const cc = await db.query.cycleCounts.findFirst({ where: eq(cycleCounts.id, ccId) });
    if (!cc) {
      res.status(404).json({ error: 'Cycle count not found' });
      return;
    }
    if (!['scheduled', 'in_progress'].includes(cc.status)) {
      res.status(409).json({ error: `Cannot count: status is ${cc.status}` });
      return;
    }

    // Update to in_progress if still scheduled
    if (cc.status === 'scheduled') {
      await db
        .update(cycleCounts)
        .set({ status: 'in_progress', started_at: new Date(), counted_by: req.auth!.userId })
        .where(eq(cycleCounts.id, ccId));
    }

    const result = await pool.query(
      `UPDATE cycle_count_lines
       SET counted_qty = $1, counted_at = NOW()
       WHERE id = $2 AND cycle_count_id = $3
       RETURNING *`,
      [counted_qty, lineId, ccId],
    );

    if ((result.rowCount ?? 0) === 0) {
      res.status(404).json({ error: 'Cycle count line not found' });
      return;
    }

    res.json(result.rows[0]);
  },
);

// POST /cycle-counts/:id/submit — supervisor review
router.post(
  '/cycle-counts/:id/submit',
  requireAuth,
  requireRoles('supervisor', 'admin'),
  validate({ params: z.object({ id: z.string().uuid() }) }),
  async (req, res) => {
    const { id } = req.params as { id: string };

    const cc = await db.query.cycleCounts.findFirst({ where: eq(cycleCounts.id, id) });
    if (!cc) {
      res.status(404).json({ error: 'Cycle count not found' });
      return;
    }
    if (cc.status !== 'in_progress' && cc.status !== 'counted') {
      res.status(409).json({ error: `Cannot submit: status is ${cc.status}` });
      return;
    }

    // Calculate variance value
    const varianceResult = await pool.query<{ total_variance: number }>(
      `SELECT SUM(ABS(COALESCE(counted_qty, system_qty) - system_qty) *
                  COALESCE(s.standard_cost::numeric, 0)) AS total_variance
       FROM cycle_count_lines ccl
       JOIN skus s ON s.id = ccl.sku_id
       WHERE ccl.cycle_count_id = $1`,
      [id],
    );

    const varianceValue = varianceResult.rows[0]?.total_variance ?? 0;

    const [updated] = await db
      .update(cycleCounts)
      .set({
        status: 'under_review',
        completed_at: new Date(),
        variance_value: String(varianceValue),
      })
      .where(eq(cycleCounts.id, id))
      .returning();

    res.json(updated);
  },
);

// POST /cycle-counts/:id/approve — post adjustments
router.post(
  '/cycle-counts/:id/approve',
  requireAuth,
  requireRoles('supervisor', 'admin'),
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      location_id: z.string().uuid(),
    }),
  }),
  async (req, res) => {
    const { id } = req.params as { id: string };
    const body = req.body as { location_id: string };

    const cc = await db.query.cycleCounts.findFirst({ where: eq(cycleCounts.id, id) });
    if (!cc) {
      res.status(404).json({ error: 'Cycle count not found' });
      return;
    }
    if (cc.status !== 'under_review') {
      res.status(409).json({ error: `Cannot approve: status is ${cc.status}` });
      return;
    }

    const lines = await db
      .select()
      .from(cycleCountLines)
      .where(eq(cycleCountLines.cycle_count_id, id));

    const errors: { line_id: string; error: string }[] = [];

    for (const line of lines) {
      if (line.counted_qty === null) continue;

      const variance = line.counted_qty - line.system_qty;
      if (variance === 0) continue;

      const idempKey = `cc-adj-${id}-line-${line.id}`;

      if (variance > 0) {
        // Positive adjustment: add stock
        await writeStockMovement({
          idempotencyKey: idempKey,
          skuId: line.sku_id,
          batchId: line.batch_id ?? null,
          toLocationId: body.location_id,
          quantity: variance,
          movementType: 'cycle_count_adjustment',
          referenceType: 'cycle_count',
          referenceId: id,
          userId: req.auth!.userId,
          deviceId: req.auth!.deviceId,
          notes: `Cycle count approval: +${variance}`,
        }).catch((err: Error) => errors.push({ line_id: line.id, error: err.message }));
      } else {
        // Negative adjustment: remove stock
        await writeStockMovement({
          idempotencyKey: idempKey,
          skuId: line.sku_id,
          batchId: line.batch_id ?? null,
          fromLocationId: body.location_id,
          quantity: Math.abs(variance),
          movementType: 'cycle_count_adjustment',
          referenceType: 'cycle_count',
          referenceId: id,
          userId: req.auth!.userId,
          deviceId: req.auth!.deviceId,
          notes: `Cycle count approval: ${variance}`,
        }).catch((err: Error) => errors.push({ line_id: line.id, error: err.message }));
      }
    }

    await db
      .update(cycleCounts)
      .set({
        status: errors.length > 0 ? 'approved' : 'posted',
        approved_by: req.auth!.userId,
        approved_at: new Date(),
      })
      .where(eq(cycleCounts.id, id));

    res.json({
      message: errors.length > 0 ? 'Approved with some errors' : 'Cycle count posted',
      cycle_count_id: id,
      adjustments_applied: lines.filter((l) => l.counted_qty !== null && l.counted_qty !== l.system_qty).length,
      errors: errors.length > 0 ? errors : undefined,
    });
  },
);

export default router;
