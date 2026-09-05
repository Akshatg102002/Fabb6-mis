import { Router } from 'express';
import { eq, and, ilike, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { locations, sites } from '../db/schema/index.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  createLocationSchema,
  updateLocationSchema,
  locationQuerySchema,
  createSiteSchema,
  updateSiteSchema,
} from '../schemas/locations.js';
import { z } from 'zod';

const router = Router();

// GET /locations
router.get(
  '/',
  requireAuth,
  validate({ query: locationQuerySchema }),
  async (req, res) => {
    const q = req.query as {
      page: number;
      limit: number;
      site_id?: string;
      type?: string;
      is_active?: boolean;
    };

    const conditions = [];
    if (q.site_id) conditions.push(eq(locations.site_id, q.site_id));
    if (q.type) conditions.push(eq(locations.type, q.type as typeof locations.type.column._.data));
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
  },
);

// GET /locations/:id
router.get(
  '/:id',
  requireAuth,
  validate({ params: z.object({ id: z.string().uuid() }) }),
  async (req, res) => {
    const location = await db.query.locations.findFirst({
      where: eq(locations.id, req.params['id']!),
    });
    if (!location) {
      res.status(404).json({ error: 'Location not found' });
      return;
    }
    res.json(location);
  },
);

// POST /locations (admin)
router.post(
  '/',
  requireAuth,
  requireRoles('admin'),
  validate({ body: createLocationSchema }),
  async (req, res) => {
    const body = req.body as {
      site_id: string;
      code: string;
      type: typeof locations.type.column._.data;
      aisle?: string;
      rack?: string;
      shelf?: string;
      position?: string;
      capacity_units?: number;
      is_active: boolean;
    };

    const siteExists = await db.query.sites.findFirst({ where: eq(sites.id, body.site_id) });
    if (!siteExists) {
      res.status(404).json({ error: 'Site not found' });
      return;
    }

    const [created] = await db.insert(locations).values(body).returning();
    res.status(201).json(created);
  },
);

// PUT /locations/:id (admin)
router.put(
  '/:id',
  requireAuth,
  requireRoles('admin'),
  validate({ params: z.object({ id: z.string().uuid() }), body: updateLocationSchema }),
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

// ── Sites sub-routes ──────────────────────────────────────────────────────────

// GET /sites
router.get('/sites', requireAuth, async (_req, res) => {
  const rows = await db.select().from(sites).orderBy(sites.name);
  res.json({ data: rows });
});

// POST /sites (admin)
router.post(
  '/sites',
  requireAuth,
  requireRoles('admin'),
  validate({ body: createSiteSchema }),
  async (req, res) => {
    const [created] = await db.insert(sites).values(req.body as typeof sites.$inferInsert).returning();
    res.status(201).json(created);
  },
);

// PUT /sites/:id (admin)
router.put(
  '/sites/:id',
  requireAuth,
  requireRoles('admin'),
  validate({ params: z.object({ id: z.string().uuid() }), body: updateSiteSchema }),
  async (req, res) => {
    const existing = await db.query.sites.findFirst({ where: eq(sites.id, req.params['id']!) });
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

export default router;
