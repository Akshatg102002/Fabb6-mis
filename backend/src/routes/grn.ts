import { Router } from 'express';
import { eq, and, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '../db/index.js';
import { pool } from '../db/index.js';
import {
  grns,
  grnLines,
  purchaseOrders,
  poLines,
  batches,
  locations,
} from '../db/schema/index.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idempotency } from '../middleware/idempotency.js';
import { writeStockMovement } from '../services/stock-movement.js';
import { enqueueJob } from '../jobs/index.js';
import {
  createGrnSchema,
  createPoSchema,
  grnQuerySchema,
} from '../schemas/grn.js';
import { z } from 'zod';

const router = Router();

// ── Purchase Orders ─────────────────────────────────────────────────────────

// GET /purchase-orders
router.get(
  '/purchase-orders',
  requireAuth,
  validate({
    query: z.object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      supplier_id: z.string().uuid().optional(),
      status: z.enum(['draft', 'confirmed', 'partial', 'received', 'cancelled']).optional(),
      site_id: z.string().uuid().optional(),
    }),
  }),
  async (req, res) => {
    const q = req.query as unknown as {
      page: number;
      limit: number;
      supplier_id?: string;
      status?: string;
      site_id?: string;
    };

    const conditions = [];
    if (q.supplier_id) conditions.push(eq(purchaseOrders.supplier_id, q.supplier_id));
    if (q.site_id) conditions.push(eq(purchaseOrders.site_id, q.site_id));
    if (q.status)
      conditions.push(
        eq(purchaseOrders.status, q.status as (typeof purchaseOrders.status.enumValues)[number]),
      );

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (q.page - 1) * q.limit;

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(purchaseOrders)
        .where(where)
        .limit(q.limit)
        .offset(offset)
        .orderBy(purchaseOrders.created_at),
      db.select({ count: sql<number>`count(*)` }).from(purchaseOrders).where(where),
    ]);

    const total = Number(countResult[0]?.count ?? 0);
    res.json({
      data: rows,
      meta: { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) },
    });
  },
);

// GET /purchase-orders/:id
router.get(
  '/purchase-orders/:id',
  requireAuth,
  validate({ params: z.object({ id: z.string().uuid() }) }),
  async (req, res) => {
    const po = await db.query.purchaseOrders.findFirst({
      where: eq(purchaseOrders.id, req.params['id'] as string),
    });
    if (!po) {
      res.status(404).json({ error: 'Purchase order not found' });
      return;
    }
    const lines = await db.select().from(poLines).where(eq(poLines.po_id, po.id));
    res.json({ ...po, lines });
  },
);

// POST /purchase-orders (admin/supervisor)
router.post(
  '/purchase-orders',
  requireAuth,
  requireRoles('admin', 'supervisor'),
  idempotency,
  validate({ body: createPoSchema }),
  async (req, res) => {
    const body = req.body as {
      supplier_id: string;
      site_id: string;
      po_number: string;
      expected_date?: string;
      notes?: string;
      lines: {
        sku_id: string;
        ordered_qty: number;
        unit_cost?: number;
        line_number: number;
      }[];
    };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const poRes = await client.query<{ id: string }>(
        `INSERT INTO purchase_orders (supplier_id, site_id, po_number, expected_date, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [
          body.supplier_id,
          body.site_id,
          body.po_number,
          body.expected_date ?? null,
          body.notes ?? null,
          req.auth!.userId,
        ],
      );

      const poId = poRes.rows[0]!.id;

      for (const line of body.lines) {
        await client.query(
          `INSERT INTO po_lines (po_id, sku_id, ordered_qty, unit_cost, line_number)
           VALUES ($1,$2,$3,$4,$5)`,
          [poId, line.sku_id, line.ordered_qty, line.unit_cost ?? null, line.line_number],
        );
      }

      await client.query('COMMIT');

      const po = await db.query.purchaseOrders.findFirst({
        where: eq(purchaseOrders.id, poId),
      });
      const lines = await db.select().from(poLines).where(eq(poLines.po_id, poId));

      res.status(201).json({ ...po, lines });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
);

// ── GRNs ────────────────────────────────────────────────────────────────────

// GET /grns
router.get(
  '/grns',
  requireAuth,
  validate({ query: grnQuerySchema }),
  async (req, res) => {
    const q = req.query as unknown as {
      page: number;
      limit: number;
      site_id?: string;
      po_id?: string;
      status?: string;
    };

    const conditions = [];
    if (q.site_id) conditions.push(eq(grns.site_id, q.site_id));
    if (q.po_id) conditions.push(eq(grns.po_id, q.po_id));
    if (q.status) conditions.push(eq(grns.status, q.status as (typeof grns.status.enumValues)[number]));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (q.page - 1) * q.limit;

    const [rows, countResult] = await Promise.all([
      db.select().from(grns).where(where).limit(q.limit).offset(offset).orderBy(grns.created_at),
      db.select({ count: sql<number>`count(*)` }).from(grns).where(where),
    ]);

    const total = Number(countResult[0]?.count ?? 0);
    res.json({
      data: rows,
      meta: { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) },
    });
  },
);

// GET /grns/:id (with lines)
router.get(
  '/grns/:id',
  requireAuth,
  validate({ params: z.object({ id: z.string().uuid() }) }),
  async (req, res) => {
    const grn = await db.query.grns.findFirst({
      where: eq(grns.id, req.params['id'] as string),
    });
    if (!grn) {
      res.status(404).json({ error: 'GRN not found' });
      return;
    }
    const lines = await db.select().from(grnLines).where(eq(grnLines.grn_id, grn.id));
    res.json({ ...grn, lines });
  },
);

// POST /grns — start a GRN
router.post(
  '/grns',
  requireAuth,
  requireRoles('inward', 'supervisor', 'admin'),
  idempotency,
  validate({
    body: z.object({
      po_id: z.string().uuid().optional(),
      supplier_invoice_no: z.string().max(100).optional(),
      site_id: z.string().uuid(),
      grn_number: z.string().min(1).max(50),
      notes: z.string().max(2000).optional(),
    }),
  }),
  async (req, res) => {
    const body = req.body as {
      po_id?: string;
      supplier_invoice_no?: string;
      site_id: string;
      grn_number: string;
      notes?: string;
    };

    const [grn] = await db
      .insert(grns)
      .values({
        po_id: body.po_id ?? null,
        supplier_invoice_no: body.supplier_invoice_no ?? null,
        site_id: body.site_id,
        grn_number: body.grn_number,
        notes: body.notes ?? null,
        received_by: req.auth!.userId,
        status: 'in_progress',
      })
      .returning();

    res.status(201).json(grn);
  },
);

// POST /grns/:id/lines — add a received line
router.post(
  '/grns/:id/lines',
  requireAuth,
  requireRoles('inward', 'supervisor', 'admin'),
  idempotency,
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      sku_id: z.string().uuid(),
      batch_number: z.string().min(1).max(100),
      mfg_date: z.string().datetime().optional(),
      expiry_date: z.string().datetime().optional(),
      qty_received: z.number().int().positive(),
      qty_accepted: z.number().int().min(0),
      qty_rejected: z.number().int().min(0).default(0),
      rejection_reason: z.string().max(500).optional(),
      unit_cost: z.number().positive().optional(),
      line_number: z.number().int().positive(),
      receiving_location_id: z.string().uuid(),
    }),
  }),
  async (req, res) => {
    const grnId = req.params['id'] as string;
    const body = req.body as {
      sku_id: string;
      batch_number: string;
      mfg_date?: string;
      expiry_date?: string;
      qty_received: number;
      qty_accepted: number;
      qty_rejected: number;
      rejection_reason?: string;
      unit_cost?: number;
      line_number: number;
      receiving_location_id: string;
    };

    const grn = await db.query.grns.findFirst({ where: eq(grns.id, grnId) });
    if (!grn) {
      res.status(404).json({ error: 'GRN not found' });
      return;
    }
    if (grn.status === 'completed' || grn.status === 'posted') {
      res.status(409).json({ error: 'GRN is already completed' });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Upsert batch
      const batchRes = await client.query<{ id: string }>(
        `INSERT INTO batches (sku_id, batch_number, mfg_date, expiry_date, landed_cost_per_unit, grn_id)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (sku_id, batch_number) DO UPDATE
           SET mfg_date = EXCLUDED.mfg_date,
               expiry_date = EXCLUDED.expiry_date,
               landed_cost_per_unit = COALESCE(EXCLUDED.landed_cost_per_unit, batches.landed_cost_per_unit),
               grn_id = EXCLUDED.grn_id
         RETURNING id`,
        [
          body.sku_id,
          body.batch_number,
          body.mfg_date ?? null,
          body.expiry_date ?? null,
          body.unit_cost ?? null,
          grnId,
        ],
      );

      const batchId = batchRes.rows[0]!.id;

      const lineRes = await client.query<{ id: string }>(
        `INSERT INTO grn_lines (grn_id, sku_id, batch_id, qty_received, qty_accepted, qty_rejected,
                                rejection_reason, unit_cost, line_number)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [
          grnId,
          body.sku_id,
          batchId,
          body.qty_received,
          body.qty_accepted,
          body.qty_rejected,
          body.rejection_reason ?? null,
          body.unit_cost ?? null,
          body.line_number,
        ],
      );

      const lineId = lineRes.rows[0]!.id;
      await client.query('COMMIT');

      // Write stock movement for accepted qty
      if (body.qty_accepted > 0) {
        await writeStockMovement({
          idempotencyKey: `grn-line-${lineId}`,
          skuId: body.sku_id,
          batchId,
          toLocationId: body.receiving_location_id,
          quantity: body.qty_accepted,
          movementType: 'grn_receipt',
          referenceType: 'grn',
          referenceId: grnId,
          userId: req.auth!.userId,
          deviceId: req.auth!.deviceId,
        });
      }

      res.status(201).json({ line_id: lineId, batch_id: batchId });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  },
);

// PUT /grns/:id/lines/:lineId — update qty/rejection
router.put(
  '/grns/:id/lines/:lineId',
  requireAuth,
  requireRoles('inward', 'supervisor', 'admin'),
  validate({
    params: z.object({ id: z.string().uuid(), lineId: z.string().uuid() }),
    body: z.object({
      qty_accepted: z.number().int().min(0).optional(),
      qty_rejected: z.number().int().min(0).optional(),
      rejection_reason: z.string().max(500).optional(),
      unit_cost: z.number().positive().optional(),
    }),
  }),
  async (req, res) => {
    const { id: grnId, lineId } = req.params as { id: string; lineId: string };

    const grn = await db.query.grns.findFirst({ where: eq(grns.id, grnId) });
    if (!grn) {
      res.status(404).json({ error: 'GRN not found' });
      return;
    }
    if (grn.status === 'completed' || grn.status === 'posted') {
      res.status(409).json({ error: 'GRN is already completed' });
      return;
    }

    const body = req.body as {
      qty_accepted?: number;
      qty_rejected?: number;
      rejection_reason?: string;
      unit_cost?: number;
    };

    const updates: string[] = [];
    const params: unknown[] = [lineId, grnId];
    let idx = 3;

    if (body.qty_accepted !== undefined) {
      updates.push(`qty_accepted = $${idx++}`);
      params.push(body.qty_accepted);
    }
    if (body.qty_rejected !== undefined) {
      updates.push(`qty_rejected = $${idx++}`);
      params.push(body.qty_rejected);
    }
    if (body.rejection_reason !== undefined) {
      updates.push(`rejection_reason = $${idx++}`);
      params.push(body.rejection_reason);
    }
    if (body.unit_cost !== undefined) {
      updates.push(`unit_cost = $${idx++}`);
      params.push(body.unit_cost);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    const result = await pool.query(
      `UPDATE grn_lines SET ${updates.join(', ')} WHERE id = $1 AND grn_id = $2 RETURNING *`,
      params,
    );

    if ((result.rowCount ?? 0) === 0) {
      res.status(404).json({ error: 'GRN line not found' });
      return;
    }

    res.json(result.rows[0]);
  },
);

// POST /grns/:id/complete — finalize GRN
router.post(
  '/grns/:id/complete',
  requireAuth,
  requireRoles('inward', 'supervisor', 'admin'),
  validate({ params: z.object({ id: z.string().uuid() }) }),
  async (req, res) => {
    const grnId = req.params['id'] as string;

    const grn = await db.query.grns.findFirst({ where: eq(grns.id, grnId) });
    if (!grn) {
      res.status(404).json({ error: 'GRN not found' });
      return;
    }
    if (grn.status !== 'in_progress') {
      res.status(409).json({ error: `GRN is not in_progress (current: ${grn.status})` });
      return;
    }

    await db.update(grns).set({ status: 'completed' }).where(eq(grns.id, grnId));

    // Enqueue label printing job for all batches in this GRN
    const lines = await db.select().from(grnLines).where(eq(grnLines.grn_id, grnId));
    for (const line of lines) {
      if (line.batch_id) {
        await enqueueJob('print-batch-label', {
          batch_id: line.batch_id,
          grn_id: grnId,
          site_id: grn.site_id,
        });
      }
    }

    // Update PO received quantities if linked
    if (grn.po_id) {
      for (const line of lines) {
        await pool.query(
          `UPDATE po_lines SET received_qty = received_qty + $1
           WHERE po_id = $2 AND sku_id = $3`,
          [line.qty_accepted, grn.po_id, line.sku_id],
        );
      }

      // Update PO status
      await pool.query(
        `UPDATE purchase_orders
         SET status = CASE
           WHEN (SELECT COUNT(*) FROM po_lines WHERE po_id = $1 AND received_qty < ordered_qty) = 0
             THEN 'received'
           ELSE 'partial'
         END
         WHERE id = $1`,
        [grn.po_id],
      );
    }

    res.json({ message: 'GRN completed', grn_id: grnId, lines_count: lines.length });
  },
);

export default router;
