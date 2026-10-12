import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { apiClient } from '@/api/client';
import {
  mapToTaxComplianceReminderViewModel,
  mapToTaxComplianceReminderListViewModel,
  mapToTaxReminderPreferencesViewModel,
  buildTaxReminderActionPayload,
  buildTaxReminderDeliveryPayload,
  taxReminderSnoozeDateError,
  parseTaxReminderLeadTimes,
  TAX_REMINDER_STALE_MESSAGE,
  TAX_REMINDER_ACTION_NOT_RESOLVED_WARNING,
  TAX_REMINDER_SUPPORT_DISCLAIMER,
  type RawTaxComplianceReminder,
} from '@atlas/ui';

const COMPONENT = 'apps/web/src/components/fiscal/TaxComplianceRemindersSection.tsx';
const PAGE = 'apps/web/src/app/(app)/tax/page.tsx';

function sampleReminder(
  overrides: Partial<RawTaxComplianceReminder> = {},
): RawTaxComplianceReminder {
  return {
    reminderKey: 'rem:2026-09:abc123',
    taxSubjectId: 'subj-1',
    obligationKey: 'obl:2026-09:6015',
    sourceFingerprint: 'f'.repeat(64),
    kind: 'UPCOMING_DUE',
    triggerAt: '2026-09-20',
    effectiveAt: '2026-09-20',
    status: 'PENDING',
    severity: 'INFO',
    title: 'DARF de setembro vence em breve',
    message: 'Apoio: verifique a apuração de setembro.',
    actionTarget: null,
    deliveryChannels: ['IN_APP'],
    dedupKey: 'dedup-1',
    sourceVersion: '4K.3',
    snoozedUntil: null,
    actedAt: null,
    isStale: false,
    ...overrides,
  };
}

describe('Web: tax compliance reminders UX (Phase 4K.3)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('maps upcoming/overdue/stale/action groups from mocked reminders', () => {
    const raws = [
      sampleReminder({ kind: 'UPCOMING_DUE' }),
      sampleReminder({
        reminderKey: 'rem:2026-08:x1',
        kind: 'OVERDUE',
        title: 'DARF de agosto em atraso',
      }),
      sampleReminder({
        reminderKey: 'rem:2026-08:x2',
        kind: 'STALE_SOURCE',
        status: 'SUPERSEDED',
        isStale: true,
        title: 'Apuração recalculada',
      }),
      sampleReminder({
        reminderKey: 'rem:2026-08:x3',
        kind: 'EVIDENCE_REQUIRED',
        title: 'Envie o comprovante',
      }),
    ];
    const vms = mapToTaxComplianceReminderListViewModel(raws);
    const byKey = new Map(vms.map((v) => [v.reminderKey, v]));
    expect(byKey.get('rem:2026-09:abc123')?.group).toBe('upcoming');
    expect(byKey.get('rem:2026-08:x1')?.group).toBe('overdue');
    expect(byKey.get('rem:2026-08:x2')?.group).toBe('stale');
    expect(byKey.get('rem:2026-08:x3')?.group).toBe('action');

    expect(byKey.get('rem:2026-09:abc123')?.kindLabel).toBe('Vence em breve');
    expect(byKey.get('rem:2026-08:x1')?.kindLabel).toBe('Vencido');
    expect(byKey.get('rem:2026-08:x3')?.kindLabel).toBe('Comprovante necessário');
    expect(byKey.get('rem:2026-08:x2')?.statusLabel).toContain('dados alterados');

    // Server strings rendered verbatim, dates formatted for display
    expect(byKey.get('rem:2026-09:abc123')?.title).toBe('DARF de setembro vence em breve');
    expect(byKey.get('rem:2026-09:abc123')?.triggerAtFormatted).toBe('20/09/2026');
    expect(byKey.get('rem:2026-09:abc123')?.effectiveAtFormatted).toBe('20/09/2026');
  });

  it('renders snoozed effective date and stale flags without inventing amounts', () => {
    const vm = mapToTaxComplianceReminderViewModel(
      sampleReminder({ status: 'SNOOZED', snoozedUntil: '2026-10-05', isStale: false }),
    );
    expect(vm.snoozedUntilFormatted).toBe('05/10/2026');
    expect(vm).not.toHaveProperty('amount');
    expect(vm).not.toHaveProperty('totalCost');
    expect(JSON.stringify(vm)).not.toMatch(/R\$/);
  });

  it('builds acknowledge/dismiss payloads with the exact server shape', () => {
    const raw = sampleReminder();
    expect(buildTaxReminderActionPayload(raw, 'ACKNOWLEDGE')).toEqual({
      actionType: 'ACKNOWLEDGE',
      obligationKey: 'obl:2026-09:6015',
      reminderKind: 'UPCOMING_DUE',
      triggerAt: '2026-09-20',
      sourceFingerprint: 'f'.repeat(64),
    });
    expect(buildTaxReminderActionPayload(raw, 'DISMISS', { note: '  pago no banco  ' })).toEqual({
      actionType: 'DISMISS',
      obligationKey: 'obl:2026-09:6015',
      reminderKind: 'UPCOMING_DUE',
      triggerAt: '2026-09-20',
      sourceFingerprint: 'f'.repeat(64),
      note: 'pago no banco',
    });
  });

  it('requires a valid civil date for snooze and includes it in the payload', () => {
    const raw = sampleReminder();
    expect(() => buildTaxReminderActionPayload(raw, 'SNOOZE')).toThrow(/nova data/i);
    expect(() =>
      buildTaxReminderActionPayload(raw, 'SNOOZE', { snoozedUntil: '20/10/2026' }),
    ).toThrow(/AAAA-MM-DD/);
    expect(() =>
      buildTaxReminderActionPayload(raw, 'SNOOZE', { snoozedUntil: '2026-02-30' }),
    ).toThrow(/civil válida/);
    expect(taxReminderSnoozeDateError('2026-10-20')).toBeNull();
    expect(buildTaxReminderActionPayload(raw, 'SNOOZE', { snoozedUntil: '2026-10-20' })).toEqual({
      actionType: 'SNOOZE',
      obligationKey: 'obl:2026-09:6015',
      reminderKind: 'UPCOMING_DUE',
      triggerAt: '2026-09-20',
      sourceFingerprint: 'f'.repeat(64),
      snoozedUntil: '2026-10-20',
    });
  });

  it('builds delivery payloads and parses lead-time configuration', () => {
    expect(buildTaxReminderDeliveryPayload(sampleReminder(), 'IN_APP')).toEqual({
      sourceFingerprint: 'f'.repeat(64),
      channel: 'IN_APP',
      triggerAt: '2026-09-20',
    });
    expect(parseTaxReminderLeadTimes('30, 7, 1')).toEqual([30, 7, 1]);
    expect(parseTaxReminderLeadTimes('')).toBeNull();
    expect(parseTaxReminderLeadTimes('7, abc')).toBeNull();
    const prefs = mapToTaxReminderPreferencesViewModel({
      remindersEnabled: true,
      upcomingEnabled: true,
      overdueEnabled: false,
      annualEnabled: true,
      leadTimes: [30, 7, 1],
    });
    expect(prefs?.leadTimesLabel).toBe('30d, 7d, 1d');
  });

  it('fetches reminders through the canonical endpoint and encodes reminder keys', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: [sampleReminder()] }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;
    const res = await apiClient.get<{ data: RawTaxComplianceReminder[] }>(
      '/api/v1/fiscal/compliance/reminders?calendarYear=2026',
    );
    const vms = mapToTaxComplianceReminderListViewModel(res.data);
    expect(vms).toHaveLength(1);
    expect(vms[0]?.reminderKey).toBe('rem:2026-09:abc123');

    const component = fs.readFileSync(path.join(process.cwd(), COMPONENT), 'utf8');
    expect(component).toContain('encodeURIComponent(reminder.reminderKey)');
    expect(component).toContain('/api/v1/fiscal/compliance/reminders');
    expect(component).toContain('/deliveries');
  });

  it('shows the not-resolved warning on acknowledge/dismiss and the stale message', () => {
    expect(TAX_REMINDER_ACTION_NOT_RESOLVED_WARNING).toMatch(/não resolve a obrigação fiscal/i);
    expect(TAX_REMINDER_STALE_MESSAGE).toContain(
      'Os dados desta obrigação foram alterados. Revise novamente antes de considerar o item resolvido.',
    );
    const component = fs.readFileSync(path.join(process.cwd(), COMPONENT), 'utf8');
    expect(component).toContain('TAX_REMINDER_ACTION_NOT_RESOLVED_WARNING');
    expect(component).toContain('TAX_REMINDER_STALE_MESSAGE');
    expect(component).toContain('TAX_REMINDER_SUPPORT_DISCLAIMER');
  });

  it('renders upcoming/overdue/stale/action groups with actions, preferences, history and disclaimer', () => {
    const component = fs.readFileSync(path.join(process.cwd(), COMPONENT), 'utf8');
    expect(component).toContain('Próximos vencimentos');
    expect(component).toContain('Vencidos');
    expect(component).toContain('Dados alterados');
    expect(component).toContain('Ações necessárias');
    expect(component).toContain('Reconhecer');
    expect(component).toContain('Dispensar');
    expect(component).toContain('Confirmar adiamento');
    expect(component).toContain('Nova data de exibição');
    expect(component).toContain('Histórico de entregas');
    expect(component).toContain('Registrar entrega');
    expect(component).toContain('Preferências de lembretes');
    expect(component).toContain('Salvar prazos');
    expect(component).toContain('TAX_REMINDER_SUPPORT_DISCLAIMER');
    expect(TAX_REMINDER_SUPPORT_DISCLAIMER).toBe(
      'O Atlas não processa pagamentos nem transmite dados à Receita Federal',
    );
    // Preferences round-trip through PUT with the full body
    expect(component).toContain('/api/v1/fiscal/compliance/reminder-preferences');
    expect(component).toContain('.put');
    // Reminder keys contain ':' so URLs must encode them
    expect(component).toContain('encodeURIComponent');
    // Loading / empty / error-with-retry states
    expect(component).toContain('Skeleton');
    expect(component).toContain('EmptyState');
    expect(component).toContain('Tentar novamente');
    // Accessibility: labeled snooze input, aria labels, 44px targets
    expect(component).toContain('htmlFor');
    expect(component).toContain('aria-label');
    expect(component).toContain('MIN_TOUCH_PX');
  });

  it('performs no client financial math and never invents reminder amounts', () => {
    const component = fs.readFileSync(path.join(process.cwd(), COMPONENT), 'utf8');
    expect(component).not.toMatch(/parseFloat/);
    expect(component).not.toMatch(/calculateTax|computeTax|computeDue|calculateDue/i);
    expect(component).not.toMatch(/amount.*\+|total.*\+.*amount/i);
    expect(TAX_REMINDER_SUPPORT_DISCLAIMER).toBe(
      'O Atlas não processa pagamentos nem transmite dados à Receita Federal',
    );
  });

  it('is wired into the fiscal tax page', () => {
    const page = fs.readFileSync(path.join(process.cwd(), PAGE), 'utf8');
    expect(page).toContain('TaxComplianceRemindersSection');
  });
});
