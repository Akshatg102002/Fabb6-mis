import { z } from 'zod';

export const createSiteSchema = z.object({
  name: z.string().min(1).max(255),
  address: z.string().max(1000).optional(),
  gstin: z.string().max(15).optional(),
  is_active: z.boolean().default(true),
});

export const updateSiteSchema = createSiteSchema.partial();

export const createLocationSchema = z.object({
  site_id: z.string().uuid(),
  code: z.string().min(1).max(50),
  type: z.enum(['receiving', 'bin', 'pick_face', 'quarantine', 'dispatch', 'returns']),
  aisle: z.string().max(10).optional(),
  rack: z.string().max(10).optional(),
  shelf: z.string().max(10).optional(),
  position: z.string().max(10).optional(),
  capacity_units: z.number().int().positive().optional(),
  is_active: z.boolean().default(true),
});

export const updateLocationSchema = createLocationSchema.partial();

export const locationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  site_id: z.string().uuid().optional(),
  type: z.enum(['receiving', 'bin', 'pick_face', 'quarantine', 'dispatch', 'returns']).optional(),
  is_active: z.coerce.boolean().optional(),
});

export type CreateSiteInput = z.infer<typeof createSiteSchema>;
export type UpdateSiteInput = z.infer<typeof updateSiteSchema>;
export type CreateLocationInput = z.infer<typeof createLocationSchema>;
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
export type LocationQuery = z.infer<typeof locationQuerySchema>;
