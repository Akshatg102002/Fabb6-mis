import { Router } from 'express';
import { randomUUID } from 'crypto';
import { pool } from '../db/index.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { writeStockMovement, writeBatchMovements } from '../services/stock-movement.js';
import { z } from 'zod';

// Transfers are tracked as stock movements with reference_type='transfer'.
// Each transfer is represented by a shared reference_id (UUID) linking
// transfer_out (at source) and transfer_receipt (at destination) movements.

const router = Router();

const transferLineSchema = z.object({
  sku_id: z.string().uuid(),
  batch_id: z.string().uuid().optional(),
  qty: z.number().int().positive(),
  from_location_id: z.string().uuid(),
});

const createTransferSchema = z.object({
  from_site_id: z.string().uuid(),
  to_site_id: z.string().uuid(),
  lines: z.array(transferLineSchema).min(1),
  notes: z.string().max(500).optional(),
});

const transferQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  from_site_id: z.string().uuid().optional(),
  to_site_id: z.string().uuid().optional(),
  status: z.enum(['in_transit', 'received', 'all']).default('all'),
});

// GET /transfers
router.get(
  '/',
  requireAuth,
  validate({ query: transferQuerySchema }),
  async (req, res) => {
    const q = req.query as {
      page: number;
      limit: number;
      from_site_id?: string;
      to_site_id?: string;
      status: string;
    };

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    conditions.push(`sm.reference_type = 'transfer'`);

    // Group by reference_id to get one row per transfer
    // Transfer status: 'in_transit' = only transfer_out movements exist,
    //                  'received'   = transfer_receipt movements also exist

    if (q.from_site_id) {
      conditions.push(`from_site.id = $${idx++}`);
      params.push(q.from_site_id);
    }
    if (q.to_site_id) {
      conditions.push(`to_site.id = $${idx++}`);
      params.push(q.to_site_id);
    }

    const statusFilter =
      q.status === 'in_transit'
        ? `HAVING bool_and(sm.movement_type = 'transfer_out')`
        : q.status === 'received'
        ? `HAVING bool_or(sm.movement_type = 'transfer_receipt')`
        : '';

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (q.page - 1) * q.limit;

    const dataResult = await pool.query(
      `SELECT
         sm.reference_id  AS transfer_id,
         MIN(sm.created_at) AS created_at,
         bool_or(sm.movement_type = 'transfer_receipt') AS is_received,
         ARRAY_AGG(DISTINCT sm.movement_type) AS movement_types,
         COUNT(DISTINCT sm.id)                AS movement_count,
         from_site.id                         AS from_site_id,
         from_site.name                       AS from_site_name,
         to_site.id                           AS to_site_id,
         to_site.name                         AS to_site_name
       FROM stock_movements sm
       LEFT JOIN locations from_loc ON from_loc.id = sm.from_location_id
       LEFT JOIN sites     from_site ON from_site.id = from_loc.site_id
       LEFT JOIN locations to_loc   ON to_loc.id = sm.to_location_id
       LEFT JOIN sites     to_site  ON to_site.id = to_loc.site_id
       ${where}
       GROUP BY sm.reference_id, from_site.id, from_site.name, to_site.id, to_site.name
       ${statusFilter}
       ORDER BY MIN(sm.created_at) DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, q.limit, offset],
    );

    res.json({
      data: dataResult.rows,
      meta: { page: q.page, limit: q.limit, total: dataResult.rowCount ?? 0 },
    });
  },
);

// POST /transfers — create transfer (write transfer_out movements)
router.post(
  '/',
  requireAuth,
  requireRoles('supervisor', 'admin'),
  validate({ body: createTransferSchema }),
  async (req, res) => {
    const body = req.body as {
      from_site_id: string;
      to_site_id: string;
      lines: {
        sku_id: string;
        batch_id?: string;
        qty: number;
        from_location_id: string;
      }[];
      notes?: string;
    };

    // Generate a transfer reference ID to link all movements
    const transferId = randomUUID();

    const result = await writeBatchMovements(
      body.lines.map((line, i) => ({
        idempotencyKey: `transfer-${transferId}-line-${i}`,
        skuId: line.sku_id,
        batchId: line.batch_id ?? null,
        fromLocationId: line.from_location_id,
        quantity: line.qty,
        movementType: 'transfer_out' as const,
        referenceType: 'transfer' as const,
        referenceId: transferId,
        userId: req.auth!.userId,
        deviceId: req.auth!.deviceId,
        notes: body.notes ?? null,
      })),
    );

    if (result.failed.length > 0) {
      res.status(207).json({
        transfer_id: transferId,
        succeeded: result.succeeded.length,
        failed: result.failed.map((f) => ({
          sku_id: f.input.skuId,
          error: f.error.message,
        })),
        message: 'Transfer partially created — some lines failed',
      });
      return;
    }

    res.status(201).json({
      transfer_id: transferId,
      status: 'in_transit',
      lines_count: result.succeeded.length,
      movements: result.succeeded.map((m) => ({
        movement_id: String(m.movementId),
        sku_id: m.skuId,
        quantity: m.quantity,
      })),
    });
  },
);

// POST /transfers/:id/receive — receive at destination
router.post(
  '/:id/receive',
  requireAuth,
  requireRoles('inward', 'supervisor', 'admin'),
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      lines: z.array(
        z.object({
          sku_id: z.string().uuid(),
          batch_id: z.string().uuid().optional(),
          qty: z.number().int().positive(),
          to_location_id: z.string().uuid(),
        }),
      ).min(1),
      notes: z.string().max(500).optional(),
    }),
  }),
  async (req, res) => {
    const transferId = req.params['id']!;
    const body = req.body as {
      lines: {
        sku_id: string;
        batch_id?: string;
        qty: number;
        to_location_id: string;
      }[];
      notes?: string;
    };

    // Verify transfer exists (has transfer_out movements)
    const checkResult = await pool.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM stock_movements
       WHERE reference_type = 'transfer' AND reference_id = $1 AND movement_type = 'transfer_out'`,
      [transferId],
    );

    if (Number(checkResult.rows[0]?.count ?? 0) === 0) {
      res.status(404).json({ error: 'Transfer not found or has no outbound movements' });
      return;
    }

    // Check if already received
    const receivedCheck = await pool.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM stock_movements
       WHERE reference_type = 'transfer' AND reference_id = $1 AND movement_type = 'transfer_receipt'`,
      [transferId],
    );

    if (Number(receivedCheck.rows[0]?.count ?? 0) > 0) {
      res.status(409).json({ error: 'Transfer has already been received' });
      return;
    }

    const result = await writeBatchMovements(
      body.lines.map((line, i) => ({
        idempotencyKey: `transfer-recv-${transferId}-line-${i}`,
        skuId: line.sku_id,
        batchId: line.batch_id ?? null,
        toLocationId: line.to_location_id,
        quantity: line.qty,
        movementType: 'transfer_receipt' as const,
        referenceType: 'transfer' as const,
        referenceId: transferId,
        userId: req.auth!.userId,
        deviceId: req.auth!.deviceId,
        notes: body.notes ?? null,
      })),
    );

    res.json({
      transfer_id: transferId,
      status: 'received',
      succeeded: result.succeeded.length,
      failed: result.failed.map((f) => ({
        sku_id: f.input.skuId,
        error: f.error.message,
      })),
    });
  },
);

export default router;
