import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { gtins, skus } from '../db/schema/index.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createGtinSchema, barcodeQuerySchema } from '../schemas/catalogue.js';
import { z } from 'zod';

const router = Router();

// GET /gtins/lookup?barcode= — resolve a barcode to its SKU
router.get(
  '/lookup',
  requireAuth,
  validate({ query: barcodeQuerySchema }),
  async (req, res) => {
    const { barcode } = req.query as { barcode: string };

    const gtin = await db.query.gtins.findFirst({
      where: eq(gtins.barcode, barcode),
      with: { sku_id: false } as never,
    });

    // Use raw query to get joined SKU
    const row = await db.query.gtins.findFirst({
      where: eq(gtins.barcode, barcode),
    });

    if (!row) {
      res.json({ found: false, barcode });
      return;
    }

    const sku = await db.query.skus.findFirst({
      where: eq(skus.id, row.sku_id),
    });

    res.json({ found: true, gtin: row, sku });
  },
);

// POST /gtins — link a barcode to a SKU (inward role minimum)
router.post(
  '/',
  requireAuth,
  requireRoles('inward', 'supervisor', 'admin'),
  validate({ body: createGtinSchema }),
  async (req, res) => {
    const body = req.body as {
      barcode: string;
      sku_id: string;
      source: 'supplier' | 'manual' | 'shopify' | 'scan';
      is_primary: boolean;
    };

    const skuExists = await db.query.skus.findFirst({
      where: eq(skus.id, body.sku_id),
    });
    if (!skuExists) {
      res.status(404).json({ error: 'SKU not found' });
      return;
    }

    const existing = await db.query.gtins.findFirst({
      where: eq(gtins.barcode, body.barcode),
    });
    if (existing) {
      res.status(409).json({ error: 'Barcode already registered', gtin: existing });
      return;
    }

    // If setting as primary, clear existing primary for the SKU
    if (body.is_primary) {
      await db
        .update(gtins)
        .set({ is_primary: false })
        .where(eq(gtins.sku_id, body.sku_id));
    }

    const [created] = await db.insert(gtins).values(body).returning();

    res.status(201).json(created);
  },
);

// DELETE /gtins/:barcode — remove a barcode mapping (admin only)
router.delete(
  '/:barcode',
  requireAuth,
  requireRoles('admin'),
  validate({ params: z.object({ barcode: z.string().min(1).max(50) }) }),
  async (req, res) => {
    const { barcode } = req.params as { barcode: string };

    const existing = await db.query.gtins.findFirst({
      where: eq(gtins.barcode, barcode),
    });
    if (!existing) {
      res.status(404).json({ error: 'Barcode not found' });
      return;
    }

    await db.delete(gtins).where(eq(gtins.barcode, barcode));
    res.status(204).send();
  },
);

export default router;
