import { z } from 'zod';

const competenceField = z
  .string()
  .regex(/^\d{4}-\d{2}$/, 'Must be YYYY-MM')
  .refine(
    (month) => {
      const m = parseInt(month.slice(5, 7), 10);
      return m >= 1 && m <= 12;
    },
    { message: 'Must be a valid calendar month (YYYY-MM)' },
  );

export const TaxIntelligenceQuerySchema = z.object({
  competence: competenceField.optional(),
});

export type TaxIntelligenceQuery = z.infer<typeof TaxIntelligenceQuerySchema>;
