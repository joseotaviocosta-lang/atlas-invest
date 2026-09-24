import { z } from 'zod';
import { DecimalStringSchema } from '@atlas/validation';

export const ScenarioDefinitionSchema = z
  .object({
    // Validated by @atlas/scenario-engine so invalid types surface the stable
    // SCENARIO.INVALID_TYPE code (not a generic validation error).
    type: z.string(),
    // EQUITY_PRICE_SHOCK
    shockPercentage: DecimalStringSchema.optional(),
    // BENCHMARK_SHOCK
    benchmarkId: z.enum(['IBOV']).optional(),
    // RATE_SHOCK
    rateShockBps: DecimalStringSchema.optional(),
    // COMBINED
    equityShockPercentage: DecimalStringSchema.optional(),
    benchmarkShockPercentage: DecimalStringSchema.optional(),
  })
  .strict();

export const RunScenarioBodySchema = z
  .object({
    // Parsed/validated by the use case (civil date + not-in-the-future) so an
    // invalid asOf surfaces the stable SCENARIO.INVALID_AS_OF code.
    asOf: z.string().optional(),
    scenario: ScenarioDefinitionSchema,
  })
  .strict();

export type RunScenarioBody = z.infer<typeof RunScenarioBodySchema>;
