import { z } from 'zod';

export const createPoSchema = z.object({
  supplier_id: z.string().uuid(),
  site_id: z.string().uuid(),
  po_number: z.string().min(1).max(50),
  expected_date: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
  lines: z
    .array(
      z.object({
        sku_id: z.string().uuid(),
        ordered_qty: z.number().int().positive(),
        unit_cost: z.number().positive().optional(),
        line_number: z.number().int().positive(),
      }),
    )
    .min(1),
});

export const createGrnSchema = z.object({
  po_id: z.string().uuid().optional(),
  supplier_invoice_no: z.string().max(100).optional(),
  site_id: z.string().uuid(),
  grn_number: z.string().min(1).max(50),
  notes: z.string().max(2000).optional(),
  lines: z
    .array(
      z.object({
        sku_id: z.string().uuid(),
        batch_number: z.string().min(1).max(100),
        mfg_date: z.string().datetime().optional(),
        expiry_date: z.string().datetime().optional(),
        qty_received: z.number().int().positive(),
        qty_accepted: z.number().int().min(0),
        qty_rejected: z.number().int().min(0).default(0),
        rejection_reason: z.string().max(500).optional(),
        unit_cost: z.number().positive().optional(),
        line_number: z.number().int().positive(),
      }),
    )
    .min(1),
});

export const postGrnSchema = z.object({
  receiving_location_id: z.string().uuid(),
});

export const grnQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  site_id: z.string().uuid().optional(),
  po_id: z.string().uuid().optional(),
  status: z.enum(['draft', 'in_progress', 'completed', 'posted']).optional(),
});

export type CreatePoInput = z.infer<typeof createPoSchema>;
export type CreateGrnInput = z.infer<typeof createGrnSchema>;
export type PostGrnInput = z.infer<typeof postGrnSchema>;
export type GrnQuery = z.infer<typeof grnQuerySchema>;
