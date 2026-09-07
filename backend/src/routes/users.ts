import express, { Router } from 'express';
import * as argon2 from 'argon2';
import { pool } from '../db/index.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { logger } from '../logger.js';

const router: express.Router = Router();

const HASH_OPTS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

// GET /users — list all users
router.get('/', requireAuth, requireRoles('admin', 'supervisor'), async (_req, res) => {
  const result = await pool.query(
    `SELECT id, name, email, role, site_id, is_active, created_at, last_login_at
     FROM users ORDER BY name`,
  );
  res.json(result.rows);
});

// POST /users — create user (admin only)
router.post('/', requireAuth, requireRoles('admin'), async (req, res) => {
  const { name, role, pin, email } = req.body as {
    name?: string; role?: string; pin?: string; email?: string;
  };

  if (!name || !role || !pin) {
    res.status(400).json({ error: 'name, role, and pin are required' });
    return;
  }

  const validRoles = ['picker', 'packer', 'inward', 'returns', 'supervisor', 'admin', 'read_only'];
  if (!validRoles.includes(role)) {
    res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
    return;
  }

  if (!/^\d{4,8}$/.test(pin)) {
    res.status(400).json({ error: 'PIN must be 4–8 digits' });
    return;
  }

  const pin_hash = await argon2.hash(pin, HASH_OPTS);

  try {
    const result = await pool.query(
      `INSERT INTO users (name, role, pin_hash, email, is_active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, name, role, email, is_active, created_at`,
      [name.trim(), role, pin_hash, email?.trim() ?? null],
    );

    logger.info({ userId: result.rows[0]?.id, role }, 'User created');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'Email address already in use' });
      return;
    }
    throw err;
  }
});

// PATCH /users/:id — update user (admin only)
router.patch('/:id', requireAuth, requireRoles('admin'), async (req, res) => {
  const { name, role, email, is_active, new_pin } = req.body as {
    name?: string;
    role?: string;
    email?: string;
    is_active?: boolean;
    new_pin?: string;
  };

  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (name !== undefined) { sets.push(`name = $${idx++}`); params.push(name.trim()); }
  if (role !== undefined) { sets.push(`role = $${idx++}`); params.push(role); }
  if (email !== undefined) { sets.push(`email = $${idx++}`); params.push(email.trim() || null); }
  if (is_active !== undefined) { sets.push(`is_active = $${idx++}`); params.push(is_active); }

  if (new_pin !== undefined) {
    if (!/^\d{4,8}$/.test(new_pin)) {
      res.status(400).json({ error: 'PIN must be 4–8 digits' });
      return;
    }
    const hash = await argon2.hash(new_pin, HASH_OPTS);
    sets.push(`pin_hash = $${idx++}`);
    params.push(hash);
  }

  if (sets.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  sets.push('updated_at = NOW()');
  params.push(req.params['id']);

  try {
    const result = await pool.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${idx} RETURNING id, name, role, email, is_active`,
      params,
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'Email address already in use' });
      return;
    }
    throw err;
  }
});

export default router;
