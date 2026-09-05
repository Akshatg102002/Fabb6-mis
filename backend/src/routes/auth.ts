import { Router } from 'express';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, sessions } from '../db/schema/index.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { loginSchema, logoutSchema } from '../schemas/auth.js';
import { logger } from '../index.js';

const router = Router();

// POST /auth/login
router.post('/login', validate({ body: loginSchema }), async (req, res) => {
  const { user_id, pin, device_id, site_id } = req.body as {
    user_id: string;
    pin: string;
    device_id: string;
    site_id?: string;
  };

  const user = await db.query.users.findFirst({
    where: and(eq(users.id, user_id), eq(users.is_active, true)),
  });

  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const pinValid = await argon2.verify(user.pin_hash, pin);
  if (!pinValid) {
    logger.warn({ userId: user_id, deviceId: device_id }, 'Failed PIN login attempt');
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  // Revoke any existing sessions for this user + device
  await db
    .update(sessions)
    .set({ revoked_at: new Date() })
    .where(
      and(
        eq(sessions.user_id, user_id),
        eq(sessions.device_id, device_id),
        isNull(sessions.revoked_at),
      ),
    );

  // Generate session token
  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const ttlSeconds = parseInt(process.env['SESSION_TTL_SECONDS'] ?? '28800', 10);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  const effectiveSiteId = site_id ?? user.site_id ?? null;

  const [session] = await db
    .insert(sessions)
    .values({
      user_id: user.id,
      device_id,
      role: user.role,
      site_id: effectiveSiteId,
      token_hash: tokenHash,
      expires_at: expiresAt,
      ttl_seconds: ttlSeconds,
      ip_address: req.ip ?? null,
      user_agent: req.headers['user-agent'] ?? null,
    })
    .returning();

  logger.info({ userId: user.id, role: user.role, deviceId: device_id }, 'User logged in');

  res.status(200).json({
    token,
    session_id: session!.id,
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      site_id: effectiveSiteId,
    },
    expires_at: expiresAt.toISOString(),
  });
});

// POST /auth/logout
router.post('/logout', requireAuth, validate({ body: logoutSchema }), async (req, res) => {
  const { all_devices } = req.body as { all_devices: boolean };
  const auth = req.auth!;

  if (all_devices) {
    await db
      .update(sessions)
      .set({ revoked_at: new Date() })
      .where(and(eq(sessions.user_id, auth.userId), isNull(sessions.revoked_at)));
    logger.info({ userId: auth.userId }, 'User logged out from all devices');
  } else {
    await db
      .update(sessions)
      .set({ revoked_at: new Date() })
      .where(eq(sessions.id, auth.sessionId));
    logger.info({ userId: auth.userId, sessionId: auth.sessionId }, 'User logged out');
  }

  res.status(200).json({ message: 'Logged out successfully' });
});

// GET /auth/me
router.get('/me', requireAuth, async (req, res) => {
  const auth = req.auth!;

  const user = await db.query.users.findFirst({
    where: eq(users.id, auth.userId),
    columns: {
      id: true,
      name: true,
      role: true,
      site_id: true,
      is_active: true,
      created_at: true,
    },
  });

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({
    user,
    session: {
      id: auth.sessionId,
      role: auth.role,
      site_id: auth.siteId,
      device_id: auth.deviceId,
    },
  });
});

// POST /auth/pin/change — only admins or self
router.post('/pin/change', requireAuth, async (req, res) => {
  const auth = req.auth!;
  const { current_pin, new_pin, user_id } = req.body as {
    current_pin?: string;
    new_pin: string;
    user_id?: string;
  };

  const targetId = user_id ?? auth.userId;
  const isSelf = targetId === auth.userId;
  const isAdmin = auth.role === 'admin';

  if (!isSelf && !isAdmin) {
    res.status(403).json({ error: 'Cannot change another user\'s PIN' });
    return;
  }

  if (!new_pin || !/^\d{4,8}$/.test(new_pin)) {
    res.status(400).json({ error: 'New PIN must be 4-8 digits' });
    return;
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, targetId),
  });

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // Require current PIN if self-change
  if (isSelf && !isAdmin) {
    if (!current_pin) {
      res.status(400).json({ error: 'current_pin is required' });
      return;
    }
    const valid = await argon2.verify(user.pin_hash, current_pin);
    if (!valid) {
      res.status(401).json({ error: 'Current PIN is incorrect' });
      return;
    }
  }

  const newHash = await argon2.hash(new_pin, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  await db.update(users).set({ pin_hash: newHash }).where(eq(users.id, targetId));

  logger.info({ targetId, changedBy: auth.userId }, 'PIN changed');
  res.json({ message: 'PIN updated successfully' });
});

export default router;
