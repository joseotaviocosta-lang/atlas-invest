import { describe, expect, it } from 'vitest';
import {
  REVIEW_FILTERS,
  REVIEW_SEVERITY_PRESENTATION,
  REVIEW_SEVERITIES,
  buildReviewItemSummaryLines,
  buildReviewItemTitle,
  describeIntegrationRunTrigger,
  describeResolvedReason,
  describeReviewReason,
  describeScheduleCadence,
  describeScheduleFrequency,
  describeScheduleNextRun,
  reviewActionFor,
  reviewActionHref,
} from '@atlas/ui';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Phase 5P-B — review inbox UX (shared presentation + web/mobile surface).
 *
 * The inbox shows derived operational facts: severity, reasons, counts and
 * safe routing hints. Fingerprints, external ids, raw errors, payloads and
 * secrets never render. Severity is always text-labeled, never color-only.
 */
describe('Phase 5P-B: review inbox UX', () => {
  function item(overrides = {}) {
    return {
      source: 'B3',
      trigger: 'SCHEDULED',
      severity: 'WARNING' as const,
      reasonCodes: ['PROBABLE_DUPLICATE'] as never[],
      metrics: {
        newRecords: 0,
        probableDuplicates: 2,
        conflicts: 0,
        unsupported: 0,
        invalid: 0,
        divergent: 0,
        missingLocal: 0,
        missingSource: 0,
        unresolved: 0,
        partial: false,
      },
      ...overrides,
    };
  }

  it('maps every severity to human copy with tone', () => {
    expect([...REVIEW_SEVERITIES].sort()).toEqual(['ERROR', 'REVIEW', 'WARNING']);
    expect(REVIEW_SEVERITY_PRESENTATION.REVIEW).toMatchObject({ label: 'Revisão', tone: 'info' });
    expect(REVIEW_SEVERITY_PRESENTATION.WARNING).toMatchObject({
      label: 'Atenção',
      tone: 'warning',
    });
    expect(REVIEW_SEVERITY_PRESENTATION.ERROR).toMatchObject({ label: 'Falha', tone: 'danger' });
    for (const entry of Object.values(REVIEW_SEVERITY_PRESENTATION)) {
      expect(entry.label.trim().length).toBeGreaterThan(0);
      expect(entry.description.trim().length).toBeGreaterThan(0);
    }
  });

  it('titles never promise frozen candidates or automatic import', () => {
    expect(buildReviewItemTitle(item({ severity: 'ERROR', reasonCodes: [] }))).toBe(
      'Não foi possível concluir uma sincronização',
    );
    expect(
      buildReviewItemTitle(
        item({ reasonCodes: ['CONFLICT'], metrics: { ...item().metrics, conflicts: 1 } }),
      ),
    ).toBe('Conflito de dados precisa de resolução');
    expect(
      buildReviewItemTitle(
        item({
          severity: 'REVIEW',
          reasonCodes: ['NEW_RECORDS'],
          metrics: { ...item().metrics, newRecords: 5 },
        }),
      ),
    ).toBe('5 novas operações aguardam revisão');
    expect(
      buildReviewItemTitle(
        item({
          severity: 'REVIEW',
          reasonCodes: ['NEW_RECORDS'],
          metrics: { ...item().metrics, newRecords: 1 },
        }),
      ),
    ).toBe('1 nova operação aguarda revisão');
  });

  it('reason copy uses evident language (possible, not certain)', () => {
    const lower = (code: string) => describeReviewReason(code).toLowerCase();
    expect(lower('PROBABLE_DUPLICATE')).toContain('possíveis duplicidades');
    expect(lower('CONFLICT')).toContain('conflito de dados');
    expect(lower('POSITION_DIVERGENCE')).toContain('diferença encontrada');
    expect(lower('MISSING_LOCAL_POSITION')).toContain('não na carteira');
    expect(lower('MISSING_SOURCE_POSITION')).toContain('não encontrado na fonte');
    expect(lower('PARTIAL_SYNC')).toContain('parcialmente');
    expect(lower('SYNC_FAILED')).toContain('não foi concluída');
    expect(lower('UNSUPPORTED_RECORD')).toContain('não são suportados');
  });

  it('summary lines stay factual and never claim silent success', () => {
    const lines = buildReviewItemSummaryLines(
      item({
        severity: 'REVIEW',
        reasonCodes: ['NEW_RECORDS'],
        metrics: { ...item().metrics, newRecords: 4 },
      }),
    );
    expect(lines.map((line) => line.text).join(' | ')).toContain('4 novas operações encontradas');
    expect(
      buildReviewItemSummaryLines(item({ severity: 'ERROR', reasonCodes: ['SYNC_FAILED'] }))
        .map((line) => line.text)
        .join(' | '),
    ).toContain('a sincronização não foi concluída');
    expect(buildReviewItemSummaryLines(item({ severity: 'REVIEW', reasonCodes: [] }))).toEqual([
      { text: 'Nenhuma ação pendente.', tone: 'neutral' },
    ]);
  });

  it('actions resolve to functional review routes, never dead ends', () => {
    expect(reviewActionFor({ kind: 'REVIEW_RUN', runId: 'r', portfolioId: 'p' })).toMatchObject({
      kind: 'REVIEW_RUN',
      label: 'Revisar',
    });
    expect(reviewActionFor({ kind: 'VIEW_RUN', runId: 'r', portfolioId: 'p' })).toMatchObject({
      kind: 'VIEW_RUN',
      label: 'Ver detalhes',
    });
    expect(reviewActionHref({ kind: 'REVIEW_RUN', runId: 'r', portfolioId: 'p' })).toBe(
      '/portfolio/import?portfolioId=p&runId=r',
    );
  });

  it('resolved states explain themselves without 404 jargon', () => {
    expect(describeResolvedReason('CONFIRMED')).toContain('concluída');
    expect(describeResolvedReason('SUPERSEDED')).toContain('mais recente');
    expect(describeResolvedReason('NO_ACTION')).toBe('Nenhuma ação pendente.');
    expect(describeResolvedReason('IN_PROGRESS')).toContain('andamento');
  });

  it('filters cover the minimum useful set', () => {
    expect(REVIEW_FILTERS.map((filter) => filter.label)).toEqual([
      'Todas',
      'Revisão',
      'Avisos',
      'Falhas',
    ]);
  });

  it('web inbox page lists actionable items with states and functional CTAs', () => {
    const page = fs.readFileSync(
      path.join(process.cwd(), 'apps/web/src/app/(app)/reviews/page.tsx'),
      'utf8',
    );
    expect(page).toContain('Pendências');
    expect(page).toContain('/api/v1/integration-reviews');
    expect(page).toContain('Nenhuma pendência no momento');
    expect(page).toContain('reviewsQuery.isLoading');
    expect(page).toContain('reviewsQuery.isError');
    expect(page).toContain('reviewsQuery.refetch()');
    expect(page).toContain('reviewActionHref');
    expect(page).toContain('aria-pressed');
    expect(page).toContain('aria-label');
    expect(page).not.toMatch(/fingerprint/i);
    expect(page).not.toMatch(/externalId/);
    expect(page).not.toMatch(/parseFloat|Math\.pow|Math\.sqrt/);
  });

  it('web entry points surface the count without a nav-tab change', () => {
    const layout = fs.readFileSync(
      path.join(process.cwd(), 'apps/web/src/app/(app)/layout.tsx'),
      'utf8',
    );
    expect(layout).toContain('/reviews');
    expect(layout).toContain('integration-reviews');
    expect(layout).toContain('Pendências:');
    // The 5 canonical tabs stay frozen; inbox rides the header utility area.
    expect(layout).toContain('CANONICAL_NAV_ITEMS.map');
    const today = fs.readFileSync(
      path.join(process.cwd(), 'apps/web/src/app/(app)/today/page.tsx'),
      'utf8',
    );
    expect(today).toContain('Ver pendências');
    expect(today).toContain('/reviews');
    const importPage = fs.readFileSync(
      path.join(process.cwd(), 'apps/web/src/app/(app)/portfolio/import/page.tsx'),
      'utf8',
    );
    expect(importPage).toContain("searchParams.get('runId')");
    expect(importPage).toContain('Nova sincronização disponível');
  });

  it('mobile inbox is read-only with an explicit web-handoff note', () => {
    const screen = fs.readFileSync(
      path.join(process.cwd(), 'apps/mobile/app/(app)/reviews.tsx'),
      'utf8',
    );
    expect(screen).toContain('integration-reviews');
    expect(screen).toContain('Nenhuma pendência no momento');
    expect(screen).toContain('versão web');
    // Read-only: no import/confirm mutations from the native screen.
    expect(screen).not.toMatch(/imports\/confirm|imports\/preview/);
    expect(screen).not.toMatch(/\.post\(|\.put\(|\.patch\(/);
    const today = fs.readFileSync(
      path.join(process.cwd(), 'apps/mobile/app/(app)/(tabs)/today.tsx'),
      'utf8',
    );
    expect(today).toContain('/(app)/reviews');
    expect(today).toContain('Ver pendências');
  });

  it('attention events stay transport-free (no email/push/SMS/WhatsApp)', () => {
    const engine = fs.readFileSync(
      path.join(process.cwd(), 'packages/import-engine/src/review-inbox.ts'),
      'utf8',
    );
    expect(engine).not.toMatch(/smtp|sendgrid|resend|firebase|expo-notifications|twilio/i);
    expect(engine).not.toMatch(/whatsapp/i);
    expect(engine).not.toMatch(/new\s+WebSocket|EventSource\(/);
    // The reusable event contract exists for a future external phase;
    // nothing is sent in this phase (covered behaviorally in import-engine tests).
    expect(engine).toContain('INTEGRATION_ATTENTION_EVENT_VERSION');
    expect(engine).toContain('export function buildAttentionEvents');
  });

  it('reuses trigger and schedule copy without duplicating vocabulary', () => {
    expect(describeIntegrationRunTrigger('SCHEDULED').label).toBe('Agendada');
    expect(describeScheduleCadence('WEEKDAYS')).toBe('Dias úteis');
    expect(
      describeScheduleNextRun('2026-06-16T11:00:00.000Z', true, 'America/Sao_Paulo'),
    ).toContain('Próxima:');
    expect(
      describeScheduleFrequency({
        cadence: 'DAILY',
        hourLocal: 8,
        minuteLocal: 0,
        timezone: 'America/Sao_Paulo',
      }),
    ).toBe('Todo dia às 08:00 (America/Sao_Paulo)');
  });
});
