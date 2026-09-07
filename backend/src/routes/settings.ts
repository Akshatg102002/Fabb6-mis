import express, { Router } from 'express';
import { pool } from '../db/index.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';

const router: express.Router = Router();

// GET /settings — return all settings as key-value object (admin + supervisor)
router.get('/', requireAuth, requireRoles('admin', 'supervisor'), async (_req, res) => {
  const result = await pool.query<{ key: string; value: string }>(
    'SELECT key, value FROM system_settings ORDER BY key',
  );
  const settings: Record<string, string> = {};
  for (const row of result.rows) {
    settings[row.key] = row.value;
  }
  res.json(settings);
});

// PUT /settings — upsert settings (admin only)
router.put('/', requireAuth, requireRoles('admin'), async (req, res) => {
  const body = req.body as Record<string, string>;
  const auth = req.auth!;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [key, value] of Object.entries(body)) {
      await client.query(
        `INSERT INTO system_settings (key, value, updated_at, updated_by)
         VALUES ($1, $2, NOW(), $3)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
        [key, String(value), auth.userId],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  res.json({ ok: true });
});

// POST /settings/test-email — send a test email (admin only)
router.post('/test-email', requireAuth, requireRoles('admin'), async (req, res) => {
  const { to } = req.body as { to?: string };

  if (!to) {
    res.status(400).json({ error: 'to address is required' });
    return;
  }

  const result = await pool.query<{ key: string; value: string }>(
    "SELECT key, value FROM system_settings WHERE key LIKE 'smtp_%'",
  );
  const cfg: Record<string, string> = {};
  for (const row of result.rows) {
    cfg[row.key] = row.value;
  }

  if (!cfg['smtp_host'] || !cfg['smtp_user'] || !cfg['smtp_pass']) {
    res.status(400).json({ error: 'SMTP not fully configured — set smtp_host, smtp_user, smtp_pass' });
    return;
  }

  try {
    const { default: nodemailer } = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host: cfg['smtp_host'],
      port: parseInt(cfg['smtp_port'] ?? '587', 10),
      secure: cfg['smtp_secure'] === 'true',
      auth: { user: cfg['smtp_user'], pass: cfg['smtp_pass'] },
    });

    await transporter.sendMail({
      from: cfg['smtp_from'] ?? cfg['smtp_user'],
      to,
      subject: 'Fabb6 WMS — Test Email',
      text: 'This is a test email from Fabb6 WMS. Your SMTP configuration is working correctly.',
    });

    res.json({ ok: true, message: `Test email sent to ${to}` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send test email', detail: String(err) });
  }
});

export default router;
