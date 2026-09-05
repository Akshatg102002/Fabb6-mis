import { pool } from '../db/index.js';
import { logger } from '../index.js';

export interface FefoAllocation {
  batchId: string;
  locationId: string;
  batchNumber: string;
  expiryDate: Date | null;
  availableQty: number;
  allocatedQty: number;
}

export interface FefoRequest {
  skuId: string;
  requiredQty: number;
  siteId: string;
  /** Optional: restrict to specific location types (defaults to bin, pick_face) */
  locationTypes?: string[];
  /** Minimum shelf life remaining in days (0 = no filter) */
  minShelfLifeDays?: number;
}

/**
 * FEFO (First Expired First Out) batch selection.
 *
 * Queries stock_on_hand joined with batches and locations to find the
 * optimal batch + location combination, prioritising closest expiry date first.
 * Within the same expiry date, picks the location with the highest quantity
 * to minimise number of picks.
 */
export async function selectFefoBatches(request: FefoRequest): Promise<FefoAllocation[]> {
  const locationTypes =
    request.locationTypes && request.locationTypes.length > 0
      ? request.locationTypes
      : ['bin', 'pick_face'];

  const minExpiryDate =
    request.minShelfLifeDays && request.minShelfLifeDays > 0
      ? new Date(Date.now() + request.minShelfLifeDays * 86_400_000)
      : null;

  const client = await pool.connect();
  try {
    // Query returns rows ordered by FEFO priority
    const result = await client.query<{
      batch_id: string;
      location_id: string;
      batch_number: string;
      expiry_date: Date | null;
      quantity: number;
    }>(
      `SELECT
        soh.batch_id,
        soh.location_id,
        b.batch_number,
        b.expiry_date,
        soh.quantity
       FROM stock_on_hand soh
       INNER JOIN locations l ON l.id = soh.location_id
       LEFT  JOIN batches   b ON b.id = soh.batch_id
       WHERE soh.sku_id = $1
         AND l.site_id  = $2
         AND l.type     = ANY($3::location_type[])
         AND l.is_active = TRUE
         AND soh.quantity > 0
         AND ($4::timestamptz IS NULL
              OR b.expiry_date IS NULL
              OR b.expiry_date >= $4::timestamptz)
       ORDER BY
         -- NULL expiry_date (non-tracked) goes last
         (b.expiry_date IS NULL) ASC,
         b.expiry_date ASC,
         soh.quantity DESC`,
      [request.skuId, request.siteId, locationTypes, minExpiryDate],
    );

    const allocations: FefoAllocation[] = [];
    let remaining = request.requiredQty;

    for (const row of result.rows) {
      if (remaining <= 0) break;

      const allocatedQty = Math.min(remaining, row.quantity);
      allocations.push({
        batchId: row.batch_id,
        locationId: row.location_id,
        batchNumber: row.batch_number,
        expiryDate: row.expiry_date,
        availableQty: row.quantity,
        allocatedQty,
      });
      remaining -= allocatedQty;
    }

    if (remaining > 0) {
      logger.warn(
        {
          skuId: request.skuId,
          requiredQty: request.requiredQty,
          shortfall: remaining,
        },
        'FEFO allocation: insufficient stock to fulfil request',
      );
    }

    return allocations;
  } finally {
    client.release();
  }
}

/**
 * Get batches approaching expiry for a given site.
 * Returns SKU + batch rows where expiry_date is within warningDays.
 */
export async function getExpiringBatches(opts: {
  siteId: string;
  warningDays: number;
}): Promise<
  {
    skuId: string;
    skuCode: string;
    skuName: string;
    batchId: string;
    batchNumber: string;
    expiryDate: Date;
    totalQty: number;
  }[]
> {
  const client = await pool.connect();
  try {
    const cutoff = new Date(Date.now() + opts.warningDays * 86_400_000);
    const result = await client.query<{
      sku_id: string;
      sku_code: string;
      sku_name: string;
      batch_id: string;
      batch_number: string;
      expiry_date: Date;
      total_qty: number;
    }>(
      `SELECT
         s.id          AS sku_id,
         s.code        AS sku_code,
         s.name        AS sku_name,
         b.id          AS batch_id,
         b.batch_number,
         b.expiry_date,
         SUM(soh.quantity) AS total_qty
       FROM stock_on_hand soh
       INNER JOIN skus      s ON s.id = soh.sku_id
       INNER JOIN batches   b ON b.id = soh.batch_id
       INNER JOIN locations l ON l.id = soh.location_id
       WHERE l.site_id          = $1
         AND b.expiry_date      IS NOT NULL
         AND b.expiry_date      <= $2
         AND b.expiry_date      > NOW()
         AND soh.quantity       > 0
       GROUP BY s.id, s.code, s.name, b.id, b.batch_number, b.expiry_date
       ORDER BY b.expiry_date ASC`,
      [opts.siteId, cutoff],
    );

    return result.rows.map((r) => ({
      skuId: r.sku_id,
      skuCode: r.sku_code,
      skuName: r.sku_name,
      batchId: r.batch_id,
      batchNumber: r.batch_number,
      expiryDate: r.expiry_date,
      totalQty: Number(r.total_qty),
    }));
  } finally {
    client.release();
  }
}
