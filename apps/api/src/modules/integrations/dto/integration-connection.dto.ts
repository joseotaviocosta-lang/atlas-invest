import { z } from 'zod';

/**
 * Phase 5P-D — connection actions take no client-controlled fields.
 * Source travels in the path (validated against the connectable
 * allow-list); provider/environment are server constants. The strict
 * empty schema turns any injected token, URL, provider or environment
 * field into a 400 instead of silently ignoring it.
 */
export const IntegrationConnectionActionBodySchema = z.object({}).strict();

export type IntegrationConnectionActionBody = z.infer<typeof IntegrationConnectionActionBodySchema>;
