import { z } from 'zod';

export const createReturnSchema = z.object({
  type: z.enum(['customer_return', 'rto']),
  order_ref: z.string().max(100).optional(),
  courier_awb: z.string().max(100).optional(),
  return_number: z.string().min(1).max(50),
  notes: z.string().max(2000).optional(),
  lines: z
    .array(
      z.object({
        sku_id: z.string().uuid(),
        batch_id: z.string().uuid().optional(),
        qty: z.number().int().positive(),
        line_number: z.number().int().positive(),
      }),
    )
    .min(1),
});

export const inspectReturnLineSchema = z.object({
  lines: z
    .array(
      z.object({
        line_id: z.string().uuid(),
        qc_grade: z.enum(['A', 'B', 'damaged', 'expired']),
        disposition: z.enum(['restock', 'repack', 'writeoff']),
        batch_id: z.string().uuid().optional(),
        location_id: z.string().uuid(),
        notes: z.string().max(500).optional(),
      }),
    )
    .min(1),
});

export const returnQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z.enum(['customer_return', 'rto']).optional(),
  status: z.enum(['pending', 'received', 'inspected', 'completed', 'cancelled']).optional(),
});

export type CreateReturnInput = z.infer<typeof createReturnSchema>;
export type InspectReturnInput = z.infer<typeof inspectReturnLineSchema>;
export type ReturnQuery = z.infer<typeof returnQuerySchema>;
