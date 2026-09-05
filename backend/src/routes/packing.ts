import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { pool } from '../db/index.js';
import { db } from '../db/index.js';
import { pickLists } from '../db/schema/index.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { writeStockMovement } from '../services/stock-movement.js';
import { z } from 'zod';

const router = Router();

// POST /packing/scan-tote — { tote_id } returns the pick list for a tote
router.post(
  '/scan-tote',
  requireAuth,
  requireRoles('packer', 'supervisor', 'admin'),
  validate({
    body: z.object({
      tote_id: z.string().min(1).max(100),
    }),
  }),
  async (req, res) => {
    const { tote_id } = req.body as { tote_id: string };

    // tote_id maps to order_ref on pick lines (totes carry order packs)
    const result = await pool.query<{
      pick_list_id: string;
      status: string;
      site_id: string;
      channel: string;
      lines: unknown;
    }>(
      `SELECT
         pl.id       AS pick_list_id,
         pl.status,
         pl.site_id,
         pl.channel,
         JSON_AGG(JSON_BUILD_OBJECT(
           'line_id',      pln.id,
           'order_ref',    pln.order_ref,
           'sku_id',       pln.sku_id,
           'sku_code',     s.code,
           'sku_name',     s.name,
           'batch_id',     pln.batch_id,
           'batch_number', b.batch_number,
           'qty_required', pln.qty_required,
           'qty_picked',   pln.qty_picked
         ) ORDER BY pln.line_number) AS lines
       FROM pick_lists pl
       JOIN pick_lines pln ON pln.pick_list_id = pl.id
       JOIN skus       s   ON s.id  = pln.sku_id
       LEFT JOIN batches    b   ON b.id  = pln.batch_id
       WHERE pln.order_ref = $1
         AND pl.status     = 'picked'
       GROUP BY pl.id, pl.status, pl.site_id, pl.channel
       LIMIT 1`,
      [tote_id],
    );

    if ((result.rowCount ?? 0) === 0) {
      res.status(404).json({ error: 'No picked pick list found for this tote' });
      return;
    }

    res.json(result.rows[0]);
  },
);

// POST /packing/confirm-item
router.post(
  '/confirm-item',
  requireAuth,
  requireRoles('packer', 'supervisor', 'admin'),
  validate({
    body: z.object({
      pick_list_id: z.string().uuid(),
      sku_id: z.string().uuid(),
      qty: z.number().int().positive(),
      batch_id: z.string().uuid().optional(),
      idempotency_key: z.string().min(1).max(128),
    }),
  }),
  async (req, res) => {
    const body = req.body as {
      pick_list_id: string;
      sku_id: string;
      qty: number;
      batch_id?: string;
      idempotency_key: string;
    };

    const pickList = await db.query.pickLists.findFirst({
      where: eq(pickLists.id, body.pick_list_id),
    });
    if (!pickList) {
      res.status(404).json({ error: 'Pick list not found' });
      return;
    }

    // Find a pack staging or dispatch location for this site
    const locResult = await pool.query<{ id: string }>(
      `SELECT id FROM locations WHERE site_id = $1 AND type = 'dispatch' AND is_active = TRUE LIMIT 1`,
      [pickList.site_id],
    );
    const packLocationId = locResult.rows[0]?.id ?? null;

    const movement = await writeStockMovement({
      idempotencyKey: body.idempotency_key,
      skuId: body.sku_id,
      batchId: body.batch_id ?? null,
      toLocationId: packLocationId,
      quantity: body.qty,
      movementType: 'pack_confirm',
      referenceType: 'pick_list',
      referenceId: body.pick_list_id,
      userId: req.auth!.userId,
      deviceId: req.auth!.deviceId,
    });

    res.json({ movement_id: String(movement.movementId), message: 'Item confirmed for packing' });
  },
);

// POST /packing/dispatch
router.post(
  '/dispatch',
  requireAuth,
  requireRoles('packer', 'supervisor', 'admin'),
  validate({
    body: z.object({
      pick_list_id: z.string().uuid(),
      courier_awb: z.string().min(1).max(100),
      weight_grams: z.number().int().positive().optional(),
      idempotency_key: z.string().min(1).max(128),
    }),
  }),
  async (req, res) => {
    const body = req.body as {
      pick_list_id: string;
      courier_awb: string;
      weight_grams?: number;
      idempotency_key: string;
    };

    const pickList = await db.query.pickLists.findFirst({
      where: eq(pickLists.id, body.pick_list_id),
    });
    if (!pickList) {
      res.status(404).json({ error: 'Pick list not found' });
      return;
    }
    if (pickList.status !== 'packed' && pickList.status !== 'picked') {
      res.status(409).json({
        error: `Pick list must be packed or picked before dispatch (current: ${pickList.status})`,
      });
      return;
    }

    // Get all lines to dispatch
    const linesResult = await pool.query<{
      sku_id: string;
      batch_id: string | null;
      qty_picked: number;
      location_id: string | null;
    }>(
      `SELECT sku_id, batch_id, qty_picked, location_id FROM pick_lines WHERE pick_list_id = $1`,
      [body.pick_list_id],
    );

    // Find dispatch location
    const dispatchLocResult = await pool.query<{ id: string }>(
      `SELECT id FROM locations WHERE site_id = $1 AND type = 'dispatch' AND is_active = TRUE LIMIT 1`,
      [pickList.site_id],
    );
    const dispatchLocationId = dispatchLocResult.rows[0]?.id ?? null;

    // Write a dispatch movement for each line
    for (const line of linesResult.rows) {
      if (line.qty_picked > 0) {
        await writeStockMovement({
          idempotencyKey: `${body.idempotency_key}-${line.sku_id}-${line.batch_id ?? 'null'}`,
          skuId: line.sku_id,
          batchId: line.batch_id,
          fromLocationId: dispatchLocationId ?? line.location_id,
          quantity: line.qty_picked,
          movementType: 'dispatch',
          referenceType: 'pick_list',
          referenceId: body.pick_list_id,
          notes: `AWB: ${body.courier_awb}`,
          userId: req.auth!.userId,
          deviceId: req.auth!.deviceId,
        });
      }
    }

    // Update pick list status
    await db
      .update(pickLists)
      .set({ status: 'dispatched', completed_at: new Date() })
      .where(eq(pickLists.id, body.pick_list_id));

    res.json({
      message: 'Dispatched successfully',
      pick_list_id: body.pick_list_id,
      courier_awb: body.courier_awb,
      weight_grams: body.weight_grams,
    });
  },
);

export default router;
