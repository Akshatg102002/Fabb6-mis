import express, { Router } from 'express';
import { pool } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router: express.Router = Router();

const LEDGER_CTE = `
  inbound AS (
    SELECT sku_id, SUM(quantity) AS qty
    FROM stock_movements WHERE to_location_id IS NOT NULL
    GROUP BY sku_id
  ),
  outbound AS (
    SELECT sku_id, SUM(quantity) AS qty
    FROM stock_movements WHERE from_location_id IS NOT NULL
    GROUP BY sku_id
  ),
  ledger AS (
    SELECT i.sku_id, COALESCE(i.qty, 0) - COALESCE(o.qty, 0) AS qty
    FROM inbound i LEFT JOIN outbound o USING (sku_id)
    WHERE COALESCE(i.qty, 0) - COALESCE(o.qty, 0) > 0
  )
`;

// GET /dashboard/stats
router.get('/stats', requireAuth, async (_req, res) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    skuCount,
    stockValueResult,
    lowStockResult,
    todayMovementsResult,
    top10SkusResult,
    brandStockResult,
    recentActivityResult,
  ] = await Promise.all([
    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM skus WHERE is_active = true`,
    ),

    pool.query<{ total_value: string }>(`
      WITH ${LEDGER_CTE}
      SELECT COALESCE(SUM(l.qty * COALESCE(s.standard_cost::numeric, 0)), 0) AS total_value
      FROM ledger l JOIN skus s ON s.id = l.sku_id
    `),

    pool.query<{ count: string }>(`
      WITH ${LEDGER_CTE}
      SELECT COUNT(*) AS count FROM ledger WHERE qty BETWEEN 1 AND 9
    `),

    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM stock_movements WHERE created_at >= $1`,
      [todayStart.toISOString()],
    ),

    pool.query<{ sku_code: string; sku_name: string; qty: string; value: string }>(`
      WITH ${LEDGER_CTE}
      SELECT s.code AS sku_code, s.name AS sku_name, l.qty::bigint AS qty,
             (l.qty * COALESCE(s.standard_cost::numeric, 0)) AS value
      FROM ledger l JOIN skus s ON s.id = l.sku_id
      ORDER BY value DESC NULLS LAST, l.qty DESC
      LIMIT 10
    `),

    pool.query<{ brand: string; qty: string }>(`
      WITH ${LEDGER_CTE}
      SELECT COALESCE(br.name, 'Unbranded') AS brand, SUM(l.qty)::bigint AS qty
      FROM ledger l
      JOIN skus s ON s.id = l.sku_id
      LEFT JOIN brands br ON br.id = s.brand_id
      GROUP BY br.name
      ORDER BY qty DESC
    `),

    pool.query(`
      SELECT sm.id, sm.movement_type, sm.quantity, sm.created_at,
             s.code AS sku_code, s.name AS sku_name,
             fl.code AS from_loc, tl.code AS to_loc,
             u.name AS user_name
      FROM stock_movements sm
      JOIN skus s ON s.id = sm.sku_id
      LEFT JOIN locations fl ON fl.id = sm.from_location_id
      LEFT JOIN locations tl ON tl.id = sm.to_location_id
      LEFT JOIN users u ON u.id = sm.user_id
      ORDER BY sm.created_at DESC
      LIMIT 20
    `),
  ]);

  res.json({
    totalSkus: Number(skuCount.rows[0]?.count ?? 0),
    stockValue: Number(stockValueResult.rows[0]?.total_value ?? 0),
    lowStockAlerts: Number(lowStockResult.rows[0]?.count ?? 0),
    todayMovements: Number(todayMovementsResult.rows[0]?.count ?? 0),
    top10Skus: top10SkusResult.rows.map((r) => ({
      skuCode: r.sku_code,
      skuName: r.sku_name,
      qty: Number(r.qty),
      value: Number(r.value),
    })),
    brandStock: brandStockResult.rows.map((r) => ({
      brand: r.brand,
      qty: Number(r.qty),
    })),
    recentActivity: recentActivityResult.rows.map((r) => ({
      id: r.id as string,
      movementType: r.movement_type as string,
      quantity: Number(r.quantity),
      createdAt: r.created_at as string,
      skuCode: r.sku_code as string,
      skuName: r.sku_name as string,
      fromLoc: r.from_loc as string | null,
      toLoc: r.to_loc as string | null,
      userName: r.user_name as string | null,
    })),
  });
});

export default router;
