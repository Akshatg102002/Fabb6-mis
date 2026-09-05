import { z } from 'zod';

export const stockQuerySchema = z.object({
  sku_id: z.string().uuid().optional(),
  location_id: z.string().uuid().optional(),
  batch_id: z.string().uuid().optional(),
  site_id: z.string().uuid().optional(),
  include_empty: z.coerce.boolean().default(false),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

export const movementQuerySchema = z.object({
  sku_id: z.string().uuid().optional(),
  location_id: z.string().uuid().optional(),
  movement_type: z
    .enum([
      'grn_receipt',
      'putaway',
      'pick',
      'pack_confirm',
      'dispatch',
      'customer_return',
      'rto_receipt',
      'transfer_out',
      'transfer_in_transit',
      'transfer_receipt',
      'cycle_count_adjustment',
      'stock_adjustment',
      'writeoff',
      'quarantine',
      'unquarantine',
    ])
    .optional(),
  from_date: z.string().datetime().optional(),
  to_date: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const transferSchema = z.object({
  sku_id: z.string().uuid(),
  batch_id: z.string().uuid().optional(),
  from_location_id: z.string().uuid(),
  to_location_id: z.string().uuid(),
  quantity: z.number().int().positive(),
  reason_code: z.string().max(50).optional(),
  notes: z.string().max(500).optional(),
});

export type StockQuery = z.infer<typeof stockQuerySchema>;
export type MovementQuery = z.infer<typeof movementQuerySchema>;
export type TransferInput = z.infer<typeof transferSchema>;
