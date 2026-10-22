import { z } from 'zod';
import { B3TransportError } from './errors';

/**
 * Phase 5O-B — transport validation boundary.
 *
 * Rule: only schemas confirmed by official B3 documentation are strict.
 * Everything else crosses the boundary as validated `unknown` JSON and is
 * structurally validated by the 5P per-API mapper, which fails closed with
 * `INVALID_UPSTREAM_PAYLOAD`. No `any` anywhere: unknown means unknown.
 */
export const B3UnknownJsonSchema = z
  .unknown()
  .describe('Boundary envelope: JSON parsed, structurally unvalidated by transport');

const CIVIL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Description-level request shape for API Guia ("documentos ... que possuam
 * dados na data e no produto informado"). Field names and response structure
 * are UNCONFIRMED_REQUIRES_B3_CERT_PACKAGE; the date/product semantics are
 * confirmed by the public catalog description.
 */
export const B3GuiaQuerySchema = z
  .object({
    referenceDate: z.string().regex(CIVIL_DATE_PATTERN, 'referenceDate must be YYYY-MM-DD'),
    product: z.string().min(1, 'product must be named'),
  })
  .describe('UNCONFIRMED_REQUIRES_B3_CERT_PACKAGE');

export type B3GuiaQuery = z.infer<typeof B3GuiaQuerySchema>;

/** Minimal authorized-document reference: exact fields UNCONFIRMED. */
export const B3DocumentReferenceSchema = z
  .object({ document: z.string().min(1) })
  .passthrough()
  .describe('UNCONFIRMED_REQUIRES_B3_CERT_PACKAGE');

/** Guia response envelope (authorized documents): UNCONFIRMED. */
export const B3GuiaResponseSchema = z
  .object({ documents: z.array(B3DocumentReferenceSchema) })
  .describe('UNCONFIRMED_REQUIRES_B3_CERT_PACKAGE');

/** Period filter for Movimentação/Negociação-style queries (D-1 bounded). */
export const B3PeriodQuerySchema = z
  .object({
    dateFrom: z.string().regex(CIVIL_DATE_PATTERN, 'dateFrom must be YYYY-MM-DD'),
    dateTo: z.string().regex(CIVIL_DATE_PATTERN, 'dateTo must be YYYY-MM-DD'),
  })
  .refine((value) => value.dateFrom <= value.dateTo, {
    message: 'dateFrom must not be after dateTo',
  })
  .describe('UNCONFIRMED_REQUIRES_B3_CERT_PACKAGE');

export type B3PeriodQuery = z.infer<typeof B3PeriodQuerySchema>;

/**
 * Parses an upstream payload against a strict schema. Anything that does not
 * validate is an `INVALID_UPSTREAM_PAYLOAD` — it never reaches the adapter,
 * let alone the ledger.
 */
export function parseB3JsonPayload<T>(schema: z.ZodType<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new B3TransportError(
      'INVALID_UPSTREAM_PAYLOAD',
      `B3 payload failed transport validation: ${parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; ')}`,
    );
  }
  return parsed.data;
}
