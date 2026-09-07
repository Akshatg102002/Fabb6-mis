import express, { Router } from 'express';
import { eq, and, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '../db/index.js';
import { pool } from '../db/index.js';
import { returns, returnLines, locations } from '../db/schema/index.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idempotency } from '../middleware/idempotency.js';
import { writeStockMovement } from '../services/stock-movement.js';
import { createReturnSchema, returnQuerySchema } from '../schemas/returns.js';
import { z } from 'zod';

const router: express.Router = Router();

// GET /returns
router.get(
  '/',
  requireAuth,
  validate({ query: returnQuerySchema }),
  async (req, res) => {
    const q = req.query as unknown as {
      page: number;
      limit: number;
      type?: string;
      status?: string;
    };

    const conditions = [];
    if (q.type)
      conditions.push(eq(returns.type, q.type as (typeof returns.type.enumValues)[number]));
    if (q.status)
      conditions.push(eq(returns.status, q.status as (typeof returns.status.enumValues)[number]));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (q.page - 1) * q.limit;

    const [rows, countResult] = await Promise.all([
      db.select().from(returns).where(where).limit(q.limit).offset(offset).orderBy(returns.created_at),
      db.select({ count: sql<number>`count(*)` }).from(returns).where(where),
    ]);

    const total = Number(countResult[0]?.count ?? 0);
    res.json({
      data: rows,
      meta: { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) },
    });
  },
);

// GET /returns/:id
router.get(
  '/:id',
  requireAuth,
  validate({ params: z.object({ id: z.string().uuid() }) }),
  async (req, res) => {
    const ret = await db.query.returns.findFirst({
      where: eq(returns.id, req.params['id'] as string),
    });
    if (!ret) {
      res.status(404).json({ error: 'Return not found' });
      return;
    }
    const lines = await db.select().from(returnLines).where(eq(returnLines.return_id, ret.id));
    res.json({ ...ret, lines });
  },
);

// POST /returns — start return inward
router.post(
  '/',
  requireAuth,
  requireRoles('returns', 'inward', 'supervisor', 'admin'),
  idempotency,
  validate({
    body: z.object({
      type: z.enum(['customer_return', 'rto']),
      courier_awb: z.string().max(100).optional(),
      order_ref: z.string().max(100).optional(),
      return_number: z.string().min(1).max(50),
      notes: z.string().max(2000).optional(),
    }),
  }),
  async (req, res) => {
    const body = req.body as {
      type: (typeof returns.type.enumValues)[number];
      courier_awb?: string;
      order_ref?: string;
      return_number: string;
      notes?: string;
    };

    const [ret] = await db
      .insert(returns)
      .values({
        type: body.type,
        courier_awb: body.courier_awb ?? null,
        order_ref: body.order_ref ?? null,
        return_number: body.return_number,
        notes: body.notes ?? null,
        status: 'pending',
      })
      .returning();

    res.status(201).json(ret);
  },
);

// POST /returns/:id/lines — scan item, QC grade
router.post(
  '/:id/lines',
  requireAuth,
  requireRoles('returns', 'inward', 'supervisor', 'admin'),
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      sku_id: z.string().uuid(),
      batch_id: z.string().uuid().optional(),
      qty: z.number().int().positive(),
      qc_grade: z.enum(['A', 'B', 'damaged', 'expired']).optional(),
      disposition: z.enum(['restock', 'repack', 'writeoff']).optional(),
      line_number: z.number().int().positive(),
      notes: z.string().max(500).optional(),
    }),
  }),
  async (req, res) => {
    const returnId = req.params['id'] as string;
    const body = req.body as {
      sku_id: string;
      batch_id?: string;
      qty: number;
      qc_grade?: (typeof returnLines.qc_grade.enumValues)[number];
      disposition?: (typeof returnLines.disposition.enumValues)[number];
      line_number: number;
      notes?: string;
    };

    const ret = await db.query.returns.findFirst({ where: eq(returns.id, returnId) });
    if (!ret) {
      res.status(404).json({ error: 'Return not found' });
      return;
    }
    if (ret.status === 'completed' || ret.status === 'cancelled') {
      res.status(409).json({ error: 'Return is already completed or cancelled' });
      return;
    }

    const [line] = await db
      .insert(returnLines)
      .values({
        return_id: returnId,
        sku_id: body.sku_id,
        batch_id: body.batch_id ?? null,
        qty: body.qty,
        qc_grade: body.qc_grade ?? null,
        disposition: body.disposition ?? null,
        line_number: body.line_number,
        notes: body.notes ?? null,
        inspected_by: body.qc_grade ? req.auth!.userId : null,
        inspected_at: body.qc_grade ? new Date() : null,
      })
      .returning();

    // Update return status to received
    if (ret.status === 'pending') {
      await db.update(returns).set({ status: 'received' }).where(eq(returns.id, returnId));
    }

    res.status(201).json(line);
  },
);

// POST /returns/:id/rto-received — mark an RTO return as physically received
router.post(
  '/:id/rto-received',
  requireAuth,
  requireRoles('returns', 'inward', 'supervisor', 'admin'),
  validate({ params: z.object({ id: z.string().uuid() }) }),
  async (req, res) => {
    const returnId = req.params['id'] as string;
    const ret = await db.query.returns.findFirst({ where: eq(returns.id, returnId) });
    if (!ret) { res.status(404).json({ error: 'Return not found' }); return; }
    if (ret.type !== 'rto') { res.status(409).json({ error: 'Only RTO returns can use this status' }); return; }
    if (ret.status !== 'pending' && ret.status !== 'received') {
      res.status(409).json({ error: `Cannot transition from ${ret.status} to rto_received` });
      return;
    }
    const [updated] = await db
      .update(returns)
      .set({ status: 'rto_received', updated_at: new Date() })
      .where(eq(returns.id, returnId))
      .returning();
    res.json(updated);
  },
);

// POST /returns/:id/lines/:lineId/qc — QC gate for RTO lines
router.post(
  '/:id/lines/:lineId/qc',
  requireAuth,
  requireRoles('returns', 'supervisor', 'admin'),
  validate({
    params: z.object({ id: z.string().uuid(), lineId: z.string().uuid() }),
    body: z.object({
      qc_passed: z.boolean(),
      sellable_location_id: z.string().uuid().optional(),
      quarantine_location_id: z.string().uuid().optional(),
      product_match: z.boolean().optional(),
      remarks: z.string().max(2000).optional(),
    }),
  }),
  async (req, res) => {
    const returnId = req.params['id'] as string;
    const lineId = req.params['lineId'] as string;
    const body = req.body as {
      qc_passed: boolean;
      sellable_location_id?: string;
      quarantine_location_id?: string;
      product_match?: boolean;
      remarks?: string;
    };

    const ret = await db.query.returns.findFirst({ where: eq(returns.id, returnId) });
    if (!ret) { res.status(404).json({ error: 'Return not found' }); return; }
    if (ret.status === 'completed' || ret.status === 'cancelled') {
      res.status(409).json({ error: 'Return is already completed or cancelled' });
      return;
    }

    const [line] = await db.select().from(returnLines).where(
      and(eq(returnLines.id, lineId), eq(returnLines.return_id, returnId)),
    );
    if (!line) { res.status(404).json({ error: 'Return line not found' }); return; }

    const now = new Date();
    const idempKey = `qc-${returnId}-${lineId}-${body.qc_passed ? 'pass' : 'fail'}`;

    if (body.qc_passed) {
      // Resolve sellable location: prefer explicit param, else first non-quarantine bin in same site
      let targetLocationId = body.sellable_location_id;
      if (!targetLocationId) {
        const siteLocs = await db
          .select({ id: locations.id })
          .from(locations)
          .where(eq(locations.type, 'bin'))
          .limit(1);
        if (!siteLocs[0]) {
          res.status(422).json({ error: 'No sellable bin location found; pass sellable_location_id' });
          return;
        }
        targetLocationId = siteLocs[0].id;
      }

      await writeStockMovement({
        idempotencyKey: idempKey,
        skuId: line.sku_id,
        batchId: line.batch_id ?? null,
        toLocationId: targetLocationId,
        quantity: line.qty,
        movementType: 'rto_receipt',
        referenceType: 'return',
        referenceId: returnId,
        userId: req.auth!.userId,
        deviceId: req.auth!.deviceId,
        notes: body.remarks ?? 'QC passed — restocked to sellable bin',
      });

      await db.update(returnLines).set({
        qc_grade: 'A',
        disposition: 'restock',
        product_match: body.product_match ?? true,
        damage_status: false,
        remarks: body.remarks ?? null,
        inspected_by: req.auth!.userId,
        inspected_at: now,
      }).where(eq(returnLines.id, lineId));

    } else {
      // QC failed → move to quarantine
      let quarLocId = body.quarantine_location_id;
      if (!quarLocId) {
        const qLocs = await db
          .select({ id: locations.id })
          .from(locations)
          .where(eq(locations.type, 'quarantine'))
          .limit(1);
        if (!qLocs[0]) {
          res.status(422).json({ error: 'No quarantine location found; pass quarantine_location_id' });
          return;
        }
        quarLocId = qLocs[0].id;
      }

      await writeStockMovement({
        idempotencyKey: idempKey,
        skuId: line.sku_id,
        batchId: line.batch_id ?? null,
        toLocationId: quarLocId,
        quantity: line.qty,
        movementType: 'quarantine',
        referenceType: 'return',
        referenceId: returnId,
        userId: req.auth!.userId,
        deviceId: req.auth!.deviceId,
        notes: body.remarks ?? 'QC failed — quarantined',
      });

      await db.update(returnLines).set({
        qc_grade: 'damaged',
        disposition: 'writeoff',
        product_match: body.product_match ?? false,
        damage_status: true,
        remarks: body.remarks ?? null,
        inspected_by: req.auth!.userId,
        inspected_at: now,
      }).where(eq(returnLines.id, lineId));
    }

    // Advance return status to inspected if all lines are now graded
    const ungraded = await db
      .select({ count: sql<number>`count(*)` })
      .from(returnLines)
      .where(and(eq(returnLines.return_id, returnId), sql`qc_grade IS NULL`));
    if (Number(ungraded[0]?.count ?? 0) === 0) {
      await db.update(returns).set({ status: 'inspected', updated_at: now }).where(eq(returns.id, returnId));
    }

    const [updatedLine] = await db.select().from(returnLines).where(eq(returnLines.id, lineId));
    res.json(updatedLine);
  },
);

// POST /returns/:id/complete — disposition
router.post(
  '/:id/complete',
  requireAuth,
  requireRoles('returns', 'supervisor', 'admin'),
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      receiving_location_id: z.string().uuid(),
    }),
  }),
  async (req, res) => {
    const returnId = req.params['id'] as string;
    const body = req.body as { receiving_location_id: string };

    const ret = await db.query.returns.findFirst({ where: eq(returns.id, returnId) });
    if (!ret) {
      res.status(404).json({ error: 'Return not found' });
      return;
    }
    if (ret.status === 'completed' || ret.status === 'cancelled') {
      res.status(409).json({ error: 'Return is already completed or cancelled' });
      return;
    }

    const lines = await db.select().from(returnLines).where(eq(returnLines.return_id, returnId));

    const errors: { line_id: string; error: string }[] = [];

    for (const line of lines) {
      const disposition = line.disposition;
      if (!disposition) continue;

      const idempKey = `return-${returnId}-line-${line.id}`;

      if (disposition === 'restock' || disposition === 'repack') {
        // Write inbound movement to restock location
        await writeStockMovement({
          idempotencyKey: idempKey,
          skuId: line.sku_id,
          batchId: line.batch_id ?? null,
          toLocationId: body.receiving_location_id,
          quantity: line.qty,
          movementType: ret.type === 'rto' ? 'rto_receipt' : 'customer_return',
          referenceType: 'return',
          referenceId: returnId,
          userId: req.auth!.userId,
          deviceId: req.auth!.deviceId,
          notes: `QC: ${line.qc_grade ?? 'ungraded'}, Disposition: ${disposition}`,
        }).catch((err: Error) => {
          errors.push({ line_id: line.id, error: err.message });
        });
      } else if (disposition === 'writeoff') {
        // Write a writeoff movement
        await writeStockMovement({
          idempotencyKey: idempKey,
          skuId: line.sku_id,
          batchId: line.batch_id ?? null,
          toLocationId: body.receiving_location_id,
          quantity: line.qty,
          movementType: 'writeoff',
          referenceType: 'return',
          referenceId: returnId,
          userId: req.auth!.userId,
          deviceId: req.auth!.deviceId,
          notes: `Write-off on return: QC ${line.qc_grade ?? 'damaged'}`,
        }).catch((err: Error) => {
          errors.push({ line_id: line.id, error: err.message });
        });
      }
    }

    await db.update(returns).set({ status: 'completed' }).where(eq(returns.id, returnId));

    res.json({
      message: 'Return completed',
      return_id: returnId,
      lines_processed: lines.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  },
);

export default router;
