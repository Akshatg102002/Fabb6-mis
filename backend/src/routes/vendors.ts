import express, { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { suppliers } from '../db/schema/index.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router: express.Router = Router();

// ── GET /vendors ──────────────────────────────────────────────────────────────

router.get('/', requireAuth, async (req, res) => {
  const rows = await db
    .select({
      id: suppliers.id,
      vendor_code: suppliers.vendor_code,
      name: suppliers.name,
      gstin: suppliers.gstin,
      city: suppliers.city,
      email: suppliers.contact_email,
      is_active: suppliers.is_active,
    })
    .from(suppliers)
    .orderBy(suppliers.name);

  res.json(rows);
});

// ── GET /vendors/:id ──────────────────────────────────────────────────────────

router.get(
  '/:id',
  requireAuth,
  validate({ params: z.object({ id: z.string().uuid() }) }),
  async (req, res) => {
    const supplier = await db.query.suppliers.findFirst({
      where: eq(suppliers.id, req.params['id'] as string),
    });

    if (!supplier) {
      res.status(404).json({ error: 'Vendor not found' });
      return;
    }

    res.json({
      id: supplier.id,
      vendor_code: supplier.vendor_code,
      name: supplier.name,
      gstin: supplier.gstin,
      city: supplier.city,
      email: supplier.contact_email,
      contact_name: supplier.contact_name,
      contact_phone: supplier.contact_phone,
      address: supplier.address,
      is_active: supplier.is_active,
      created_at: supplier.created_at,
      updated_at: supplier.updated_at,
    });
  },
);

// ── POST /vendors ─────────────────────────────────────────────────────────────

router.post(
  '/',
  requireAuth,
  validate({
    body: z.object({
      name: z.string().min(1).max(255),
      gstin: z.string().max(15).optional(),
      vendor_code: z.string().max(50).optional(),
      city: z.string().max(100).optional(),
      contact_name: z.string().max(255).optional(),
      contact_phone: z.string().max(20).optional(),
      contact_email: z.string().email().max(255).optional(),
      address: z.string().optional(),
    }),
  }),
  async (req, res) => {
    const body = req.body as {
      name: string;
      gstin?: string;
      vendor_code?: string;
      city?: string;
      contact_name?: string;
      contact_phone?: string;
      contact_email?: string;
      address?: string;
    };

    const [supplier] = await db
      .insert(suppliers)
      .values({
        name: body.name,
        gstin: body.gstin ?? null,
        vendor_code: body.vendor_code ?? null,
        city: body.city ?? null,
        contact_name: body.contact_name ?? null,
        contact_phone: body.contact_phone ?? null,
        contact_email: body.contact_email ?? null,
        address: body.address ?? null,
        is_active: true,
      })
      .returning();

    res.status(201).json({
      id: supplier!.id,
      vendor_code: supplier!.vendor_code,
      name: supplier!.name,
      gstin: supplier!.gstin,
      city: supplier!.city,
      email: supplier!.contact_email,
    });
  },
);

// ── PATCH /vendors/:id ────────────────────────────────────────────────────────

router.patch(
  '/:id',
  requireAuth,
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      name: z.string().min(1).max(255).optional(),
      gstin: z.string().max(15).nullable().optional(),
      vendor_code: z.string().max(50).nullable().optional(),
      city: z.string().max(100).nullable().optional(),
      contact_name: z.string().max(255).nullable().optional(),
      contact_phone: z.string().max(20).nullable().optional(),
      contact_email: z.string().email().max(255).nullable().optional(),
      address: z.string().nullable().optional(),
      is_active: z.boolean().optional(),
    }),
  }),
  async (req, res) => {
    const id = req.params['id'] as string;
    const body = req.body as {
      name?: string;
      gstin?: string | null;
      vendor_code?: string | null;
      city?: string | null;
      contact_name?: string | null;
      contact_phone?: string | null;
      contact_email?: string | null;
      address?: string | null;
      is_active?: boolean;
    };

    const updates: Record<string, unknown> = { updated_at: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.gstin !== undefined) updates.gstin = body.gstin;
    if (body.vendor_code !== undefined) updates.vendor_code = body.vendor_code;
    if (body.city !== undefined) updates.city = body.city;
    if (body.contact_name !== undefined) updates.contact_name = body.contact_name;
    if (body.contact_phone !== undefined) updates.contact_phone = body.contact_phone;
    if (body.contact_email !== undefined) updates.contact_email = body.contact_email;
    if (body.address !== undefined) updates.address = body.address;
    if (body.is_active !== undefined) updates.is_active = body.is_active;

    const [updated] = await db
      .update(suppliers)
      .set(updates)
      .where(eq(suppliers.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: 'Vendor not found' });
      return;
    }

    res.json({
      id: updated.id,
      vendor_code: updated.vendor_code,
      name: updated.name,
      gstin: updated.gstin,
      city: updated.city,
      email: updated.contact_email,
      is_active: updated.is_active,
    });
  },
);

// ── DELETE /vendors/:id (soft-delete via is_active = false) ──────────────────

router.delete(
  '/:id',
  requireAuth,
  validate({ params: z.object({ id: z.string().uuid() }) }),
  async (req, res) => {
    const id = req.params['id'] as string;

    const [updated] = await db
      .update(suppliers)
      .set({ is_active: false, updated_at: new Date() })
      .where(eq(suppliers.id, id))
      .returning({ id: suppliers.id });

    if (!updated) {
      res.status(404).json({ error: 'Vendor not found' });
      return;
    }

    res.json({ id: updated.id, is_active: false });
  },
);

export default router;
