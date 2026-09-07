import { Router } from 'express';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { pool } from '../db/index.js';
import { shippingManifests } from '../db/schema/index.js';
import { writeStockMovement } from '../services/stock-movement.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// ── List manifests ────────────────────────────────────────────────────────────

router.get(
  '/manifests',
  requireAuth,
  validate({
    query: z.object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      status: z.string().optional(),
      order_id: z.string().optional(),
    }),
  }),
  async (req, res) => {
    const q = req.query as unknown as {
      page: number;
      limit: number;
      status?: string;
      order_id?: string;
    };

    const offset = (q.page - 1) * q.limit;

    const statusFilter = q.status ? `AND shipping_status = $3` : '';
    const orderFilter = q.order_id
      ? `AND order_id = $${q.status ? 4 : 3}`
      : '';

    const params: unknown[] = [q.limit, offset];
    if (q.status) params.push(q.status);
    if (q.order_id) params.push(q.order_id);

    const result = await pool.query(
      `SELECT * FROM shipping_manifests
       WHERE 1=1 ${statusFilter} ${orderFilter}
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      params,
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM shipping_manifests
       WHERE 1=1 ${statusFilter} ${orderFilter}`,
      params.slice(2),
    );

    const total = Number(countResult.rows[0]?.count ?? 0);
    res.json({
      data: result.rows,
      meta: {
        page: q.page,
        limit: q.limit,
        total,
        pages: Math.ceil(total / q.limit),
      },
    });
  },
);

// ── Get manifest by AWB ───────────────────────────────────────────────────────

router.get(
  '/manifests/:awb',
  requireAuth,
  validate({ params: z.object({ awb: z.string().min(1) }) }),
  async (req, res) => {
    const result = await pool.query(
      `SELECT * FROM shipping_manifests WHERE awb_number = $1`,
      [req.params['awb']],
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Manifest not found' });
      return;
    }

    res.json(result.rows[0]);
  },
);

// ── Create manifest ───────────────────────────────────────────────────────────

router.post(
  '/manifests',
  requireAuth,
  validate({
    body: z.object({
      awb_number: z.string().min(1).max(50),
      order_id: z.string().max(50).optional(),
      courier_partner: z.string().max(30).optional(),
      shipping_status: z.string().max(30).default('DISPATCHED'),
      item_payload: z.array(z.any()).optional(),
      pick_list_id: z.string().uuid().optional(),
    }),
  }),
  async (req, res) => {
    const body = req.body as {
      awb_number: string;
      order_id?: string;
      courier_partner?: string;
      shipping_status: string;
      item_payload?: unknown[];
      pick_list_id?: string;
    };

    const [manifest] = await db
      .insert(shippingManifests)
      .values({
        awb_number: body.awb_number,
        order_id: body.order_id ?? null,
        courier_partner: body.courier_partner ?? null,
        shipping_status: body.shipping_status,
        item_payload: body.item_payload ?? null,
        pick_list_id: body.pick_list_id ?? null,
      })
      .returning();

    res.status(201).json(manifest);
  },
);

// ── Inbound courier webhook (no auth — called by courier) ─────────────────────

router.post(
  '/webhook',
  validate({
    body: z.object({
      awb_number: z.string().min(1).max(50),
      status: z.string().min(1).max(30),
      order_id: z.string().max(50).optional(),
      courier_partner: z.string().max(30).optional(),
      items: z
        .array(
          z.object({
            sku_id: z.string().uuid(),
            qty: z.number().int().positive(),
            batch_id: z.string().uuid().optional(),
          }),
        )
        .optional(),
    }),
  }),
  async (req, res) => {
    const body = req.body as {
      awb_number: string;
      status: string;
      order_id?: string;
      courier_partner?: string;
      items?: { sku_id: string; qty: number; batch_id?: string }[];
    };

    // Upsert the manifest record
    await pool.query(
      `INSERT INTO shipping_manifests (awb_number, order_id, courier_partner, shipping_status, item_payload)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (awb_number) DO UPDATE
         SET shipping_status = EXCLUDED.shipping_status,
             order_id = COALESCE(EXCLUDED.order_id, shipping_manifests.order_id),
             courier_partner = COALESCE(EXCLUDED.courier_partner, shipping_manifests.courier_partner),
             item_payload = COALESCE(EXCLUDED.item_payload, shipping_manifests.item_payload),
             updated_at = NOW()`,
      [
        body.awb_number,
        body.order_id ?? null,
        body.courier_partner ?? null,
        body.status,
        body.items ? JSON.stringify(body.items) : null,
      ],
    );

    // Auto-restock on RTO_RECEIVED
    if (body.status === 'RTO_RECEIVED' && body.items && body.items.length > 0) {
      // Find a usable bin location
      const locResult = await pool.query<{ id: string }>(
        `SELECT id FROM locations WHERE type != 'quarantine' AND type != 'receiving' AND type != 'dispatch' LIMIT 1`,
      );

      if (locResult.rowCount === 0) {
        // No suitable location found — leave processed_at null and warn
        res.json({
          ok: true,
          warning: 'RTO received but no suitable bin location found for restock; processed_at not set',
        });
        return;
      }

      const locationId = locResult.rows[0]!.id;

      for (const item of body.items) {
        await writeStockMovement({
          idempotencyKey: `rto-${body.awb_number}-${item.sku_id}`,
          skuId: item.sku_id,
          batchId: item.batch_id ?? null,
          toLocationId: locationId,
          quantity: item.qty,
          movementType: 'rto_receipt',
          referenceType: null,
          referenceId: null,
          notes: `RTO restock from AWB ${body.awb_number}`,
        });
      }

      await pool.query(
        `UPDATE shipping_manifests SET processed_at = NOW(), updated_at = NOW() WHERE awb_number = $1`,
        [body.awb_number],
      );
    }

    res.json({ ok: true });
  },
);

// ── Manual RTO trigger ────────────────────────────────────────────────────────

router.post(
  '/manifests/:awb/process-rto',
  requireAuth,
  validate({ params: z.object({ awb: z.string().min(1) }) }),
  async (req, res) => {
    const awb = req.params['awb'] as string;

    const result = await pool.query<{
      awb_number: string;
      item_payload: { sku_id: string; qty: number; batch_id?: string }[] | null;
      processed_at: Date | null;
    }>(
      `SELECT awb_number, item_payload, processed_at FROM shipping_manifests WHERE awb_number = $1`,
      [awb],
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Manifest not found' });
      return;
    }

    const manifest = result.rows[0]!;

    if (manifest.processed_at) {
      res.status(409).json({ error: 'RTO already processed', processed_at: manifest.processed_at });
      return;
    }

    const items = manifest.item_payload;
    if (!items || items.length === 0) {
      res.status(400).json({ error: 'No items in manifest to restock' });
      return;
    }

    const locResult = await pool.query<{ id: string }>(
      `SELECT id FROM locations WHERE type != 'quarantine' AND type != 'receiving' AND type != 'dispatch' LIMIT 1`,
    );

    if (locResult.rowCount === 0) {
      res.json({
        ok: false,
        warning: 'No suitable bin location found for restock; processed_at not set',
      });
      return;
    }

    const locationId = locResult.rows[0]!.id;

    for (const item of items) {
      await writeStockMovement({
        idempotencyKey: `rto-manual-${awb}-${item.sku_id}`,
        skuId: item.sku_id,
        batchId: item.batch_id ?? null,
        toLocationId: locationId,
        quantity: item.qty,
        movementType: 'rto_receipt',
        referenceType: null,
        referenceId: null,
        notes: `Manual RTO restock from AWB ${awb}`,
      });
    }

    await pool.query(
      `UPDATE shipping_manifests SET processed_at = NOW(), shipping_status = 'RTO_RECEIVED', updated_at = NOW() WHERE awb_number = $1`,
      [awb],
    );

    res.json({ ok: true, awb_number: awb, items_restocked: items.length });
  },
);

export default router;
