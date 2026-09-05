import { pool } from '../db/index.js';
import { logger } from '../logger.js';

const REORDER_LOOKBACK_DAYS = parseInt(process.env['REORDER_LOOKBACK_DAYS'] ?? '30', 10);

interface ReorderCandidate {
  skuId: string;
  skuCode: string;
  skuName: string;
  abcClass: string;
  siteId: string;
  siteName: string;
  currentStock: number;
  avgDailyMovement: number;
  daysOfStock: number;
  reorderPoint: number;
  suggestedReorderQty: number;
}

/**
 * Calculates reorder points for each active SKU at each site.
 * Uses the ABC classification to determine safety stock multipliers:
 *   A: 14 days safety stock
 *   B: 7 days safety stock
 *   C: 3 days safety stock
 */
export async function runReorderCalcJob(): Promise<void> {
  const client = await pool.connect();
  try {
    const result = await client.query<{
      sku_id: string;
      sku_code: string;
      sku_name: string;
      abc_class: string;
      site_id: string;
      site_name: string;
      current_stock: number;
      total_out: number;
    }>(
      `SELECT
         s.id      AS sku_id,
         s.code    AS sku_code,
         s.name    AS sku_name,
         s.abc_class,
         si.id     AS site_id,
         si.name   AS site_name,
         COALESCE(SUM(soh.quantity), 0) AS current_stock,
         COALESCE(ABS(SUM(CASE
           WHEN sm.quantity < 0 AND sm.created_at > NOW() - $1 * INTERVAL '1 day'
           THEN sm.quantity ELSE 0 END)), 0) AS total_out
       FROM skus s
       CROSS JOIN sites si
       LEFT JOIN stock_on_hand soh ON soh.sku_id = s.id
       LEFT JOIN locations l ON l.id = soh.location_id AND l.site_id = si.id
       LEFT JOIN stock_movements sm ON sm.sku_id = s.id
       WHERE s.is_active = TRUE AND si.is_active = TRUE
       GROUP BY s.id, s.code, s.name, s.abc_class, si.id, si.name
       HAVING COALESCE(SUM(soh.quantity), 0) > 0
           OR COALESCE(ABS(SUM(CASE
                WHEN sm.quantity < 0 AND sm.created_at > NOW() - $1 * INTERVAL '1 day'
                THEN sm.quantity ELSE 0 END)), 0) > 0`,
      [REORDER_LOOKBACK_DAYS],
    );

    const safetyDays: Record<string, number> = { A: 14, B: 7, C: 3 };
    const leadTimeDays = parseInt(process.env['DEFAULT_LEAD_TIME_DAYS'] ?? '7', 10);
    const candidates: ReorderCandidate[] = [];

    for (const row of result.rows) {
      const avgDailyMovement = Number(row.total_out) / REORDER_LOOKBACK_DAYS;
      const currentStock = Number(row.current_stock);
      const safety = safetyDays[row.abc_class] ?? 7;

      const reorderPoint = Math.ceil(avgDailyMovement * (leadTimeDays + safety));
      const daysOfStock = avgDailyMovement > 0 ? currentStock / avgDailyMovement : Infinity;

      if (currentStock <= reorderPoint) {
        const suggestedReorderQty = Math.ceil(avgDailyMovement * (leadTimeDays + safety * 2));
        candidates.push({
          skuId: row.sku_id,
          skuCode: row.sku_code,
          skuName: row.sku_name,
          abcClass: row.abc_class,
          siteId: row.site_id,
          siteName: row.site_name,
          currentStock,
          avgDailyMovement: Math.round(avgDailyMovement * 100) / 100,
          daysOfStock: isFinite(daysOfStock) ? Math.round(daysOfStock * 10) / 10 : 9999,
          reorderPoint,
          suggestedReorderQty: Math.max(suggestedReorderQty, 1),
        });
      }
    }

    // Log reorder alerts
    for (const candidate of candidates) {
      logger.warn(
        {
          alert: 'reorder_needed',
          ...candidate,
        },
        `Reorder needed: ${candidate.skuName} at ${candidate.siteName} — ${candidate.currentStock} units (${candidate.daysOfStock} days)`,
      );
    }

    logger.info(
      {
        totalSkusEvaluated: result.rows.length,
        reorderCandidates: candidates.length,
        lookbackDays: REORDER_LOOKBACK_DAYS,
      },
      'Reorder calculation job completed',
    );
  } finally {
    client.release();
  }
}
