import type { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { eq, and, gt, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sessions, users } from '../db/schema/index.js';
import type { UserRole } from '../db/schema/index.js';
import { logger } from '../index.js';

export interface AuthContext {
  userId: string;
  sessionId: string;
  role: UserRole;
  siteId: string | null;
  deviceId: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

function extractToken(req: Request): string | null {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7) ?? null;
  }
  return null;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Missing authorization token' });
    return;
  }

  const tokenHash = hashToken(token);

  const session = await db.query.sessions.findFirst({
    where: and(
      eq(sessions.token_hash, tokenHash),
      gt(sessions.expires_at, new Date()),
      isNull(sessions.revoked_at),
    ),
  });

  if (!session) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return;
  }

  const user = await db.query.users.findFirst({
    where: and(eq(users.id, session.user_id), eq(users.is_active, true)),
  });

  if (!user) {
    res.status(401).json({ error: 'User not found or inactive' });
    return;
  }

  // Update last_seen_at asynchronously (fire and forget)
  db.update(sessions)
    .set({ last_seen_at: new Date() })
    .where(eq(sessions.id, session.id))
    .catch((err: unknown) => logger.error({ err }, 'Failed to update session last_seen_at'));

  req.auth = {
    userId: session.user_id,
    sessionId: session.id,
    role: session.role,
    siteId: session.site_id,
    deviceId: session.device_id,
  };

  next();
}

export function requireRoles(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (!roles.includes(req.auth.role)) {
      res.status(403).json({
        error: 'Forbidden',
        message: `Required role: ${roles.join(' or ')}. Your role: ${req.auth.role}`,
      });
      return;
    }
    next();
  };
}

export function requireSite(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth?.siteId) {
    res.status(403).json({ error: 'No site assigned to this session' });
    return;
  }
  next();
}

export function hashSessionToken(token: string): string {
  return hashToken(token);
}
