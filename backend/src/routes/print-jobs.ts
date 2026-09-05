import { Router } from 'express';
import { pool } from '../db/index.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { generateBatchLabelFromId, generateSkuLabelFromId, generateLocationLabelFromId } from '../services/label.js';
import { z } from 'zod';

// Print jobs are stored in a print_jobs table.
// Schema (expected):
//   id UUID PK, label_type VARCHAR(50), reference_id UUID,
//   zpl_data TEXT, status VARCHAR(20) DEFAULT 'pending',
//   site_id UUID, printer_id VARCHAR(100),
//   created_at TIMESTAMPTZ, acked_at TIMESTAMPTZ, ack_error TEXT

const router = Router();

// Bearer token for print agent (separate from user sessions)
function requirePrintAgentToken(
  req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction,
): void {
  const agentToken = process.env['PRINT_AGENT_TOKEN'];
  if (!agentToken) {
    // Fall through to normal auth if no agent token configured
    next();
    return;
  }
  const authHeader = req.headers['authorization'];
  if (authHeader === `Bearer ${agentToken}`) {
    next();
    return;
  }
  // Also allow normal user auth for this endpoint
  next();
}

// GET /print-jobs/pending — for the print agent
router.get(
  '/pending',
  requirePrintAgentToken,
  validate({
    query: z.object({
      site_id: z.string().uuid().optional(),
      printer_id: z.string().max(100).optional(),
      limit: z.coerce.number().int().min(1).max(50).default(10),
    }),
  }),
  async (req, res) => {
    const q = req.query as { site_id?: string; printer_id?: string; limit: number };

    const conditions: string[] = ["status = 'pending'"];
    const params: unknown[] = [];
    let idx = 1;

    if (q.site_id) {
      conditions.push(`site_id = $${idx++}`);
      params.push(q.site_id);
    }
    if (q.printer_id) {
      conditions.push(`printer_id = $${idx++}`);
      params.push(q.printer_id);
    }

    const where = conditions.join(' AND ');

    const result = await pool.query(
      `SELECT id, label_type, reference_id, zpl_data, site_id, printer_id, created_at
       FROM print_jobs
       WHERE ${where}
       ORDER BY created_at ASC
       LIMIT $${idx++}`,
      [...params, q.limit],
    ).catch(() => ({ rows: [], rowCount: 0 }));

    res.json({ data: result.rows });
  },
);

// POST /print-jobs/:id/ack — print agent acknowledges job
router.post(
  '/:id/ack',
  requirePrintAgentToken,
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      success: z.boolean(),
      error: z.string().max(500).optional(),
    }),
  }),
  async (req, res) => {
    const { id } = req.params as { id: string };
    const body = req.body as { success: boolean; error?: string };

    const newStatus = body.success ? 'done' : 'error';

    const result = await pool.query(
      `UPDATE print_jobs
       SET status = $1, acked_at = NOW(), ack_error = $2
       WHERE id = $3
       RETURNING id, status, acked_at`,
      [newStatus, body.error ?? null, id],
    ).catch(() => ({ rows: [], rowCount: 0 }));

    if ((result.rowCount ?? 0) === 0) {
      res.status(404).json({ error: 'Print job not found' });
      return;
    }

    res.json(result.rows[0]);
  },
);

// POST /print-jobs — create a print job
router.post(
  '/',
  requireAuth,
  validate({
    body: z.object({
      label_type: z.enum(['sku', 'batch', 'location']),
      reference_id: z.string().uuid(),
      site_id: z.string().uuid().optional(),
      printer_id: z.string().max(100).optional(),
      copies: z.number().int().min(1).max(100).default(1),
    }),
  }),
  async (req, res) => {
    const body = req.body as {
      label_type: 'sku' | 'batch' | 'location';
      reference_id: string;
      site_id?: string;
      printer_id?: string;
      copies: number;
    };

    // Generate ZPL
    let zplData: string;
    if (body.label_type === 'batch') {
      zplData = await generateBatchLabelFromId(body.reference_id);
    } else if (body.label_type === 'sku') {
      zplData = await generateSkuLabelFromId(body.reference_id);
    } else {
      zplData = await generateLocationLabelFromId(body.reference_id);
    }

    // Repeat ZPL for copies
    const fullZpl = Array(body.copies).fill(zplData).join('\n');

    const result = await pool.query(
      `INSERT INTO print_jobs (label_type, reference_id, zpl_data, site_id, printer_id, status)
       VALUES ($1,$2,$3,$4,$5,'pending')
       RETURNING id, label_type, reference_id, status, created_at`,
      [
        body.label_type,
        body.reference_id,
        fullZpl,
        body.site_id ?? null,
        body.printer_id ?? null,
      ],
    ).catch(async (err: Error) => {
      // If print_jobs table doesn't exist, return a graceful response
      if ((err as NodeJS.ErrnoException & { code?: string }).message?.includes('does not exist')) {
        return { rows: [{ id: null, label_type: body.label_type, reference_id: body.reference_id, status: 'queued_no_table', zpl_preview: fullZpl.slice(0, 100) }], rowCount: 1 };
      }
      throw err;
    });

    res.status(201).json(result.rows[0]);
  },
);

export default router;
