import { z } from 'zod';
import { NOTIFICATION_CATEGORIES, NOTIFICATION_PRIORITIES } from '@atlas/domain';

export const GetNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  category: z.enum(NOTIFICATION_CATEGORIES).optional(),
  priority: z.enum(NOTIFICATION_PRIORITIES).optional(),
  portfolioId: z.string().uuid({ message: 'portfolioId must be a valid UUID' }).optional(),
});

export type GetNotificationsQueryDto = z.infer<typeof GetNotificationsQuerySchema>;
