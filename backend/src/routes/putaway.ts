import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { pool } from '../db/index.js';
import { db } from '../db/index.js';
import { skus, locations } from '../db/schema/index.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { writeStockMovement } from '../services/stock-movement.js';
import { z } from 'zod';

const router = Router();

// GET /putaway/tasks?site_id=&assigned_to=
// Pending putaway tasks = GRN lines from completed GRNs
// that haven't yet had a putaway movement recorded.
router.get(
  '/tasks',
  requireAuth,
  validate({
    query: z.object({
      site_id: z.string().uuid().optional(),
      assigned_to: z.string().uuid().optional(),
    }),
  }),
  async (req, res) => {
    const q = req.query as unknown as { site_id?: string; assigned_to?: string };

    const result = await pool.query<{
      grn_id: string;
      grn_number: string;
      grn_line_id: string;
      sku_id: string;
      sku_code: string;
      sku_name: string;
      batch_id: string | null;
      batch_number: string | null;
      qty_accepted: number;
      site_id: string;
    }>(
      `SELECT
         g.id               AS grn_id,
         g.grn_number,
         gl.id              AS grn_line_id,
         gl.sku_id,
         s.code             AS sku_code,
         s.name             AS sku_name,
         gl.batch_id,
         b.batch_number,
         gl.qty_accepted,
         g.site_id
       FROM grn_lines gl
       JOIN grns    g ON g.id = gl.grn_id
       JOIN skus    s ON s.id = gl.sku_id
       LEFT JOIN batches b ON b.id = gl.batch_id
       WHERE g.status = 'completed'
         AND ($1::uuid IS NULL OR g.site_id = $1::uuid)
         AND NOT EXISTS (
           SELECT 1 FROM stock_movements sm
           WHERE sm.movement_type  = 'putaway'
             AND sm.reference_type = 'grn'
             AND sm.reference_id   = g.id
             AND sm.sku_id         = gl.sku_id
             AND (sm.batch_id = gl.batch_id OR (sm.batch_id IS NULL AND gl.batch_id IS NULL))
         )
       ORDER BY g.received_at ASC`,
      [q.site_id ?? null],
    );

    res.json({ data: result.rows, total: result.rowCount ?? 0 });
  },
);

// POST /putaway/confirm
router.post(
  '/confirm',
  requireAuth,
  requireRoles('inward', 'supervisor', 'admin'),
  validate({
    body: z.object({
      grn_line_id: z.string().uuid(),
      destination_location_id: z.string().uuid(),
      idempotency_key: z.string().min(1).max(128),
    }),
  }),
  async (req, res) => {
    const body = req.body as {
      grn_line_id: string;
      destination_location_id: string;
      idempotency_key: string;
    };

    // Load the GRN line to know what to move
    const lineResult = await pool.query<{
      grn_id: string;
      sku_id: string;
      batch_id: string | null;
      qty_accepted: number;
      receiving_location_id: string | null;
    }>(
      `SELECT gl.grn_id, gl.sku_id, gl.batch_id, gl.qty_accepted,
              (SELECT to_location_id FROM stock_movements
               WHERE reference_type='grn' AND reference_id=gl.grn_id
                 AND sku_id=gl.sku_id AND movement_type='grn_receipt' LIMIT 1
              ) AS receiving_location_id
       FROM grn_lines gl WHERE gl.id = $1`,
      [body.grn_line_id],
    );

    if ((lineResult.rowCount ?? 0) === 0) {
      res.status(404).json({ error: 'GRN line not found' });
      return;
    }

    const line = lineResult.rows[0]!;

    const movement = await writeStockMovement({
      idempotencyKey: body.idempotency_key,
      skuId: line.sku_id,
      batchId: line.batch_id,
      fromLocationId: line.receiving_location_id,
      toLocationId: body.destination_location_id,
      quantity: line.qty_accepted,
      movementType: 'putaway',
      referenceType: 'grn',
      referenceId: line.grn_id,
      userId: req.auth!.userId,
      deviceId: req.auth!.deviceId,
    });

    res.json({ movement_id: String(movement.movementId), message: 'Putaway confirmed' });
  },
);

// GET /putaway/suggest?sku_id=&site_id= — suggest bin based on SKU ABC class
router.get(
  '/suggest',
  requireAuth,
  validate({
    query: z.object({
      sku_id: z.string().uuid(),
      site_id: z.string().uuid(),
    }),
  }),
  async (req, res) => {
    const q = req.query as unknown as { sku_id: string; site_id: string };

    const sku = await db.query.skus.findFirst({ where: eq(skus.id, q.sku_id) });
    if (!sku) {
      res.status(404).json({ error: 'SKU not found' });
      return;
    }

    // A-class: pick_face first, then bin; B/C: bin
    const preferredTypes =
      sku.abc_class === 'A' ? ['pick_face', 'bin'] : ['bin'];

    // Find a location with existing stock for this SKU (consolidate)
    const existingResult = await pool.query<{
      location_id: string;
      location_code: string;
      location_type: string;
      quantity: number;
    }>(
      `SELECT soh.location_id, l.code AS location_code, l.type AS location_type, soh.quantity
       FROM stock_on_hand soh
       JOIN locations l ON l.id = soh.location_id
       WHERE soh.sku_id = $1
         AND l.site_id  = $2
         AND l.type = ANY($3::location_type[])
         AND l.is_active = TRUE
       ORDER BY soh.quantity DESC
       LIMIT 1`,
      [q.sku_id, q.site_id, preferredTypes],
    );

    if ((existingResult.rowCount ?? 0) > 0) {
      const row = existingResult.rows[0]!;
      res.json({
        suggestion: 'consolidate',
        location_id: row.location_id,
        location_code: row.location_code,
        location_type: row.location_type,
        current_qty: row.quantity,
      });
      return;
    }

    // Find an empty location of the preferred type
    const emptyResult = await pool.query<{
      location_id: string;
      location_code: string;
      location_type: string;
    }>(
      `SELECT l.id AS location_id, l.code AS location_code, l.type AS location_type
       FROM locations l
       WHERE l.site_id  = $1
         AND l.type = ANY($2::location_type[])
         AND l.is_active = TRUE
         AND NOT EXISTS (
           SELECT 1 FROM stock_on_hand soh WHERE soh.location_id = l.id
         )
       ORDER BY l.code ASC
       LIMIT 1`,
      [q.site_id, preferredTypes],
    );

    if ((emptyResult.rowCount ?? 0) > 0) {
      const row = emptyResult.rows[0]!;
      res.json({
        suggestion: 'empty_bin',
        location_id: row.location_id,
        location_code: row.location_code,
        location_type: row.location_type,
        current_qty: 0,
      });
      return;
    }

    res.json({ suggestion: null, message: 'No suitable location found for this SKU' });
  },
);

export default router;
