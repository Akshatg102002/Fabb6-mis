import { Router } from 'express';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sites, locations } from '../db/schema/index.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  createSiteSchema,
  updateSiteSchema,
  createLocationSchema,
  updateLocationSchema,
  locationQuerySchema,
} from '../schemas/locations.js';

const router = Router();

// ─── Sites ────────────────────────────────────────────────

// GET /locations/sites
router.get('/sites', requireAuth, async (_req, res) => {
  const rows = await db.select().from(sites).orderBy(sites.name);
  res.json(rows);
});

// GET /locations/sites/:id
router.get('/sites/:id', requireAuth, async (req, res) => {
  const site = await db.query.sites.findFirst({
    where: eq(sites.id, req.params['id']!),
  });
  if (!site) {
    res.status(404).json({ error: 'Site not found' });
    return;
  }
  res.json(site);
});

// POST /locations/sites
router.post(
  '/sites',
  requireAuth,
  requireRoles('admin'),
  validate({ body: createSiteSchema }),
  async (req, res) => {
    const [site] = await db.insert(sites).values(req.body as typeof sites.$inferInsert).returning();
    res.status(201).json(site);
  },
);

// PATCH /locations/sites/:id
router.patch(
  '/sites/:id',
  requireAuth,
  requireRoles('admin'),
  validate({ body: updateSiteSchema }),
  async (req, res) => {
    const existing = await db.query.sites.findFirst({
      where: eq(sites.id, req.params['id']!),
    });
    if (!existing) {
      res.status(404).json({ error: 'Site not found' });
      return;
    }
    const [updated] = await db
      .update(sites)
      .set(req.body as Partial<typeof sites.$inferInsert>)
      .where(eq(sites.id, req.params['id']!))
      .returning();
    res.json(updated);
  },
);

// ─── Locations ────────────────────────────────────────────

// GET /locations
router.get('/', requireAuth, validate({ query: locationQuerySchema }), async (req, res) => {
  const q = req.query as {
    page: number;
    limit: number;
    site_id?: string;
    type?: string;
    is_active?: boolean;
  };

  const conditions = [];
  if (q.site_id) conditions.push(eq(locations.site_id, q.site_id));
  if (q.type) conditions.push(eq(locations.type, q.type as typeof locations.type._.data));
  if (q.is_active !== undefined) conditions.push(eq(locations.is_active, q.is_active));

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const offset = (q.page - 1) * q.limit;

  const [rows, countResult] = await Promise.all([
    db.select().from(locations).where(where).limit(q.limit).offset(offset).orderBy(locations.code),
    db.select({ count: sql<number>`count(*)` }).from(locations).where(where),
  ]);

  const total = Number(countResult[0]?.count ?? 0);
  res.json({
    data: rows,
    meta: { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) },
  });
});

// GET /locations/:id
router.get('/:id', requireAuth, async (req, res) => {
  const location = await db.query.locations.findFirst({
    where: eq(locations.id, req.params['id']!),
  });
  if (!location) {
    res.status(404).json({ error: 'Location not found' });
    return;
  }
  res.json(location);
});

// POST /locations
router.post(
  '/',
  requireAuth,
  requireRoles('admin', 'supervisor'),
  validate({ body: createLocationSchema }),
  async (req, res) => {
    const [location] = await db
      .insert(locations)
      .values(req.body as typeof locations.$inferInsert)
      .returning();
    res.status(201).json(location);
  },
);

// PATCH /locations/:id
router.patch(
  '/:id',
  requireAuth,
  requireRoles('admin', 'supervisor'),
  validate({ body: updateLocationSchema }),
  async (req, res) => {
    const existing = await db.query.locations.findFirst({
      where: eq(locations.id, req.params['id']!),
    });
    if (!existing) {
      res.status(404).json({ error: 'Location not found' });
      return;
    }
    const [updated] = await db
      .update(locations)
      .set(req.body as Partial<typeof locations.$inferInsert>)
      .where(eq(locations.id, req.params['id']!))
      .returning();
    res.json(updated);
  },
);

// DELETE /locations/:id (soft delete)
router.delete('/:id', requireAuth, requireRoles('admin'), async (req, res) => {
  const existing = await db.query.locations.findFirst({
    where: eq(locations.id, req.params['id']!),
  });
  if (!existing) {
    res.status(404).json({ error: 'Location not found' });
    return;
  }
  await db
    .update(locations)
    .set({ is_active: false })
    .where(eq(locations.id, req.params['id']!));
  res.status(204).send();
});

export default router;
