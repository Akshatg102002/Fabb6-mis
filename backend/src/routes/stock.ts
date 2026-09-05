import { Router } from 'express';
import { createHash } from 'crypto';
import { pool } from '../db/index.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { stockQuerySchema, movementQuerySchema } from '../schemas/stock.js';
import { writeBatchMovements } from '../services/stock-movement.js';
import type { StockMovementInput } from '../services/stock-movement.js';
import { z } from 'zod';

// ── Stock Import helpers ─────────────────────────────────────────────────────

interface ImportRowInput {
  sku_code: string;
  sku_name: string;
  batch_number: string | undefined;
  expiry_date: string | undefined;
  location_code: string;
  quantity: number;
  cost_per_unit: number | undefined;
  brand_name: string | undefined;
  hsn_code: string | undefined;
}

interface ImportRowError {
  row: number;
  field: string;
  message: string;
}

function validateImportRows(rows: unknown[]): {
  validRows: ImportRowInput[];
  errors: ImportRowError[];
} {
  const validRows: ImportRowInput[] = [];
  const errors: ImportRowError[] = [];

  for (const [idx, rawItem] of rows.entries()) {
    const rowNum = idx + 1;
    const rowErrors: ImportRowError[] = [];

    if (rawItem === null || rawItem === undefined || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
      errors.push({ row: rowNum, field: 'row', message: 'Invalid row format' });
      continue;
    }

    const raw = rawItem as Record<string, unknown>;
    const skuCodeRaw = raw['sku_code'];
    const skuNameRaw = raw['sku_name'];
    const locationCodeRaw = raw['location_code'];
    const quantityRaw = raw['quantity'];
    const expiryDateRaw = raw['expiry_date'];

    if (typeof skuCodeRaw !== 'string' || !skuCodeRaw.trim()) {
      rowErrors.push({ row: rowNum, field: 'sku_code', message: 'sku_code is required' });
    }
    if (typeof skuNameRaw !== 'string' || !skuNameRaw.trim()) {
      rowErrors.push({ row: rowNum, field: 'sku_name', message: 'sku_name is required' });
    }
    const qty = Number(quantityRaw);
    if (!Number.isInteger(qty) || qty <= 0) {
      rowErrors.push({ row: rowNum, field: 'quantity', message: 'quantity must be a positive integer' });
    }
    if (typeof locationCodeRaw !== 'string' || !locationCodeRaw.trim()) {
      rowErrors.push({ row: rowNum, field: 'location_code', message: 'location_code is required' });
    }
    if (typeof expiryDateRaw === 'string' && expiryDateRaw.trim()) {
      const ed = expiryDateRaw.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ed) || Number.isNaN(Date.parse(ed))) {
        rowErrors.push({ row: rowNum, field: 'expiry_date', message: 'expiry_date must be in YYYY-MM-DD format' });
      }
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
    } else {
      validRows.push({
        sku_code: (skuCodeRaw as string).trim(),
        sku_name: (skuNameRaw as string).trim(),
        batch_number:
          typeof raw['batch_number'] === 'string' && raw['batch_number'].trim()
            ? raw['batch_number'].trim()
            : undefined,
        expiry_date:
          typeof expiryDateRaw === 'string' && expiryDateRaw.trim()
            ? expiryDateRaw.trim()
            : undefined,
        location_code: (locationCodeRaw as string).trim(),
        quantity: qty,
        cost_per_unit: raw['cost_per_unit'] != null ? Number(raw['cost_per_unit']) : undefined,
        brand_name:
          typeof raw['brand_name'] === 'string' && raw['brand_name'].trim()
            ? raw['brand_name'].trim()
            : undefined,
        hsn_code:
          typeof raw['hsn_code'] === 'string' && raw['hsn_code'].trim()
            ? raw['hsn_code'].trim()
            : undefined,
      });
    }
  }

  return { validRows, errors };
}

/**
 * Parses a location code like "A01-01-01" into aisle/rack/shelf/position parts.
 * Format: <letter(s)><digits> - <shelf> - <position>
 * e.g. "A01-01-01" → aisle=A, rack=01, shelf=01, position=01
 */
function parseLocationParts(code: string): {
  aisle: string | null;
  rack: string | null;
  shelf: string | null;
  position: string | null;
} {
  const segments = code.split('-');
  const firstSeg = segments[0] ?? '';
  const aisleMatch = firstSeg.match(/^([A-Za-z]+)/);
  const rackMatch = firstSeg.match(/(\d+)/);
  return {
    aisle: aisleMatch?.[1] ?? null,
    rack: rackMatch?.[1] ?? null,
    shelf: segments[1] ?? null,
    position: segments[2] ?? null,
  };
}

function makeImportKey(
  siteId: string,
  skuCode: string,
  locationCode: string,
  batchNumber: string | undefined,
): string {
  const data = `${siteId}:${skuCode}:${locationCode}:${batchNumber ?? 'nobatch'}`;
  const hash = createHash('sha256').update(data).digest('hex');
  return `import-${hash}`;
}

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

// ── GET /stock/import/template ───────────────────────────────────────────────
router.get(
  '/import/template',
  requireAuth,
  requireRoles('admin', 'supervisor'),
  (_req, res) => {
    const csv = [
      'sku_code,sku_name,batch_number,expiry_date,location_code,quantity,cost_per_unit,brand_name,hsn_code',
      "SKU001,Loreal Colour 5.0 60g,B2024-001,2026-12-31,A01-01-01,50,450.00,L'Oreal Professionnel,33059090",
      'SKU002,Schwarzkopf Developer 1000ml,B2024-002,2027-06-30,A01-01-02,20,320.00,Schwarzkopf,33059090',
    ].join('\r\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="opening-stock-template.csv"');
    res.send(csv);
  },
);

// ── POST /stock/import ───────────────────────────────────────────────────────
router.post(
  '/import',
  requireAuth,
  requireRoles('admin', 'supervisor'),
  async (req, res) => {
    try {
      const body = req.body as { site_id?: string; rows?: unknown[] };
      const siteId = body.site_id ?? req.auth?.siteId ?? null;

      if (!siteId) {
        res.status(400).json({ error: 'site_id is required in the request body' });
        return;
      }
      if (!Array.isArray(body.rows) || body.rows.length === 0) {
        res.status(400).json({ error: 'rows array is required and must not be empty' });
        return;
      }

      // ── Validate all rows before processing ────────────────────────────
      const { validRows, errors: validationErrors } = validateImportRows(body.rows);
      if (validationErrors.length > 0) {
        res.status(422).json({ valid: false, errors: validationErrors });
        return;
      }

      // ── Master data setup in a single transaction ──────────────────────
      const brandIdMap = new Map<string, string>();
      const skuIdMap = new Map<string, string>();
      const batchIdMap = new Map<string, string>(); // key: `${skuCode}:${batchNumber}`
      const locationIdMap = new Map<string, string>();

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Step 1 — upsert brands
        const uniqueBrandNames = [
          ...new Set(validRows.map((r) => r.brand_name).filter((b): b is string => !!b)),
        ];
        for (const brandName of uniqueBrandNames) {
          const brandResult = await client.query<{ id: string }>(
            `INSERT INTO brands (name)
             VALUES ($1)
             ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
             RETURNING id`,
            [brandName],
          );
          const brandRow = brandResult.rows[0];
          if (brandRow) brandIdMap.set(brandName, brandRow.id);
        }

        // Step 2 — upsert SKUs (first occurrence per sku_code wins for name/brand)
        const seenSkuCodes = new Map<string, ImportRowInput>();
        for (const row of validRows) {
          if (!seenSkuCodes.has(row.sku_code)) seenSkuCodes.set(row.sku_code, row);
        }
        for (const [skuCode, row] of seenSkuCodes.entries()) {
          const brandId = row.brand_name ? (brandIdMap.get(row.brand_name) ?? null) : null;
          const skuResult = await client.query<{ id: string }>(
            `INSERT INTO skus (code, name, brand_id, hsn_code, uom, pack_size, shelf_life_tracked, is_active, abc_class)
             VALUES ($1, $2, $3, $4, 'unit', 1, false, true, 'C')
             ON CONFLICT (code) DO UPDATE SET code = EXCLUDED.code
             RETURNING id`,
            [skuCode, row.sku_name, brandId, row.hsn_code ?? null],
          );
          const skuRow = skuResult.rows[0];
          if (skuRow) skuIdMap.set(skuCode, skuRow.id);
        }

        // Step 3 — upsert batches (select-then-insert to avoid depending on a
        //           unique constraint that may not exist in the DB migration)
        for (const row of validRows) {
          if (!row.batch_number) continue;
          const skuId = skuIdMap.get(row.sku_code);
          if (!skuId) continue;
          const batchKey = `${row.sku_code}:${row.batch_number}`;
          if (batchIdMap.has(batchKey)) continue; // already handled this pair

          const existingBatch = await client.query<{ id: string }>(
            `SELECT id FROM batches WHERE sku_id = $1 AND batch_number = $2 LIMIT 1`,
            [skuId, row.batch_number],
          );
          const existingBatchRow = existingBatch.rows[0];
          if (existingBatchRow) {
            batchIdMap.set(batchKey, existingBatchRow.id);
          } else {
            const newBatch = await client.query<{ id: string }>(
              `INSERT INTO batches (sku_id, batch_number, expiry_date, landed_cost_per_unit)
               VALUES ($1, $2, $3, $4)
               RETURNING id`,
              [
                skuId,
                row.batch_number,
                row.expiry_date ?? null,
                row.cost_per_unit != null ? String(row.cost_per_unit) : null,
              ],
            );
            const newBatchRow = newBatch.rows[0];
            if (newBatchRow) batchIdMap.set(batchKey, newBatchRow.id);
          }
        }

        // Step 4 — upsert locations
        const uniqueLocationCodes = [...new Set(validRows.map((r) => r.location_code))];
        for (const locationCode of uniqueLocationCodes) {
          const { aisle, rack, shelf, position } = parseLocationParts(locationCode);
          const locResult = await client.query<{ id: string }>(
            `INSERT INTO locations (site_id, code, type, aisle, rack, shelf, position, is_active)
             VALUES ($1, $2, 'bin', $3, $4, $5, $6, true)
             ON CONFLICT (code) DO UPDATE SET code = EXCLUDED.code
             RETURNING id`,
            [siteId, locationCode, aisle, rack, shelf, position],
          );
          const locRow = locResult.rows[0];
          if (locRow) locationIdMap.set(locationCode, locRow.id);
        }

        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw txErr;
      } finally {
        client.release();
      }

      // ── Write stock movements (one SERIALIZABLE tx per row via service) ──
      const movements: StockMovementInput[] = [];
      for (const row of validRows) {
        const skuId = skuIdMap.get(row.sku_code);
        const locationId = locationIdMap.get(row.location_code);
        if (!skuId || !locationId) continue;

        const batchKey = row.batch_number ? `${row.sku_code}:${row.batch_number}` : undefined;
        const batchId = batchKey ? (batchIdMap.get(batchKey) ?? null) : null;

        movements.push({
          idempotencyKey: makeImportKey(siteId, row.sku_code, row.location_code, row.batch_number),
          skuId,
          batchId,
          fromLocationId: null,
          toLocationId: locationId,
          quantity: row.quantity,
          movementType: 'stock_adjustment',
          referenceType: 'manual',
          reasonCode: 'opening_stock_import',
          userId: req.auth?.userId ?? null,
        });
      }

      const { succeeded, failed } = await writeBatchMovements(movements);

      const skippedCount = failed.filter(
        (f) =>
          f.error.message.toLowerCase().includes('idempotency') ||
          f.error.message.includes('IDEMPOTENCY'),
      ).length;

      const importErrors = failed
        .filter(
          (f) =>
            !f.error.message.toLowerCase().includes('idempotency') &&
            !f.error.message.includes('IDEMPOTENCY'),
        )
        .map((f) => ({ message: f.error.message }));

      res.json({
        imported: succeeded.length,
        skipped: skippedCount,
        errors: importErrors,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      res.status(500).json({ error: message });
    }
  },
);

export default router;
