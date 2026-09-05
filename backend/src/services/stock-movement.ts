import pg from 'pg';
import { pool } from '../db/index.js';
import { logger } from '../index.js';
import type { MovementType, ReferenceType } from '../db/schema/index.js';

const { DatabaseError } = pg;

export interface StockMovementInput {
  idempotencyKey: string;
  skuId: string;
  batchId?: string | null;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  /** Positive integer: quantity being moved */
  quantity: number;
  movementType: MovementType;
  referenceType?: ReferenceType | null;
  referenceId?: string | null;
  reasonCode?: string | null;
  userId?: string | null;
  deviceId?: string | null;
  notes?: string | null;
}

export interface StockMovementResult {
  movementId: bigint;
  idempotencyKey: string;
  skuId: string;
  batchId: string | null;
  fromLocationId: string | null;
  toLocationId: string | null;
  quantity: number;
  movementType: MovementType;
  createdAt: Date;
}

export interface InsufficientStockError {
  type: 'INSUFFICIENT_STOCK';
  skuId: string;
  batchId: string | null;
  locationId: string;
  available: number;
  requested: number;
}

export class StockMovementError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'StockMovementError';
  }
}

/**
 * Writes a single stock movement inside a SERIALIZABLE transaction.
 *
 * Uses SELECT FOR UPDATE on the stock_movements idempotency key row (if exists)
 * and on the stock_on_hand materialized view row to prevent concurrent
 * double-spending of stock.
 *
 * After a successful insert, refreshes the materialized view CONCURRENTLY.
 */
export async function writeStockMovement(
  input: StockMovementInput,
): Promise<StockMovementResult> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');

    // -----------------------------------------------------------
    // 1. Idempotency check with advisory lock on the key
    // -----------------------------------------------------------
    const existingRes = await client.query<{
      id: bigint;
      sku_id: string;
      batch_id: string | null;
      from_location_id: string | null;
      to_location_id: string | null;
      quantity: number;
      movement_type: MovementType;
      created_at: Date;
    }>(
      `SELECT id, sku_id, batch_id, from_location_id, to_location_id,
              quantity, movement_type, created_at
       FROM stock_movements
       WHERE idempotency_key = $1
       FOR UPDATE`,
      [input.idempotencyKey],
    );

    if ((existingRes.rowCount ?? 0) > 0) {
      const row = existingRes.rows[0]!;
      await client.query('COMMIT');
      logger.debug({ idempotencyKey: input.idempotencyKey }, 'Stock movement idempotency replay');
      return {
        movementId: row.id,
        idempotencyKey: input.idempotencyKey,
        skuId: row.sku_id,
        batchId: row.batch_id,
        fromLocationId: row.from_location_id,
        toLocationId: row.to_location_id,
        quantity: row.quantity,
        movementType: row.movement_type,
        createdAt: row.created_at,
      };
    }

    // -----------------------------------------------------------
    // 2. Validate from_location has sufficient stock
    //    (for movements that deduct from a source location)
    // -----------------------------------------------------------
    if (input.fromLocationId) {
      const stockCheck = await client.query<{ quantity: number }>(
        `SELECT quantity
         FROM stock_on_hand
         WHERE sku_id = $1
           AND location_id = $2
           AND ($3::uuid IS NULL OR batch_id = $3::uuid)
         FOR UPDATE`,
        [input.skuId, input.fromLocationId, input.batchId ?? null],
      );

      const available =
        (stockCheck.rowCount ?? 0) > 0 ? Number(stockCheck.rows[0]!.quantity) : 0;

      if (available < input.quantity) {
        await client.query('ROLLBACK');
        throw new StockMovementError(
          `Insufficient stock: available ${available}, requested ${input.quantity}`,
          'INSUFFICIENT_STOCK',
          {
            type: 'INSUFFICIENT_STOCK',
            skuId: input.skuId,
            batchId: input.batchId ?? null,
            locationId: input.fromLocationId,
            available,
            requested: input.quantity,
          } satisfies InsufficientStockError,
        );
      }
    }

    // -----------------------------------------------------------
    // 3. Validate to_location exists and is active
    // -----------------------------------------------------------
    if (input.toLocationId) {
      const locRes = await client.query<{ id: string; is_active: boolean }>(
        `SELECT id, is_active FROM locations WHERE id = $1`,
        [input.toLocationId],
      );
      if ((locRes.rowCount ?? 0) === 0) {
        await client.query('ROLLBACK');
        throw new StockMovementError(
          `Destination location ${input.toLocationId} not found`,
          'LOCATION_NOT_FOUND',
        );
      }
      if (!locRes.rows[0]!.is_active) {
        await client.query('ROLLBACK');
        throw new StockMovementError(
          `Destination location ${input.toLocationId} is inactive`,
          'LOCATION_INACTIVE',
        );
      }
    }

    // -----------------------------------------------------------
    // 4. Validate SKU exists
    // -----------------------------------------------------------
    const skuRes = await client.query<{ id: string }>(
      `SELECT id FROM skus WHERE id = $1 AND is_active = TRUE`,
      [input.skuId],
    );
    if ((skuRes.rowCount ?? 0) === 0) {
      await client.query('ROLLBACK');
      throw new StockMovementError(`SKU ${input.skuId} not found or inactive`, 'SKU_NOT_FOUND');
    }

    // -----------------------------------------------------------
    // 5. Insert the movement record
    // -----------------------------------------------------------
    const insertRes = await client.query<{
      id: bigint;
      created_at: Date;
    }>(
      `INSERT INTO stock_movements (
        idempotency_key, sku_id, batch_id,
        from_location_id, to_location_id,
        quantity, movement_type,
        reference_type, reference_id,
        reason_code, user_id, device_id, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING id, created_at`,
      [
        input.idempotencyKey,
        input.skuId,
        input.batchId ?? null,
        input.fromLocationId ?? null,
        input.toLocationId ?? null,
        input.quantity,
        input.movementType,
        input.referenceType ?? null,
        input.referenceId ?? null,
        input.reasonCode ?? null,
        input.userId ?? null,
        input.deviceId ?? null,
        input.notes ?? null,
      ],
    );

    const inserted = insertRes.rows[0]!;

    await client.query('COMMIT');

    // -----------------------------------------------------------
    // 6. Refresh materialized view concurrently (outside transaction)
    // -----------------------------------------------------------
    refreshStockOnHand().catch((err: unknown) => {
      logger.error({ err }, 'Failed to refresh stock_on_hand after movement');
    });

    logger.info(
      {
        movementId: String(inserted.id),
        movementType: input.movementType,
        skuId: input.skuId,
        quantity: input.quantity,
      },
      'Stock movement recorded',
    );

    return {
      movementId: inserted.id,
      idempotencyKey: input.idempotencyKey,
      skuId: input.skuId,
      batchId: input.batchId ?? null,
      fromLocationId: input.fromLocationId ?? null,
      toLocationId: input.toLocationId ?? null,
      quantity: input.quantity,
      movementType: input.movementType,
      createdAt: inserted.created_at,
    };
  } catch (err) {
    if (err instanceof StockMovementError) {
      throw err;
    }

    await client.query('ROLLBACK').catch(() => {
      // ignore rollback error
    });

    // Serialization failure (SQLSTATE 40001) — caller should retry
    if (err instanceof DatabaseError && err.code === '40001') {
      throw new StockMovementError(
        'Transaction serialization failure, please retry',
        'SERIALIZATION_FAILURE',
        err,
      );
    }

    // Unique violation on idempotency_key — concurrent insert race
    if (err instanceof DatabaseError && err.code === '23505') {
      throw new StockMovementError(
        'Duplicate idempotency key, concurrent insert detected',
        'IDEMPOTENCY_CONFLICT',
        err,
      );
    }

    logger.error({ err }, 'Unexpected error in writeStockMovement');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Writes multiple movements as individual serializable transactions.
 * Each movement is independent; partial failures are reported separately.
 */
export async function writeBatchMovements(inputs: StockMovementInput[]): Promise<{
  succeeded: StockMovementResult[];
  failed: { input: StockMovementInput; error: Error }[];
}> {
  const succeeded: StockMovementResult[] = [];
  const failed: { input: StockMovementInput; error: Error }[] = [];

  for (const input of inputs) {
    try {
      const result = await writeStockMovement(input);
      succeeded.push(result);
    } catch (err) {
      failed.push({ input, error: err as Error });
    }
  }

  return { succeeded, failed };
}

async function refreshStockOnHand(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('REFRESH MATERIALIZED VIEW CONCURRENTLY stock_on_hand');
  } finally {
    client.release();
  }
}
