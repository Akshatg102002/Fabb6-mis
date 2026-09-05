import { Router } from 'express';
import { eq, and, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import { grns, grnLines, purchaseOrders, poLines, batches } from '../db/schema/index.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idempotency } from '../middleware/idempotency.js';
import { createGrnSchema, grnQuerySchema, postGrnSchema } from '../schemas/grn.js';
import { writeStockMovement } from '../services/stock-movement.js';

const router = Router();

// GET /grn
router.get('/', requireAuth, validate({ query: grnQuerySchema }), async (req, res) => {
  const q = req.query as {
    page: number;
    limit: number;
    site_id?: string;
    po_id?: string;
    status?: string;
  };

  const conditions = [];
  if (q.site_id) conditions.push(eq(grns.site_id, q.site_id));
  if (q.po_id) conditions.push(eq(grns.po_id, q.po_id));
  if (q.status) conditions.push(eq(grns.status, q.status as typeof grns.status._.data));

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const offset = (q.page - 1) * q.limit;

  const [rows, countResult] = await Promise.all([
    db.select().from(grns).where(where).limit(q.limit).offset(offset).orderBy(grns.received_at),
    db.select({ count: sql<number>`count(*)` }).from(grns).where(where),
  ]);

  const total = Number(countResult[0]?.count ?? 0);
  res.json({
    data: rows,
    meta: { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) },
  });
});

// GET /grn/:id
router.get('/:id', requireAuth, async (req, res) => {
  const grn = await db.query.grns.findFirst({
    where: eq(grns.id, req.params['id']!),
  });
  if (!grn) {
    res.status(404).json({ error: 'GRN not found' });
    return;
  }

  const lines = await db
    .select()
    .from(grnLines)
    .where(eq(grnLines.grn_id, req.params['id']!))
    .orderBy(grnLines.line_number);

  res.json({ ...grn, lines });
});

// POST /grn — create a new GRN
router.post(
  '/',
  requireAuth,
  requireRoles('admin', 'supervisor', 'inward'),
  idempotency,
  validate({ body: createGrnSchema }),
  async (req, res) => {
    const body = req.body as {
      po_id?: string;
      supplier_invoice_no?: string;
      site_id: string;
      grn_number: string;
      notes?: string;
      lines: Array<{
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
      }>;
    };
    const auth = req.auth!;

    // Create GRN and its lines in a transaction
    const result = await db.transaction(async (tx) => {
      const [grn] = await tx
        .insert(grns)
        .values({
          po_id: body.po_id ?? null,
          supplier_invoice_no: body.supplier_invoice_no ?? null,
          site_id: body.site_id,
          received_by: auth.userId,
          grn_number: body.grn_number,
          notes: body.notes ?? null,
          status: 'draft',
        })
        .returning();

      const createdLines = [];

      for (const line of body.lines) {
        // Create or find batch
        const existingBatch = await tx.query.batches.findFirst({
          where: and(
            eq(batches.sku_id, line.sku_id),
            eq(batches.batch_number, line.batch_number),
          ),
        });

        let batchId: string;
        if (existingBatch) {
          batchId = existingBatch.id;
        } else {
          const [newBatch] = await tx
            .insert(batches)
            .values({
              sku_id: line.sku_id,
              batch_number: line.batch_number,
              mfg_date: line.mfg_date ? new Date(line.mfg_date) : null,
              expiry_date: line.expiry_date ? new Date(line.expiry_date) : null,
              landed_cost_per_unit: line.unit_cost ? String(line.unit_cost) : null,
              grn_id: grn!.id,
            })
            .returning();
          batchId = newBatch!.id;
        }

        const [grnLine] = await tx
          .insert(grnLines)
          .values({
            grn_id: grn!.id,
            sku_id: line.sku_id,
            batch_id: batchId,
            qty_received: line.qty_received,
            qty_accepted: line.qty_accepted,
            qty_rejected: line.qty_rejected,
            rejection_reason: line.rejection_reason ?? null,
            unit_cost: line.unit_cost ? String(line.unit_cost) : null,
            line_number: line.line_number,
          })
          .returning();

        createdLines.push(grnLine);
      }

      return { grn, lines: createdLines };
    });

    res.status(201).json(result);
  },
);

// POST /grn/:id/post — post GRN to stock (creates stock movements)
router.post(
  '/:id/post',
  requireAuth,
  requireRoles('admin', 'supervisor', 'inward'),
  idempotency,
  validate({ body: postGrnSchema }),
  async (req, res) => {
    const { receiving_location_id } = req.body as { receiving_location_id: string };
    const auth = req.auth!;
    const grnId = req.params['id']!;

    const grn = await db.query.grns.findFirst({ where: eq(grns.id, grnId) });
    if (!grn) {
      res.status(404).json({ error: 'GRN not found' });
      return;
    }
    if (grn.status === 'posted') {
      res.status(409).json({ error: 'GRN already posted' });
      return;
    }

    const lines = await db
      .select()
      .from(grnLines)
      .where(eq(grnLines.grn_id, grnId));

    const movementResults = [];
    for (const line of lines) {
      if (line.qty_accepted <= 0) continue;

      const result = await writeStockMovement({
        idempotencyKey: `grn-${grnId}-line-${line.id}-post`,
        skuId: line.sku_id,
        batchId: line.batch_id,
        toLocationId: receiving_location_id,
        quantity: line.qty_accepted,
        movementType: 'grn_receipt',
        referenceType: 'grn',
        referenceId: grnId,
        userId: auth.userId,
        deviceId: auth.deviceId,
      });
      movementResults.push(result);
    }

    await db.update(grns).set({ status: 'posted' }).where(eq(grns.id, grnId));

    res.json({ grn_id: grnId, movements_created: movementResults.length });
  },
);

export default router;
