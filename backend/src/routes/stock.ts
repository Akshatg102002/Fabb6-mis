import { Router } from 'express';
import { pool } from '../db/index.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { stockQuerySchema, movementQuerySchema } from '../schemas/stock.js';
import { z } from 'zod';

const router = Router();

// GET /stock/on-hand
router.get(
  '/on-hand',
  requireAuth,
  validate({ query: stockQuerySchema }),
  async (req, res) => {
    const q = req.query as unknown as {
      page: number;
      limit: number;
      site_id?: string;
      sku_id?: string;
      location_id?: string;
      batch_id?: string;
      include_empty: boolean;
    };

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (q.sku_id) {
      conditions.push(`soh.sku_id = $${idx++}`);
      params.push(q.sku_id);
    }
    if (q.location_id) {
      conditions.push(`soh.location_id = $${idx++}`);
      params.push(q.location_id);
    }
    if (q.batch_id) {
      conditions.push(`soh.batch_id = $${idx++}`);
      params.push(q.batch_id);
    }
    if (q.site_id) {
      conditions.push(`l.site_id = $${idx++}`);
      params.push(q.site_id);
    }
    if (!q.include_empty) {
      conditions.push('soh.quantity > 0');
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (q.page - 1) * q.limit;

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT
           soh.sku_id,
           soh.batch_id,
           soh.location_id,
           soh.quantity,
           s.code       AS sku_code,
           s.name       AS sku_name,
           s.uom,
           b.batch_number,
           b.expiry_date,
           l.code       AS location_code,
           l.type       AS location_type,
           l.site_id
         FROM stock_on_hand soh
         JOIN skus      s ON s.id = soh.sku_id
         LEFT JOIN batches   b ON b.id = soh.batch_id
         JOIN locations l ON l.id = soh.location_id
         ${where}
         ORDER BY s.code, l.code
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, q.limit, offset],
      ),
      pool.query(
        `SELECT COUNT(*) AS total
         FROM stock_on_hand soh
         JOIN locations l ON l.id = soh.location_id
         ${where}`,
        params,
      ),
    ]);

    const total = Number(countResult.rows[0]?.total ?? 0);
    res.json({
      data: dataResult.rows,
      meta: { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) },
    });
  },
);

// GET /stock/movements
router.get(
  '/movements',
  requireAuth,
  validate({ query: movementQuerySchema }),
  async (req, res) => {
    const q = req.query as unknown as {
      page: number;
      limit: number;
      sku_id?: string;
      location_id?: string;
      movement_type?: string;
      from_date?: string;
      to_date?: string;
    };

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (q.sku_id) {
      conditions.push(`sm.sku_id = $${idx++}`);
      params.push(q.sku_id);
    }
    if (q.location_id) {
      conditions.push(
        `(sm.from_location_id = $${idx} OR sm.to_location_id = $${idx})`,
      );
      params.push(q.location_id);
      idx++;
    }
    if (q.movement_type) {
      conditions.push(`sm.movement_type = $${idx++}`);
      params.push(q.movement_type);
    }
    if (q.from_date) {
      conditions.push(`sm.created_at >= $${idx++}`);
      params.push(q.from_date);
    }
    if (q.to_date) {
      conditions.push(`sm.created_at <= $${idx++}`);
      params.push(q.to_date);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (q.page - 1) * q.limit;

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT
           sm.*,
           s.code  AS sku_code,
           s.name  AS sku_name,
           b.batch_number,
           fl.code AS from_location_code,
           tl.code AS to_location_code,
           u.name  AS user_name
         FROM stock_movements sm
         JOIN skus      s  ON s.id  = sm.sku_id
         LEFT JOIN batches   b  ON b.id  = sm.batch_id
         LEFT JOIN locations fl ON fl.id = sm.from_location_id
         LEFT JOIN locations tl ON tl.id = sm.to_location_id
         LEFT JOIN users     u  ON u.id  = sm.user_id
         ${where}
         ORDER BY sm.created_at DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, q.limit, offset],
      ),
      pool.query(`SELECT COUNT(*) AS total FROM stock_movements sm ${where}`, params),
    ]);

    const total = Number(countResult.rows[0]?.total ?? 0);
    res.json({
      data: dataResult.rows,
      meta: { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) },
    });
  },
);

// GET /stock/expiry?site_id=&days_bucket=
router.get(
  '/expiry',
  requireAuth,
  validate({
    query: z.object({
      site_id: z.string().uuid(),
      days_bucket: z.coerce.number().int().min(1).max(365).default(90),
    }),
  }),
  async (req, res) => {
    const q = req.query as unknown as { site_id: string; days_bucket: number };

    const result = await pool.query(
      `SELECT
         s.id          AS sku_id,
         s.code        AS sku_code,
         s.name        AS sku_name,
         b.id          AS batch_id,
         b.batch_number,
         b.expiry_date,
         EXTRACT(DAY FROM b.expiry_date - NOW())::int AS days_remaining,
         SUM(soh.quantity)                            AS total_qty,
         l.site_id
       FROM stock_on_hand soh
       JOIN skus      s ON s.id = soh.sku_id
       JOIN batches   b ON b.id = soh.batch_id
       JOIN locations l ON l.id = soh.location_id
       WHERE l.site_id     = $1
         AND b.expiry_date IS NOT NULL
         AND b.expiry_date > NOW()
         AND b.expiry_date <= NOW() + ($2 || ' days')::INTERVAL
         AND soh.quantity  > 0
       GROUP BY s.id, s.code, s.name, b.id, b.batch_number, b.expiry_date, l.site_id
       ORDER BY b.expiry_date ASC`,
      [q.site_id, q.days_bucket],
    );

    res.json({ data: result.rows, days_bucket: q.days_bucket });
  },
);

// GET /stock/valuation?site_id=
router.get(
  '/valuation',
  requireAuth,
  requireRoles('supervisor', 'admin', 'read_only'),
  validate({
    query: z.object({
      site_id: z.string().uuid(),
    }),
  }),
  async (req, res) => {
    const q = req.query as unknown as { site_id: string };

    const result = await pool.query(
      `SELECT
         s.id            AS sku_id,
         s.code          AS sku_code,
         s.name          AS sku_name,
         SUM(soh.quantity)                         AS total_qty,
         AVG(b.landed_cost_per_unit::numeric)      AS avg_cost,
         SUM(soh.quantity * COALESCE(b.landed_cost_per_unit::numeric, s.standard_cost::numeric, 0))
                                                   AS total_value
       FROM stock_on_hand soh
       JOIN skus      s ON s.id = soh.sku_id
       LEFT JOIN batches   b ON b.id = soh.batch_id
       JOIN locations l ON l.id = soh.location_id
       WHERE l.site_id  = $1
         AND soh.quantity > 0
       GROUP BY s.id, s.code, s.name
       ORDER BY total_value DESC`,
      [q.site_id],
    );

    const grandTotal = result.rows.reduce(
      (sum: number, r: { total_value: string }) => sum + Number(r.total_value ?? 0),
      0,
    );

    res.json({ data: result.rows, grand_total_value: grandTotal, site_id: q.site_id });
  },
);

export default router;
