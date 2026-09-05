import { Router } from 'express';
import { pool } from '../db/index.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { z } from 'zod';

const router = Router();

const reportQuerySchema = z.object({
  site_id: z.string().uuid(),
  as_of: z.string().datetime().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  sku_id: z.string().uuid().optional(),
});

// GET /reports/stock-valuation?site_id=&as_of=
router.get(
  '/stock-valuation',
  requireAuth,
  requireRoles('supervisor', 'admin', 'read_only'),
  validate({ query: reportQuerySchema }),
  async (req, res) => {
    const q = req.query as unknown as { site_id: string; as_of?: string };

    // For a point-in-time valuation we replay movements up to as_of
    const asOf = q.as_of ? new Date(q.as_of) : new Date();

    const result = await pool.query(
      `WITH point_in_time AS (
         SELECT
           sku_id,
           batch_id,
           to_location_id   AS location_id,
           SUM(quantity)    AS inbound
         FROM stock_movements
         WHERE to_location_id IS NOT NULL
           AND created_at <= $2
         GROUP BY sku_id, batch_id, to_location_id

         UNION ALL

         SELECT
           sku_id,
           batch_id,
           from_location_id AS location_id,
           -SUM(quantity)   AS inbound
         FROM stock_movements
         WHERE from_location_id IS NOT NULL
           AND created_at <= $2
         GROUP BY sku_id, batch_id, from_location_id
       ),
       stock AS (
         SELECT sku_id, batch_id, location_id, SUM(inbound) AS quantity
         FROM point_in_time
         GROUP BY sku_id, batch_id, location_id
         HAVING SUM(inbound) > 0
       )
       SELECT
         s.id              AS sku_id,
         s.code            AS sku_code,
         s.name            AS sku_name,
         b.batch_number,
         b.expiry_date,
         SUM(st.quantity)  AS total_qty,
         COALESCE(AVG(b.landed_cost_per_unit::numeric), s.standard_cost::numeric, 0) AS unit_cost,
         SUM(st.quantity) * COALESCE(AVG(b.landed_cost_per_unit::numeric), s.standard_cost::numeric, 0) AS total_value
       FROM stock st
       JOIN skus      s ON s.id = st.sku_id
       LEFT JOIN batches   b ON b.id = st.batch_id
       JOIN locations l ON l.id = st.location_id
       WHERE l.site_id = $1
       GROUP BY s.id, s.code, s.name, b.batch_number, b.expiry_date, s.standard_cost
       ORDER BY total_value DESC NULLS LAST`,
      [q.site_id, asOf],
    );

    const grandTotal = result.rows.reduce(
      (sum: number, r: { total_value: string }) => sum + Number(r.total_value ?? 0),
      0,
    );

    res.json({
      as_of: asOf.toISOString(),
      site_id: q.site_id,
      data: result.rows,
      grand_total_value: grandTotal,
    });
  },
);

// GET /reports/shrinkage?site_id=&from=&to=
router.get(
  '/shrinkage',
  requireAuth,
  requireRoles('supervisor', 'admin', 'read_only'),
  validate({
    query: z.object({
      site_id: z.string().uuid(),
      from: z.string().datetime(),
      to: z.string().datetime(),
    }),
  }),
  async (req, res) => {
    const q = req.query as unknown as { site_id: string; from: string; to: string };

    const result = await pool.query(
      `SELECT
         s.id           AS sku_id,
         s.code         AS sku_code,
         s.name         AS sku_name,
         sm.movement_type,
         COUNT(*)       AS movement_count,
         SUM(sm.quantity) AS total_qty,
         SUM(sm.quantity * COALESCE(b.landed_cost_per_unit::numeric, s.standard_cost::numeric, 0)) AS value_impact
       FROM stock_movements sm
       JOIN skus      s ON s.id = sm.sku_id
       LEFT JOIN batches   b ON b.id = sm.batch_id
       JOIN locations l ON l.id = COALESCE(sm.from_location_id, sm.to_location_id)
       WHERE l.site_id = $1
         AND sm.created_at BETWEEN $2 AND $3
         AND sm.movement_type IN ('writeoff','cycle_count_adjustment','stock_adjustment')
       GROUP BY s.id, s.code, s.name, sm.movement_type
       ORDER BY value_impact DESC`,
      [q.site_id, q.from, q.to],
    );

    const totalShrinkage = result.rows.reduce(
      (sum: number, r: { value_impact: string }) => sum + Number(r.value_impact ?? 0),
      0,
    );

    res.json({
      site_id: q.site_id,
      period: { from: q.from, to: q.to },
      data: result.rows,
      total_shrinkage_value: totalShrinkage,
    });
  },
);

// GET /reports/ageing?site_id=
router.get(
  '/ageing',
  requireAuth,
  requireRoles('supervisor', 'admin', 'read_only'),
  validate({ query: z.object({ site_id: z.string().uuid() }) }),
  async (req, res) => {
    const { site_id } = req.query as unknown as { site_id: string };

    const result = await pool.query(
      `SELECT
         s.id                AS sku_id,
         s.code              AS sku_code,
         s.name              AS sku_name,
         b.id                AS batch_id,
         b.batch_number,
         b.expiry_date,
         EXTRACT(DAY FROM NOW() - b.expiry_date)::int AS days_past_expiry,
         SUM(soh.quantity)   AS qty,
         CASE
           WHEN b.expiry_date IS NULL       THEN 'no_expiry'
           WHEN b.expiry_date > NOW()       THEN 'fresh'
           WHEN b.expiry_date > NOW() - INTERVAL '30 days' THEN 'expired_lt30'
           WHEN b.expiry_date > NOW() - INTERVAL '90 days' THEN 'expired_30_90'
           ELSE 'expired_gt90'
         END AS age_bucket
       FROM stock_on_hand soh
       JOIN skus      s ON s.id = soh.sku_id
       LEFT JOIN batches   b ON b.id = soh.batch_id
       JOIN locations l ON l.id = soh.location_id
       WHERE l.site_id = $1
         AND soh.quantity > 0
       GROUP BY s.id, s.code, s.name, b.id, b.batch_number, b.expiry_date
       ORDER BY b.expiry_date ASC NULLS LAST`,
      [site_id],
    );

    res.json({ site_id, data: result.rows });
  },
);

// GET /reports/movement-history?sku_id=&from=&to=
router.get(
  '/movement-history',
  requireAuth,
  validate({
    query: z.object({
      sku_id: z.string().uuid(),
      from: z.string().datetime(),
      to: z.string().datetime(),
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().min(1).max(500).default(100),
    }),
  }),
  async (req, res) => {
    const q = req.query as unknown as {
      sku_id: string;
      from: string;
      to: string;
      page: number;
      limit: number;
    };

    const offset = (q.page - 1) * q.limit;

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT
           sm.id,
           sm.movement_type,
           sm.quantity,
           sm.batch_id,
           b.batch_number,
           sm.from_location_id,
           fl.code     AS from_location_code,
           sm.to_location_id,
           tl.code     AS to_location_code,
           sm.reference_type,
           sm.reference_id,
           sm.reason_code,
           sm.notes,
           sm.created_at,
           u.name      AS user_name
         FROM stock_movements sm
         LEFT JOIN batches   b  ON b.id  = sm.batch_id
         LEFT JOIN locations fl ON fl.id = sm.from_location_id
         LEFT JOIN locations tl ON tl.id = sm.to_location_id
         LEFT JOIN users     u  ON u.id  = sm.user_id
         WHERE sm.sku_id = $1
           AND sm.created_at BETWEEN $2 AND $3
         ORDER BY sm.created_at DESC
         LIMIT $4 OFFSET $5`,
        [q.sku_id, q.from, q.to, q.limit, offset],
      ),
      pool.query<{ total: number }>(
        `SELECT COUNT(*) AS total FROM stock_movements
         WHERE sku_id = $1 AND created_at BETWEEN $2 AND $3`,
        [q.sku_id, q.from, q.to],
      ),
    ]);

    const total = Number(countResult.rows[0]?.total ?? 0);
    res.json({
      sku_id: q.sku_id,
      period: { from: q.from, to: q.to },
      data: dataResult.rows,
      meta: { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) },
    });
  },
);

export default router;
