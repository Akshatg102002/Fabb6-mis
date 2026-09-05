import { z } from 'zod';

export const loginSchema = z.object({
  pin: z
    .string()
    .min(4, 'PIN must be at least 4 digits')
    .max(8, 'PIN must be at most 8 digits')
    .regex(/^\d+$/, 'PIN must contain only digits'),
  device_id: z.string().min(1).max(255),
});

export const logoutSchema = z.object({
  all_devices: z.boolean().optional().default(false),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
