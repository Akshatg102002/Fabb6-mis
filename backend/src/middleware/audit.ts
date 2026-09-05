import type { Request, Response, NextFunction } from 'express';
import { db } from '../db/index.js';
import { auditLog } from '../db/schema/index.js';
import { logger } from '../logger.js';

export interface AuditOptions {
  entity: string;
  action: string;
  getEntityId: (req: Request, resBody: unknown) => string;
  getBefore?: (req: Request) => Promise<unknown>;
}

/**
 * Audit log middleware factory. Wraps a route handler to record audit events.
 */
export function withAudit(options: AuditOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    auditRequest(options, req, res, next).catch((err: unknown) => {
      logger.error({ err }, 'Audit middleware setup error');
      next(err);
    });
  };
}

async function auditRequest(
  options: AuditOptions,
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  let beforeState: unknown = undefined;

  if (options.getBefore) {
    try {
      beforeState = await options.getBefore(req);
    } catch (err) {
      logger.warn({ err }, 'Audit: failed to capture before state');
    }
  }

  const originalJson = res.json.bind(res);

  res.json = function (body: unknown) {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      let entityId: string;
      try {
        entityId = options.getEntityId(req, body);
      } catch {
        entityId = (req.params['id'] as string | undefined) ?? 'unknown';
      }

      db.insert(auditLog)
        .values({
          user_id: req.auth?.userId ?? null,
          entity: options.entity,
          entity_id: entityId,
          action: options.action,
          before: beforeState as Record<string, unknown> | null,
          after: body as Record<string, unknown>,
          ip_address: req.ip ?? null,
          device_id: req.auth?.deviceId ?? null,
        })
        .catch((err: unknown) => {
          logger.error({ err }, 'Failed to write audit log entry');
        });
    }

    return originalJson(body);
  };

  next();
}

/**
 * Direct audit log writer for use inside service/business logic.
 */
export async function writeAuditLog(opts: {
  userId?: string | null;
  entity: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
  deviceId?: string | null;
}): Promise<void> {
  await db.insert(auditLog).values({
    user_id: opts.userId ?? null,
    entity: opts.entity,
    entity_id: opts.entityId,
    action: opts.action,
    before: opts.before as Record<string, unknown> | null,
    after: opts.after as Record<string, unknown> | null,
    ip_address: opts.ipAddress ?? null,
    device_id: opts.deviceId ?? null,
  });
}
