import express, { Router } from 'express';
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

const router: express.Router = Router();

// GET /stock/on-hand
router.get(
  '/on-hand',
  requireAuth,
  validate({ query: stockQuerySchema }),
  async (req, res) => {
    const q = req.query as unknown as {
      page: number;
      limit: number;
      pageSize?: number;
      site_id?: string;
      siteId?: string;
      sku_id?: string;
      skuSearch?: string;
      location_id?: string;
      locationId?: string;
      batch_id?: string;
      include_empty: boolean;
      expiryBucket?: 'expired' | 'lt30' | 'lt60' | 'gt60';
    };

    const pageSize = q.pageSize ?? q.limit;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (q.sku_id) {
      conditions.push(`soh.sku_id = $${idx++}`);
      params.push(q.sku_id);
    }
    if (q.skuSearch) {
      conditions.push(`(s.code ILIKE $${idx} OR s.name ILIKE $${idx})`);
      params.push(`%${q.skuSearch}%`);
      idx++;
    }
    if (q.location_id) {
      conditions.push(`soh.location_id = $${idx++}`);
      params.push(q.location_id);
    }
    if (q.locationId) {
      conditions.push(`l.code ILIKE $${idx++}`);
      params.push(`%${q.locationId}%`);
    }
    if (q.batch_id) {
      conditions.push(`soh.batch_id = $${idx++}`);
      params.push(q.batch_id);
    }
    const resolvedSiteId = q.siteId ?? q.site_id;
    if (resolvedSiteId) {
      conditions.push(`l.site_id = $${idx++}`);
      params.push(resolvedSiteId);
    }

    // Expiry bucket filter applied after joins
    if (q.expiryBucket === 'expired') {
      conditions.push(`b.expiry_date < CURRENT_DATE`);
    } else if (q.expiryBucket === 'lt30') {
      conditions.push(`b.expiry_date >= CURRENT_DATE AND b.expiry_date < CURRENT_DATE + INTERVAL '30 days'`);
    } else if (q.expiryBucket === 'lt60') {
      conditions.push(`b.expiry_date >= CURRENT_DATE + INTERVAL '30 days' AND b.expiry_date < CURRENT_DATE + INTERVAL '60 days'`);
    } else if (q.expiryBucket === 'gt60') {
      conditions.push(`b.expiry_date >= CURRENT_DATE + INTERVAL '60 days'`);
    }

    // When include_empty is false, restrict the ledger CTE to positive balances only
    const having = q.include_empty ? '' : 'HAVING SUM(quantity) > 0';
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (q.page - 1) * pageSize;

    // stock_on_hand derived inline: inbound (+) to to_location, outbound (-) from from_location
    const sohCte = `
      WITH soh AS (
        SELECT sku_id, batch_id, location_id, SUM(quantity) AS quantity
        FROM (
          SELECT sku_id, batch_id, to_location_id   AS location_id,  quantity FROM stock_movements WHERE to_location_id   IS NOT NULL
          UNION ALL
          SELECT sku_id, batch_id, from_location_id AS location_id, -quantity FROM stock_movements WHERE from_location_id IS NOT NULL
        ) ledger
        GROUP BY sku_id, batch_id, location_id
        ${having}
      )`;

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `${sohCte}
         SELECT
           soh.sku_id || '|' || COALESCE(soh.batch_id::text, 'null') || '|' || soh.location_id AS id,
           soh.sku_id        AS "skuId",
           soh.batch_id      AS "batchId",
           soh.location_id   AS "locationId",
           soh.quantity      AS qty,
           s.code            AS "skuCode",
           s.name            AS "skuName",
           s.uom,
           NULL::numeric     AS "costPrice",
           NULL::numeric     AS value,
           b.batch_number    AS batch,
           b.expiry_date     AS "expiryDate",
           l.code            AS "locationCode",
           l.type            AS "locationType",
           l.site_id         AS "siteId"
         FROM soh
         JOIN skus      s ON s.id = soh.sku_id
         LEFT JOIN batches   b ON b.id = soh.batch_id
         JOIN locations l ON l.id = soh.location_id
         ${where}
         ORDER BY s.code, l.code
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, pageSize, offset],
      ),
      pool.query(
        `${sohCte}
         SELECT COUNT(*) AS total
         FROM soh
         JOIN skus      s ON s.id = soh.sku_id
         LEFT JOIN batches   b ON b.id = soh.batch_id
         JOIN locations l ON l.id = soh.location_id
         ${where}`,
        params,
      ),
    ]);

    const total = Number(countResult.rows[0]?.total ?? 0);
    res.json({
      items: dataResult.rows,
      total,
      page: q.page,
      pageSize,
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
      `WITH soh AS (
         SELECT sku_id, batch_id, location_id, SUM(quantity) AS quantity
         FROM (
           SELECT sku_id, batch_id, to_location_id   AS location_id,  quantity FROM stock_movements WHERE to_location_id   IS NOT NULL
           UNION ALL
           SELECT sku_id, batch_id, from_location_id AS location_id, -quantity FROM stock_movements WHERE from_location_id IS NOT NULL
         ) ledger
         GROUP BY sku_id, batch_id, location_id
         HAVING SUM(quantity) > 0
       )
       SELECT
         s.id          AS sku_id,
         s.code        AS sku_code,
         s.name        AS sku_name,
         b.id          AS batch_id,
         b.batch_number,
         b.expiry_date,
         EXTRACT(DAY FROM b.expiry_date - NOW())::int AS days_remaining,
         SUM(soh.quantity)                            AS total_qty,
         l.site_id
       FROM soh
       JOIN skus      s ON s.id = soh.sku_id
       JOIN batches   b ON b.id = soh.batch_id
       JOIN locations l ON l.id = soh.location_id
       WHERE l.site_id     = $1
         AND b.expiry_date IS NOT NULL
         AND b.expiry_date > NOW()
         AND b.expiry_date <= NOW() + ($2 || ' days')::INTERVAL
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
      `WITH soh AS (
         SELECT sku_id, batch_id, location_id, SUM(quantity) AS quantity
         FROM (
           SELECT sku_id, batch_id, to_location_id   AS location_id,  quantity FROM stock_movements WHERE to_location_id   IS NOT NULL
           UNION ALL
           SELECT sku_id, batch_id, from_location_id AS location_id, -quantity FROM stock_movements WHERE from_location_id IS NOT NULL
         ) ledger
         GROUP BY sku_id, batch_id, location_id
         HAVING SUM(quantity) > 0
       )
       SELECT
         s.id            AS sku_id,
         s.code          AS sku_code,
         s.name          AS sku_name,
         SUM(soh.quantity)                         AS total_qty,
         AVG(b.landed_cost_per_unit::numeric)      AS avg_cost,
         SUM(soh.quantity * COALESCE(b.landed_cost_per_unit::numeric, s.standard_cost::numeric, 0))
                                                   AS total_value
       FROM soh
       JOIN skus      s ON s.id = soh.sku_id
       LEFT JOIN batches   b ON b.id = soh.batch_id
       JOIN locations l ON l.id = soh.location_id
       WHERE l.site_id = $1
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

      if (!Array.isArray(body.rows) || body.rows.length === 0) {
        res.status(400).json({ error: 'rows array is required and must not be empty' });
        return;
      }

      // ── Auto-pick first active site ────────────────────────────────────
      const siteResult = await pool.query<{ id: string }>(
        `SELECT id FROM sites WHERE is_active = true ORDER BY created_at ASC LIMIT 1`,
      );
      if ((siteResult.rowCount ?? 0) === 0) {
        res.status(500).json({ error: 'No active site configured' });
        return;
      }
      const siteId = siteResult.rows[0]!.id;

      // ── Validate all rows before processing ────────────────────────────
      const { validRows, errors: validationErrors } = validateImportRows(body.rows);
      if (validationErrors.length > 0) {
        res.status(422).json({ valid: false, errors: validationErrors });
        return;
      }

      // ── Verify all location codes exist (no auto-create) ───────────────
      const uniqueLocationCodes = [...new Set(validRows.map((r) => r.location_code))];
      const locationLookup = await pool.query<{ id: string; code: string }>(
        `SELECT id, code FROM locations WHERE code = ANY($1::text[]) AND is_active = true`,
        [uniqueLocationCodes],
      );
      const locationIdMap = new Map<string, string>(locationLookup.rows.map((r) => [r.code, r.id]));
      const missingLocations = uniqueLocationCodes.filter((c) => !locationIdMap.has(c));
      if (missingLocations.length > 0) {
        res.status(422).json({
          valid: false,
          errors: missingLocations.map((c) => ({ row: 0, field: 'location_code', message: `Location not found: ${c}` })),
        });
        return;
      }

      // ── Master data setup in a single transaction ──────────────────────
      const brandIdMap = new Map<string, string>();
      const skuIdMap = new Map<string, string>();
      const batchIdMap = new Map<string, string>(); // key: `${skuCode}:${batchNumber}`

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

// GET /stock/availability — three-tier stock per SKU/site
router.get(
  '/availability',
  requireAuth,
  requireRoles('supervisor', 'admin', 'read_only'),
  validate({
    query: z.object({
      site_id: z.string().uuid().optional(),
      sku_id: z.string().uuid().optional(),
    }),
  }),
  async (req, res) => {
    const q = req.query as unknown as { site_id?: string; sku_id?: string };

    const whereClauses: string[] = [];
    const params: string[] = [];

    if (q.site_id) {
      params.push(q.site_id);
      whereClauses.push(`site_id = $${params.length}`);
    }
    if (q.sku_id) {
      params.push(q.sku_id);
      whereClauses.push(`sku_id = $${params.length}`);
    }

    const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const client = await pool.connect();
    try {
      const result = await client.query(
        `WITH ledger AS (
           SELECT sku_id, to_location_id AS location_id, quantity
             FROM stock_movements WHERE to_location_id IS NOT NULL
           UNION ALL
           SELECT sku_id, from_location_id AS location_id, -quantity
             FROM stock_movements WHERE from_location_id IS NOT NULL
         ),
         soh AS (
           SELECT sku_id, location_id, SUM(quantity) AS quantity
             FROM ledger
            GROUP BY sku_id, location_id
           HAVING SUM(quantity) > 0
         ),
         physical AS (
           SELECT soh.sku_id, l.site_id, SUM(soh.quantity) AS physical_stock
             FROM soh
             JOIN locations l ON l.id = soh.location_id
            WHERE l.location_type != 'quarantine'
            GROUP BY soh.sku_id, l.site_id
         ),
         committed AS (
           SELECT sku_id, SUM(required_qty - COALESCE(picked_qty, 0)) AS committed_stock
             FROM pick_lines
            WHERE status = 'open'
            GROUP BY sku_id
         ),
         damaged AS (
           SELECT soh.sku_id, l.site_id, SUM(soh.quantity) AS damaged_stock
             FROM soh
             JOIN locations l ON l.id = soh.location_id
            WHERE l.location_type = 'quarantine'
            GROUP BY soh.sku_id, l.site_id
         ),
         avail AS (
           SELECT
             COALESCE(p.sku_id, d.sku_id) AS sku_id,
             COALESCE(p.site_id, d.site_id) AS site_id,
             COALESCE(p.physical_stock, 0) AS physical_stock,
             COALESCE(c.committed_stock, 0) AS committed_stock,
             GREATEST(0, COALESCE(p.physical_stock, 0) - COALESCE(c.committed_stock, 0)) AS available_to_sell,
             COALESCE(d.damaged_stock, 0) AS damaged_stock
             FROM physical p
             FULL OUTER JOIN damaged d ON p.sku_id = d.sku_id AND p.site_id = d.site_id
             LEFT JOIN committed c ON COALESCE(p.sku_id, d.sku_id) = c.sku_id
         )
         SELECT
           a.sku_id,
           a.site_id,
           s.code AS sku_code,
           s.name AS sku_name,
           a.physical_stock,
           a.committed_stock,
           a.available_to_sell,
           a.damaged_stock
           FROM avail a
           JOIN skus s ON s.id = a.sku_id
         ${where}
         ORDER BY s.code`,
        params,
      );
      res.json({ data: result.rows, total: result.rowCount });
    } finally {
      client.release();
    }
  },
);

export default router;
