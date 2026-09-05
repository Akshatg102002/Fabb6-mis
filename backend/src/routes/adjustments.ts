import { Router } from 'express';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { pool } from '../db/index.js';
import { adjustments } from '../db/schema/index.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idempotency } from '../middleware/idempotency.js';
import { writeStockMovement } from '../services/stock-movement.js';
import {
  createAdjustmentSchema,
  adjustmentQuerySchema,
} from '../schemas/adjustments.js';
import { z } from 'zod';

const router = Router();

// POST /adjustments — request adjustment
router.post(
  '/',
  requireAuth,
  requireRoles('inward', 'supervisor', 'admin'),
  idempotency,
  validate({ body: createAdjustmentSchema }),
  async (req, res) => {
    const body = req.body as {
      sku_id: string;
      batch_id?: string;
      location_id: string;
      quantity: number;
      reason_code: string;
      reason_notes?: string;
      adjustment_number: string;
    };

    const [adj] = await db
      .insert(adjustments)
      .values({
        sku_id: body.sku_id,
        batch_id: body.batch_id ?? null,
        location_id: body.location_id,
        quantity: body.quantity,
        reason_code: body.reason_code,
        reason_notes: body.reason_notes ?? null,
        adjustment_number: body.adjustment_number,
        status: 'pending',
        requested_by: req.auth!.userId,
      })
      .returning();

    res.status(201).json(adj);
  },
);

// GET /adjustments
router.get(
  '/',
  requireAuth,
  validate({ query: adjustmentQuerySchema }),
  async (req, res) => {
    const q = req.query as unknown as {
      page: number;
      limit: number;
      sku_id?: string;
      location_id?: string;
      status?: string;
      site_id?: string;
    };

    const conditions = [];
    if (q.sku_id) conditions.push(eq(adjustments.sku_id, q.sku_id));
    if (q.location_id) conditions.push(eq(adjustments.location_id, q.location_id));
    if (q.status)
      conditions.push(
        eq(adjustments.status, q.status as (typeof adjustments.status.enumValues)[number]),
      );

    // If site_id filter needed, join to locations
    if (q.site_id) {
      const locResult = await pool.query<{ id: string }>(
        `SELECT id FROM locations WHERE site_id = $1`,
        [q.site_id],
      );
      const locIds = locResult.rows.map((r) => r.id);
      if (locIds.length > 0) {
        conditions.push(sql`${adjustments.location_id} = ANY(${locIds}::uuid[])`);
      } else {
        res.json({
          data: [],
          meta: { page: q.page, limit: q.limit, total: 0, pages: 0 },
        });
        return;
      }
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (q.page - 1) * q.limit;

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(adjustments)
        .where(where)
        .limit(q.limit)
        .offset(offset)
        .orderBy(adjustments.created_at),
      db.select({ count: sql<number>`count(*)` }).from(adjustments).where(where),
    ]);

    const total = Number(countResult[0]?.count ?? 0);
    res.json({
      data: rows,
      meta: { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) },
    });
  },
);

// POST /adjustments/:id/approve
router.post(
  '/:id/approve',
  requireAuth,
  requireRoles('supervisor', 'admin'),
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      idempotency_key: z.string().min(1).max(128),
    }),
  }),
  async (req, res) => {
    const { id } = req.params as { id: string };
    const body = req.body as { idempotency_key: string };

    const adj = await db.query.adjustments.findFirst({ where: eq(adjustments.id, id) });
    if (!adj) {
      res.status(404).json({ error: 'Adjustment not found' });
      return;
    }
    if (adj.status !== 'pending') {
      res.status(409).json({ error: `Adjustment is not pending (current: ${adj.status})` });
      return;
    }

    // Write stock movement
    const isPositive = adj.quantity > 0;
    await writeStockMovement({
      idempotencyKey: body.idempotency_key,
      skuId: adj.sku_id,
      batchId: adj.batch_id ?? null,
      fromLocationId: isPositive ? null : adj.location_id,
      toLocationId: isPositive ? adj.location_id : null,
      quantity: Math.abs(adj.quantity),
      movementType: 'stock_adjustment',
      referenceType: 'adjustment',
      referenceId: id,
      reasonCode: adj.reason_code,
      userId: req.auth!.userId,
      deviceId: req.auth!.deviceId,
      notes: adj.reason_notes ?? undefined,
    });

    const [updated] = await db
      .update(adjustments)
      .set({
        status: 'posted',
        approved_by: req.auth!.userId,
        approved_at: new Date(),
      })
      .where(eq(adjustments.id, id))
      .returning();

    res.json(updated);
  },
);

// POST /adjustments/:id/reject
router.post(
  '/:id/reject',
  requireAuth,
  requireRoles('supervisor', 'admin'),
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      rejection_reason: z.string().min(1).max(500),
    }),
  }),
  async (req, res) => {
    const { id } = req.params as { id: string };
    const { rejection_reason } = req.body as { rejection_reason: string };

    const adj = await db.query.adjustments.findFirst({ where: eq(adjustments.id, id) });
    if (!adj) {
      res.status(404).json({ error: 'Adjustment not found' });
      return;
    }
    if (adj.status !== 'pending') {
      res.status(409).json({ error: `Adjustment is not pending (current: ${adj.status})` });
      return;
    }

    const [updated] = await db
      .update(adjustments)
      .set({
        status: 'rejected',
        rejected_at: new Date(),
        rejection_reason,
      })
      .where(eq(adjustments.id, id))
      .returning();

    res.json(updated);
  },
);

export default router;
