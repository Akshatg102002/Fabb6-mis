import { z } from 'zod';

export const createCycleCountSchema = z.object({
  site_id: z.string().uuid(),
  location_id: z.string().uuid().optional(),
  scheduled_for: z.string().datetime().optional(),
  count_number: z.string().min(1).max(50),
});

export const submitCountLinesSchema = z.object({
  lines: z
    .array(
      z.object({
        line_id: z.string().uuid(),
        counted_qty: z.number().int().min(0),
      }),
    )
    .min(1),
});

export const approveCountSchema = z.object({
  approved: z.boolean(),
  notes: z.string().max(500).optional(),
});

export const countQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  site_id: z.string().uuid().optional(),
  status: z
    .enum([
      'scheduled',
      'in_progress',
      'counted',
      'under_review',
      'approved',
      'posted',
      'cancelled',
    ])
    .optional(),
});

export type CreateCycleCountInput = z.infer<typeof createCycleCountSchema>;
export type SubmitCountLinesInput = z.infer<typeof submitCountLinesSchema>;
export type ApproveCountInput = z.infer<typeof approveCountSchema>;
export type CountQuery = z.infer<typeof countQuerySchema>;
