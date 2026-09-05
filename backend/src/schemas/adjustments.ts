import { z } from 'zod';

export const createAdjustmentSchema = z.object({
  sku_id: z.string().uuid(),
  batch_id: z.string().uuid().optional(),
  location_id: z.string().uuid(),
  quantity: z.number().int().refine((n) => n !== 0, 'Quantity cannot be zero'),
  reason_code: z.string().min(1).max(50),
  reason_notes: z.string().max(500).optional(),
  adjustment_number: z.string().min(1).max(50),
});

export const approveAdjustmentSchema = z.object({
  approved: z.boolean(),
  rejection_reason: z.string().max(500).optional(),
});

export const adjustmentQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sku_id: z.string().uuid().optional(),
  location_id: z.string().uuid().optional(),
  status: z.enum(['pending', 'approved', 'rejected', 'posted']).optional(),
});

export type CreateAdjustmentInput = z.infer<typeof createAdjustmentSchema>;
export type ApproveAdjustmentInput = z.infer<typeof approveAdjustmentSchema>;
export type AdjustmentQuery = z.infer<typeof adjustmentQuerySchema>;
