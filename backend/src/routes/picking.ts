import { Router } from 'express';
import { eq, and, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '../db/index.js';
import { pool } from '../db/index.js';
import { pickLists, pickLines } from '../db/schema/index.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { writeStockMovement, StockMovementError } from '../services/stock-movement.js';
import { selectFefoBatches } from '../services/fefo.js';
import { createPickListSchema, assignPickListSchema, pickQuerySchema } from '../schemas/picking.js';
import { z } from 'zod';

const router = Router();

// GET /pick-lists
router.get(
  '/pick-lists',
  requireAuth,
  validate({ query: pickQuerySchema }),
  async (req, res) => {
    const q = req.query as unknown as {
      page: number;
      limit: number;
      site_id?: string;
      status?: string;
      assigned_to?: string;
    };

    const conditions = [];
    if (q.site_id) conditions.push(eq(pickLists.site_id, q.site_id));
    if (q.status)
      conditions.push(eq(pickLists.status, q.status as (typeof pickLists.status.enumValues)[number]));
    if (q.assigned_to) conditions.push(eq(pickLists.assigned_to, q.assigned_to));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (q.page - 1) * q.limit;

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(pickLists)
        .where(where)
        .limit(q.limit)
        .offset(offset)
        .orderBy(pickLists.priority, pickLists.created_at),
      db.select({ count: sql<number>`count(*)` }).from(pickLists).where(where),
    ]);

    const total = Number(countResult[0]?.count ?? 0);
    res.json({
      data: rows,
      meta: { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) },
    });
  },
);

// GET /pick-lists/:id (with lines)
router.get(
  '/pick-lists/:id',
  requireAuth,
  validate({ params: z.object({ id: z.string().uuid() }) }),
  async (req, res) => {
    const pickList = await db.query.pickLists.findFirst({
      where: eq(pickLists.id, req.params['id'] as string),
    });
    if (!pickList) {
      res.status(404).json({ error: 'Pick list not found' });
      return;
    }
    const lines = await db.select().from(pickLines).where(eq(pickLines.pick_list_id, pickList.id));
    res.json({ ...pickList, lines });
  },
);

// POST /pick-lists (supervisor: create wave)
router.post(
  '/pick-lists',
  requireAuth,
  requireRoles('supervisor', 'admin'),
  validate({ body: createPickListSchema }),
  async (req, res) => {
    const body = req.body as {
      site_id: string;
      channel: (typeof pickLists.channel.enumValues)[number];
      priority: number;
      notes?: string;
      lines: {
        order_ref: string;
        sku_id: string;
        qty_required: number;
        line_number: number;
      }[];
    };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const plRes = await client.query<{ id: string }>(
        `INSERT INTO pick_lists (site_id, channel, priority, notes, status)
         VALUES ($1,$2,$3,$4,'pending') RETURNING id`,
        [body.site_id, body.channel, body.priority, body.notes ?? null],
      );
      const plId = plRes.rows[0]!.id;

      for (const line of body.lines) {
        // FEFO pre-assignment: find the best batch+location for each line
        const fefoAllocs = await selectFefoBatches({
          skuId: line.sku_id,
          requiredQty: line.qty_required,
          siteId: body.site_id,
        });

        const batchId = fefoAllocs[0]?.batchId ?? null;
        const locationId = fefoAllocs[0]?.locationId ?? null;

        await client.query(
          `INSERT INTO pick_lines (pick_list_id, order_ref, sku_id, batch_id, location_id,
                                   qty_required, line_number, sort_sequence)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$7)`,
          [plId, line.order_ref, line.sku_id, batchId, locationId, line.qty_required, line.line_number],
        );
      }

      await client.query('COMMIT');

      const pickList = await db.query.pickLists.findFirst({ where: eq(pickLists.id, plId) });
      const lines = await db.select().from(pickLines).where(eq(pickLines.pick_list_id, plId));
      res.status(201).json({ ...pickList, lines });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
);

// POST /pick-lists/:id/assign — assign to user
router.post(
  '/pick-lists/:id/assign',
  requireAuth,
  requireRoles('supervisor', 'admin'),
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: assignPickListSchema,
  }),
  async (req, res) => {
    const { id } = req.params as { id: string };
    const { assigned_to } = req.body as { assigned_to: string };

    const pickList = await db.query.pickLists.findFirst({ where: eq(pickLists.id, id) });
    if (!pickList) {
      res.status(404).json({ error: 'Pick list not found' });
      return;
    }
    if (pickList.status !== 'pending') {
      res.status(409).json({ error: 'Pick list is not in pending state' });
      return;
    }

    const [updated] = await db
      .update(pickLists)
      .set({ assigned_to, status: 'assigned' })
      .where(eq(pickLists.id, id))
      .returning();

    res.json(updated);
  },
);

// POST /pick-lists/:id/lines/:lineId/pick
router.post(
  '/pick-lists/:id/lines/:lineId/pick',
  requireAuth,
  requireRoles('picker', 'supervisor', 'admin'),
  validate({
    params: z.object({ id: z.string().uuid(), lineId: z.string().uuid() }),
    body: z.object({
      qty_picked: z.number().int().min(0),
      idempotency_key: z.string().min(1).max(128),
      location_id: z.string().uuid().optional(),
      batch_id: z.string().uuid().optional(),
    }),
  }),
  async (req, res) => {
    const { id: pickListId, lineId } = req.params as { id: string; lineId: string };
    const body = req.body as {
      qty_picked: number;
      idempotency_key: string;
      location_id?: string;
      batch_id?: string;
    };

    const pickList = await db.query.pickLists.findFirst({ where: eq(pickLists.id, pickListId) });
    if (!pickList) {
      res.status(404).json({ error: 'Pick list not found' });
      return;
    }

    const lineResult = await pool.query<{
      id: string;
      sku_id: string;
      batch_id: string | null;
      location_id: string | null;
      qty_required: number;
      qty_picked: number;
    }>(
      `SELECT id, sku_id, batch_id, location_id, qty_required, qty_picked
       FROM pick_lines WHERE id = $1 AND pick_list_id = $2`,
      [lineId, pickListId],
    );

    if ((lineResult.rowCount ?? 0) === 0) {
      res.status(404).json({ error: 'Pick line not found' });
      return;
    }

    const line = lineResult.rows[0]!;
    const effectiveBatchId = body.batch_id ?? line.batch_id;
    const effectiveLocationId = body.location_id ?? line.location_id;

    if (!effectiveLocationId) {
      // Try FEFO to find location
      const fefo = await selectFefoBatches({
        skuId: line.sku_id,
        requiredQty: body.qty_picked,
        siteId: pickList.site_id,
      });
      if (fefo.length === 0) {
        res.status(409).json({ error: 'Insufficient stock to fulfil pick' });
        return;
      }
    }

    // Write stock movement for the pick
    const movement = await writeStockMovement({
      idempotencyKey: body.idempotency_key,
      skuId: line.sku_id,
      batchId: effectiveBatchId,
      fromLocationId: effectiveLocationId,
      quantity: body.qty_picked,
      movementType: 'pick',
      referenceType: 'pick_list',
      referenceId: pickListId,
      userId: req.auth!.userId,
      deviceId: req.auth!.deviceId,
    });

    // Update pick line
    await pool.query(
      `UPDATE pick_lines
       SET qty_picked = qty_picked + $1,
           picked_at  = NOW(),
           picked_by  = $2,
           batch_id   = COALESCE($3, batch_id),
           location_id = COALESCE($4, location_id)
       WHERE id = $5`,
      [body.qty_picked, req.auth!.userId, effectiveBatchId ?? null, effectiveLocationId ?? null, lineId],
    );

    // Update pick list status
    const summary = await pool.query<{ total: number; picked: number }>(
      `SELECT SUM(qty_required) AS total, SUM(qty_picked) AS picked
       FROM pick_lines WHERE pick_list_id = $1`,
      [pickListId],
    );
    const { total, picked } = summary.rows[0] ?? { total: 0, picked: 0 };

    let newStatus: (typeof pickLists.status.enumValues)[number] = 'in_progress';
    if (Number(picked) >= Number(total)) {
      newStatus = 'picked';
    } else if (Number(picked) > 0) {
      newStatus = 'partially_picked';
    }

    await db.update(pickLists).set({ status: newStatus }).where(eq(pickLists.id, pickListId));

    res.json({ movement_id: String(movement.movementId), status: newStatus });
  },
);

// POST /pick-lists/:id/complete
router.post(
  '/pick-lists/:id/complete',
  requireAuth,
  requireRoles('picker', 'supervisor', 'admin'),
  validate({ params: z.object({ id: z.string().uuid() }) }),
  async (req, res) => {
    const { id } = req.params as { id: string };

    const pickList = await db.query.pickLists.findFirst({ where: eq(pickLists.id, id) });
    if (!pickList) {
      res.status(404).json({ error: 'Pick list not found' });
      return;
    }
    if (!['in_progress', 'partially_picked', 'assigned'].includes(pickList.status)) {
      res.status(409).json({ error: `Cannot complete pick list with status: ${pickList.status}` });
      return;
    }

    const [updated] = await db
      .update(pickLists)
      .set({ status: 'picked', completed_at: new Date() })
      .where(eq(pickLists.id, id))
      .returning();

    res.json(updated);
  },
);

export default router;
