import { z } from 'zod';

export const createSkuSchema = z.object({
  code: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  brand_id: z.string().uuid().optional(),
  category_id: z.string().uuid().optional(),
  hsn_code: z.string().max(8).optional(),
  gst_rate: z.number().min(0).max(100).default(18),
  mrp: z.number().positive().optional(),
  standard_cost: z.number().positive().optional(),
  pack_size: z.number().int().positive().default(1),
  uom: z.string().max(20).default('EACH'),
  shelf_life_tracked: z.boolean().default(false),
  min_shelf_life_days: z.number().int().positive().optional(),
  abc_class: z.enum(['A', 'B', 'C']).default('C'),
  is_active: z.boolean().default(true),
});

export const updateSkuSchema = createSkuSchema.partial();

export const skuQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(100).optional(),
  brand_id: z.string().uuid().optional(),
  category_id: z.string().uuid().optional(),
  abc_class: z.enum(['A', 'B', 'C']).optional(),
  is_active: z.coerce.boolean().optional(),
});

export const createGtinSchema = z.object({
  barcode: z.string().min(1).max(50),
  sku_id: z.string().uuid(),
  source: z.enum(['supplier', 'manual', 'shopify', 'scan']).default('manual'),
  is_primary: z.boolean().default(false),
});

export const linkGtinSchema = z.object({
  sku_id: z.string().uuid(),
  is_primary: z.boolean().optional(),
});

export const barcodeQuerySchema = z.object({
  barcode: z.string().min(1).max(50),
});

export type CreateSkuInput = z.infer<typeof createSkuSchema>;
export type UpdateSkuInput = z.infer<typeof updateSkuSchema>;
export type SkuQuery = z.infer<typeof skuQuerySchema>;
export type CreateGtinInput = z.infer<typeof createGtinSchema>;
