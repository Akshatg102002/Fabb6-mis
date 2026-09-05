import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { gtins, skus } from '../db/schema/index.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createGtinSchema, linkGtinSchema, barcodeQuerySchema } from '../schemas/catalogue.js';
import { z } from 'zod';

const router = Router();

// GET /gtins/lookup?barcode=...
// Used by scanners to look up a SKU from a barcode
router.get(
  '/lookup',
  requireAuth,
  validate({ query: barcodeQuerySchema }),
  async (req, res) => {
    const { barcode } = req.query as { barcode: string };

    const gtin = await db.query.gtins.findFirst({
      where: eq(gtins.barcode, barcode),
    });

    if (!gtin) {
      res.status(404).json({ error: 'Barcode not found', barcode });
      return;
    }

    const sku = await db.query.skus.findFirst({
      where: eq(skus.id, gtin.sku_id),
    });

    if (!sku) {
      res.status(404).json({ error: 'SKU linked to barcode not found' });
      return;
    }

    res.json({ gtin, sku });
  },
);

// GET /gtins/sku/:skuId — list all barcodes for a SKU
router.get('/sku/:skuId', requireAuth, async (req, res) => {
  const skuId = req.params['skuId']!;

  const sku = await db.query.skus.findFirst({ where: eq(skus.id, skuId) });
  if (!sku) {
    res.status(404).json({ error: 'SKU not found' });
    return;
  }

  const rows = await db.select().from(gtins).where(eq(gtins.sku_id, skuId));
  res.json(rows);
});

// POST /gtins — create a new GTIN mapping
router.post(
  '/',
  requireAuth,
  requireRoles('admin', 'supervisor', 'inward'),
  validate({ body: createGtinSchema }),
  async (req, res) => {
    const body = req.body as {
      barcode: string;
      sku_id: string;
      source: 'supplier' | 'manual' | 'shopify' | 'scan';
      is_primary: boolean;
    };

    // Check if barcode already exists
    const existing = await db.query.gtins.findFirst({
      where: eq(gtins.barcode, body.barcode),
    });

    if (existing) {
      res.status(409).json({
        error: 'Barcode already exists',
        linked_sku_id: existing.sku_id,
        barcode: body.barcode,
      });
      return;
    }

    // If is_primary, demote existing primary
    if (body.is_primary) {
      await db
        .update(gtins)
        .set({ is_primary: false })
        .where(and(eq(gtins.sku_id, body.sku_id), eq(gtins.is_primary, true)));
    }

    const [gtin] = await db.insert(gtins).values(body).returning();
    res.status(201).json(gtin);
  },
);

// PATCH /gtins/:id/link — reassign a barcode to a different SKU
router.patch(
  '/:id/link',
  requireAuth,
  requireRoles('admin', 'supervisor'),
  validate({ body: linkGtinSchema }),
  async (req, res) => {
    const { sku_id, is_primary } = req.body as { sku_id: string; is_primary?: boolean };
    const gtinId = req.params['id']!;

    const existing = await db.query.gtins.findFirst({
      where: eq(gtins.id, gtinId),
    });

    if (!existing) {
      res.status(404).json({ error: 'GTIN not found' });
      return;
    }

    const updates: Partial<typeof gtins.$inferInsert> = { sku_id };
    if (is_primary !== undefined) {
      updates.is_primary = is_primary;
      if (is_primary) {
        await db
          .update(gtins)
          .set({ is_primary: false })
          .where(and(eq(gtins.sku_id, sku_id), eq(gtins.is_primary, true)));
      }
    }

    const [updated] = await db.update(gtins).set(updates).where(eq(gtins.id, gtinId)).returning();
    res.json(updated);
  },
);

// DELETE /gtins/:id
router.delete('/:id', requireAuth, requireRoles('admin', 'supervisor'), async (req, res) => {
  const existing = await db.query.gtins.findFirst({
    where: eq(gtins.id, req.params['id']!),
  });

  if (!existing) {
    res.status(404).json({ error: 'GTIN not found' });
    return;
  }

  await db.delete(gtins).where(eq(gtins.id, req.params['id']!));
  res.status(204).send();
});

export default router;
