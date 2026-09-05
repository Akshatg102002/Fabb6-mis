import { Router } from 'express';
import { eq, ilike, and, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { skus } from '../db/schema/index.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idempotency } from '../middleware/idempotency.js';
import { createSkuSchema, updateSkuSchema, skuQuerySchema } from '../schemas/catalogue.js';

const router = Router();

// GET /skus
router.get('/', requireAuth, validate({ query: skuQuerySchema }), async (req, res) => {
  const q = req.query as {
    page: number;
    limit: number;
    search?: string;
    brand_id?: string;
    category_id?: string;
    abc_class?: 'A' | 'B' | 'C';
    is_active?: boolean;
  };

  const conditions = [];
  if (q.search) conditions.push(ilike(skus.name, `%${q.search}%`));
  if (q.brand_id) conditions.push(eq(skus.brand_id, q.brand_id));
  if (q.category_id) conditions.push(eq(skus.category_id, q.category_id));
  if (q.abc_class) conditions.push(eq(skus.abc_class, q.abc_class));
  if (q.is_active !== undefined) conditions.push(eq(skus.is_active, q.is_active));

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const offset = (q.page - 1) * q.limit;

  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(skus)
      .where(where)
      .limit(q.limit)
      .offset(offset)
      .orderBy(skus.code),
    db
      .select({ count: sql<number>`count(*)` })
      .from(skus)
      .where(where),
  ]);

  const total = Number(countResult[0]?.count ?? 0);

  res.json({
    data: rows,
    meta: {
      page: q.page,
      limit: q.limit,
      total,
      pages: Math.ceil(total / q.limit),
    },
  });
});

// GET /skus/:id
router.get('/:id', requireAuth, async (req, res) => {
  const sku = await db.query.skus.findFirst({
    where: eq(skus.id, req.params['id']!),
  });

  if (!sku) {
    res.status(404).json({ error: 'SKU not found' });
    return;
  }

  res.json(sku);
});

// POST /skus
router.post(
  '/',
  requireAuth,
  requireRoles('admin', 'supervisor'),
  idempotency,
  validate({ body: createSkuSchema }),
  async (req, res) => {
    const body = req.body as {
      code: string;
      name: string;
      brand_id?: string;
      category_id?: string;
      hsn_code?: string;
      gst_rate: number;
      mrp?: number;
      standard_cost?: number;
      pack_size: number;
      uom: string;
      shelf_life_tracked: boolean;
      min_shelf_life_days?: number;
      abc_class: 'A' | 'B' | 'C';
      is_active: boolean;
    };

    const [sku] = await db
      .insert(skus)
      .values({
        ...body,
        gst_rate: String(body.gst_rate),
        mrp: body.mrp ? String(body.mrp) : null,
        standard_cost: body.standard_cost ? String(body.standard_cost) : null,
      })
      .returning();

    res.status(201).json(sku);
  },
);

// PATCH /skus/:id
router.patch(
  '/:id',
  requireAuth,
  requireRoles('admin', 'supervisor'),
  validate({ body: updateSkuSchema }),
  async (req, res) => {
    const existing = await db.query.skus.findFirst({
      where: eq(skus.id, req.params['id']!),
    });

    if (!existing) {
      res.status(404).json({ error: 'SKU not found' });
      return;
    }

    const body = req.body as {
      gst_rate?: number;
      mrp?: number;
      standard_cost?: number;
      [key: string]: unknown;
    };

    const updates: Record<string, unknown> = { ...body };
    if (body.gst_rate !== undefined) updates['gst_rate'] = String(body.gst_rate);
    if (body.mrp !== undefined) updates['mrp'] = body.mrp ? String(body.mrp) : null;
    if (body.standard_cost !== undefined)
      updates['standard_cost'] = body.standard_cost ? String(body.standard_cost) : null;

    const [updated] = await db
      .update(skus)
      .set(updates)
      .where(eq(skus.id, req.params['id']!))
      .returning();

    res.json(updated);
  },
);

// DELETE /skus/:id (soft delete)
router.delete('/:id', requireAuth, requireRoles('admin'), async (req, res) => {
  const existing = await db.query.skus.findFirst({
    where: eq(skus.id, req.params['id']!),
  });

  if (!existing) {
    res.status(404).json({ error: 'SKU not found' });
    return;
  }

  await db.update(skus).set({ is_active: false }).where(eq(skus.id, req.params['id']!));

  res.status(204).send();
});

export default router;
