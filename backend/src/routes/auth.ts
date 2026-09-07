import express, { Router } from 'express';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { pool } from '../db/index.js';
import { users, sessions } from '../db/schema/index.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { loginSchema, logoutSchema } from '../schemas/auth.js';
import { logger } from '../logger.js';

const router: express.Router = Router();

// GET /auth/users — list active users by name for device login picker
router.get('/users', async (req, res) => {
  const siteId = req.query['site_id'] as string | undefined;
  const allUsers = await db.query.users.findMany({
    where: siteId ? and(eq(users.is_active, true), eq(users.site_id, siteId)) : eq(users.is_active, true),
    columns: { id: true, name: true, role: true, site_id: true },
    orderBy: (u, { asc }) => [asc(u.name)],
  });
  res.json({ users: allUsers });
});

// POST /auth/login — PIN-only login; backend iterates active users to find matching hash
router.post('/login', validate({ body: loginSchema }), async (req, res) => {
  const { pin, device_id } = req.body as {
    pin: string;
    device_id: string;
  };

  const allUsers = await db.query.users.findMany({
    where: eq(users.is_active, true),
  });

  let user: typeof allUsers[number] | null = null;
  for (const candidate of allUsers) {
    const match = await argon2.verify(candidate.pin_hash, pin);
    if (match) { user = candidate; break; }
  }

  if (!user) {
    logger.warn({ deviceId: device_id }, 'Failed PIN login attempt');
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const site_id: string | null = null;

  // Revoke any existing sessions for this user + device
  await db
    .update(sessions)
    .set({ revoked_at: new Date() })
    .where(
      and(
        eq(sessions.user_id, user.id),
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

  // Update last_login_at (fire and forget)
  pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]).catch(() => {});

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

// POST /auth/forgot-pin — request OTP via email
router.post('/forgot-pin', async (req, res) => {
  const { email } = req.body as { email?: string };

  if (!email) {
    res.status(400).json({ error: 'email is required' });
    return;
  }

  const userRow = await pool.query<{ id: string; name: string; email: string | null }>(
    'SELECT id, name, email FROM users WHERE email = $1 AND is_active = true LIMIT 1',
    [email.toLowerCase().trim()],
  );

  if (userRow.rowCount === 0) {
    // Don't reveal whether the email exists
    res.json({ ok: true, message: 'If that email is registered, an OTP has been sent.' });
    return;
  }

  const user = userRow.rows[0]!;
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const otpHash = createHash('sha256').update(otp).digest('hex');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await pool.query(
    'UPDATE users SET email_otp_hash = $1, email_otp_expires_at = $2 WHERE id = $3',
    [otpHash, expiresAt, user.id],
  );

  // Try to send email; fail silently if SMTP not configured
  try {
    const smtpCfg = await pool.query<{ key: string; value: string }>(
      "SELECT key, value FROM system_settings WHERE key LIKE 'smtp_%'",
    );
    const cfg: Record<string, string> = {};
    for (const row of smtpCfg.rows) cfg[row.key] = row.value;

    if (cfg['smtp_host'] && cfg['smtp_user'] && cfg['smtp_pass']) {
      const { default: nodemailer } = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host: cfg['smtp_host'],
        port: parseInt(cfg['smtp_port'] ?? '587', 10),
        secure: cfg['smtp_secure'] === 'true',
        auth: { user: cfg['smtp_user'], pass: cfg['smtp_pass'] },
      });
      await transporter.sendMail({
        from: cfg['smtp_from'] ?? cfg['smtp_user'],
        to: email,
        subject: 'Fabb6 WMS — PIN Reset OTP',
        text: `Hi ${user.name},\n\nYour OTP to reset your PIN is: ${otp}\n\nThis code expires in 15 minutes.\n\nIf you did not request this, please ignore this email.`,
      });
      logger.info({ userId: user.id }, 'OTP email sent for PIN reset');
    }
  } catch (err) {
    logger.error({ err }, 'Failed to send OTP email');
  }

  res.json({ ok: true, message: 'If that email is registered, an OTP has been sent.' });
});

// PATCH /auth/reset-pin — verify OTP and set new PIN
router.patch('/reset-pin', async (req, res) => {
  const { email, otp, new_pin } = req.body as {
    email?: string; otp?: string; new_pin?: string;
  };

  if (!email || !otp || !new_pin) {
    res.status(400).json({ error: 'email, otp, and new_pin are required' });
    return;
  }

  if (!/^\d{4,8}$/.test(new_pin)) {
    res.status(400).json({ error: 'new_pin must be 4–8 digits' });
    return;
  }

  const otpHash = createHash('sha256').update(otp).digest('hex');

  const userRow = await pool.query<{ id: string; email_otp_hash: string | null; email_otp_expires_at: Date | null }>(
    'SELECT id, email_otp_hash, email_otp_expires_at FROM users WHERE email = $1 AND is_active = true LIMIT 1',
    [email.toLowerCase().trim()],
  );

  const user = userRow.rows[0];
  if (!user || user.email_otp_hash !== otpHash) {
    res.status(401).json({ error: 'Invalid or expired OTP' });
    return;
  }

  if (!user.email_otp_expires_at || new Date() > user.email_otp_expires_at) {
    res.status(401).json({ error: 'OTP has expired. Please request a new one.' });
    return;
  }

  const pinHash = await argon2.hash(new_pin, {
    type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1,
  });

  await pool.query(
    'UPDATE users SET pin_hash = $1, email_otp_hash = NULL, email_otp_expires_at = NULL, updated_at = NOW() WHERE id = $2',
    [pinHash, user.id],
  );

  logger.info({ userId: user.id }, 'PIN reset via OTP');
  res.json({ ok: true, message: 'PIN reset successfully. Please login with your new PIN.' });
});

export default router;
