import { z } from 'zod';

export const loginSchema = z.object({
  user_id: z.string().uuid('Must be a valid UUID'),
  pin: z
    .string()
    .min(4, 'PIN must be at least 4 digits')
    .max(8, 'PIN must be at most 8 digits')
    .regex(/^\d+$/, 'PIN must contain only digits'),
  device_id: z.string().min(1).max(255),
  site_id: z.string().uuid().optional(),
});

export const logoutSchema = z.object({
  all_devices: z.boolean().optional().default(false),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
