import { z } from 'zod';

export const createPickListSchema = z.object({
  site_id: z.string().uuid(),
  channel: z.enum(['shopify', 'b2b', 'transfer', 'manual']).default('shopify'),
  priority: z.number().int().min(0).max(100).default(0),
  notes: z.string().max(2000).optional(),
  lines: z
    .array(
      z.object({
        order_ref: z.string().min(1).max(100),
        sku_id: z.string().uuid(),
        qty_required: z.number().int().positive(),
        line_number: z.number().int().positive(),
      }),
    )
    .min(1),
});

export const assignPickListSchema = z.object({
  assigned_to: z.string().uuid(),
});

export const confirmPickLineSchema = z.object({
  pick_line_id: z.string().uuid(),
  qty_picked: z.number().int().min(0),
  location_id: z.string().uuid(),
  batch_id: z.string().uuid().optional(),
});

export const confirmPickSchema = z.object({
  picks: z.array(confirmPickLineSchema).min(1),
});

export const confirmPackSchema = z.object({
  pick_list_id: z.string().uuid(),
  package_count: z.number().int().positive().default(1),
  courier: z.string().max(100).optional(),
  tracking_number: z.string().max(100).optional(),
});

export const pickQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum([
      'pending',
      'assigned',
      'in_progress',
      'partially_picked',
      'picked',
      'packed',
      'dispatched',
      'cancelled',
    ])
    .optional(),
  assigned_to: z.string().uuid().optional(),
  site_id: z.string().uuid().optional(),
});

export type CreatePickListInput = z.infer<typeof createPickListSchema>;
export type AssignPickListInput = z.infer<typeof assignPickListSchema>;
export type ConfirmPickInput = z.infer<typeof confirmPickSchema>;
export type ConfirmPackInput = z.infer<typeof confirmPackSchema>;
export type PickQuery = z.infer<typeof pickQuerySchema>;
