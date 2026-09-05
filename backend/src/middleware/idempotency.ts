import type { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { eq, lt } from 'drizzle-orm';
import { db } from '../db/index.js';
import { idempotencyKeys } from '../db/schema/index.js';
import { logger } from '../logger.js';

const IDEMPOTENCY_HEADER = 'idempotency-key';
const IDEMPOTENCY_TTL_HOURS = 24;

function hashBody(body: unknown): string {
  const str = typeof body === 'string' ? body : JSON.stringify(body);
  return createHash('sha256').update(str).digest('hex');
}

/**
 * Idempotency middleware for mutating endpoints (POST, PUT, PATCH).
 * If a request with an Idempotency-Key that was already processed comes in,
 * the stored response is returned immediately.
 */
export function idempotency(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers[IDEMPOTENCY_HEADER];

  // Only applies to mutating methods
  if (!['POST', 'PUT', 'PATCH'].includes(req.method) || !key || Array.isArray(key)) {
    next();
    return;
  }

  processIdempotency(key, req, res, next).catch((err: unknown) => {
    logger.error({ err }, 'Idempotency middleware error');
    next(err);
  });
}

async function processIdempotency(
  key: string,
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = req.auth?.userId ?? null;

  // Check for existing record
  const existing = await db.query.idempotencyKeys.findFirst({
    where: eq(idempotencyKeys.key, key),
  });

  if (existing) {
    const requestBodyHash = hashBody(req.body);

    // Verify same request body
    if (existing.request_body_hash !== requestBodyHash) {
      res.status(422).json({
        error: 'Idempotency key conflict',
        message: 'A different request body was previously submitted with this idempotency key',
      });
      return;
    }

    // Return stored response
    logger.debug({ key }, 'Idempotency replay: returning cached response');
    res
      .status(parseInt(existing.response_status, 10))
      .setHeader('x-idempotency-replayed', 'true')
      .json(existing.response_body);
    return;
  }

  // Intercept the response to store it
  const originalJson = res.json.bind(res);
  const bodyHash = hashBody(req.body);

  res.json = function (body: unknown) {
    // Store the response (fire and forget)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + IDEMPOTENCY_TTL_HOURS);

    db.insert(idempotencyKeys)
      .values({
        key,
        user_id: userId,
        request_path: req.path,
        request_body_hash: bodyHash,
        response_status: String(res.statusCode),
        response_body: body as Record<string, unknown>,
        expires_at: expiresAt,
      })
      .catch((err: unknown) => {
        logger.error({ err, key }, 'Failed to store idempotency key');
      });

    return originalJson(body);
  };

  next();
}

/**
 * Cleanup expired idempotency keys - call this periodically.
 */
export async function cleanupExpiredIdempotencyKeys(): Promise<void> {
  await db.delete(idempotencyKeys).where(lt(idempotencyKeys.expires_at, new Date()));
}
