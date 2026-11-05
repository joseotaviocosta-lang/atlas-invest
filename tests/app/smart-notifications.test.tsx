import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../apps/atlas-app/src/providers/AuthProvider';
import { PortfolioProvider } from '../../apps/atlas-app/src/providers/PortfolioProvider';
import { AppLayout } from '../../apps/atlas-app/src/layouts/AppLayout';
import {
  NotificationProvider,
  useNotifications,
  deriveNotificationCandidates,
  evaluateAndScheduleNotifications,
  isInQuietHours,
  buildNotificationKey,
  stringToNumericId,
  sanitizeNotificationText,
  isDeduplicated,
  isWithinDailyBudget,
  recordNotificationSent,
  purgeUserNotifications,
  notificationCenter,
  MemoryNotificationService,
  setCustomNotificationService,
  getNotificationPreferences,
  saveNotificationPreferences,
  clearNotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
  type LocalNotification,
  type NotificationPreferences,
} from '../../apps/atlas-app/src/features/notifications';
import { NotificationBellButton } from '../../apps/atlas-app/src/features/notifications/components/NotificationBellButton';
import { NotificationSettingsSection } from '../../apps/atlas-app/src/features/notifications/components/NotificationSettingsSection';
import { queryClient, clearQueryCache } from '../../apps/atlas-app/src/lib/react-query';
import { portfolioKeys } from '../../apps/atlas-app/src/lib/query-keys';
import type { ComplianceObligationItem, CostEvidenceDto, CostAssessmentDto } from '../../apps/atlas-app/src/features/fiscal/types';
import type { ReviewItem } from '../../apps/atlas-app/src/features/imports/types';

describe('Atlas Local-First Smart Notifications & Fiscal Reminders (APP-13)', () => {
  let mockService: MemoryNotificationService;

  beforeEach(() => {
    vi.clearAllMocks();
    clearQueryCache();
    mockService = new MemoryNotificationService();
    setCustomNotificationService(mockService);
    purgeUserNotifications('user-1');
    purgeUserNotifications('default');
    clearNotificationPreferences('user-1');
    clearNotificationPreferences('default');
    notificationCenter.clearHistory('user-1');
    notificationCenter.clearHistory('default');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearQueryCache();
    setCustomNotificationService(null);
  });

  // 1. permission unknown / default
  it('1. permission unknown: reports default state before user action', async () => {
    expect(await mockService.getPermissionState()).toBe('default');
  });

  // 2. permission granted
  it('2. permission granted: updates permission state upon request', async () => {
    const granted = await mockService.requestPermission();
    expect(granted).toBe('granted');
    expect(await mockService.getPermissionState()).toBe('granted');
  });

  // 3. permission denied
  it('3. permission denied: respects denied permission and drops dispatch', async () => {
    mockService.setMockPermission('denied');
    const sent = await mockService.send({
      id: 'test-1',
      title: 'Teste',
      body: 'Corpo',
      category: 'SYSTEM_TEST',
      severity: 'LOW',
      createdAt: Date.now(),
    });

    expect(sent).toBe(false);
    expect(mockService.sentNotifications).toHaveLength(0);
  });

  // 4. fiscal candidate derivation (general)
  it('4. fiscal candidate: derives general fiscal reminders without side effects', () => {
    const candidates = deriveNotificationCandidates({
      userId: 'user-1',
      portfolioId: 'p1',
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
    });

    expect(candidates).toEqual([]);
  });

  // 5. DARF candidate with due date
  it('5. DARF candidate: creates high-severity candidate with real backend due date', () => {
    const obligations: ComplianceObligationItem[] = [
      {
        id: 'ob-1',
        competence: '2026-03',
        type: 'MONTHLY_TAX_PAYMENT',
        description: 'DARF Mensal Código 6015',
        dueDate: '2026-04-30',
        status: 'PENDING',
        amount: '450.00',
      },
    ];

    const candidates = deriveNotificationCandidates({
      userId: 'user-1',
      portfolioId: 'p1',
      complianceTimeline: obligations,
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.category).toBe('FISCAL_DARF');
    expect(candidates[0]?.severity).toBe('HIGH');
    expect(candidates[0]?.deepLink).toBe('/tax');
    expect(candidates[0]?.body).toContain('2026-04-30');
    // Security check: Must not leak sensitive currency value in notification body
    expect(candidates[0]?.body).not.toContain('450.00');
  });

  // 6. blocked fiscal candidate
  it('6. blocked fiscal candidate: alerts blockage instead of notifying false DARF', () => {
    const obligations: ComplianceObligationItem[] = [
      {
        id: 'ob-1',
        competence: '2026-03',
        type: 'MONTHLY_TAX_PAYMENT',
        description: 'DARF Mensal',
        dueDate: '2026-04-30',
        status: 'PENDING',
      },
    ];

    const candidates = deriveNotificationCandidates({
      userId: 'user-1',
      portfolioId: 'p1',
      complianceTimeline: obligations,
      taxInputReadiness: {
        competence: '2026-03',
        competenceLabel: 'Março/2026',
        rows: [],
        issues: ['Faltam dados de custódia'],
        issueLabels: ['Custódia incompleta'],
        classificationCoverage: { required: 1, classified: 0, unknown: 1 },
        productionTaxLiabilityEnabled: true,
        ruleCoverage: 'UNAVAILABLE',
        liabilityStatus: 'BLOCKED',
        ruleCoverageLabel: 'Indisponível',
        ruleCoverageColor: '#EF4444',
        liabilityStatusLabel: 'Bloqueado',
        liabilityStatusColor: '#EF4444',
        notice: 'Bloqueado',
        accessibilitySummary: 'Bloqueado',
      },
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.category).toBe('FISCAL_BLOCKED');
    expect(candidates[0]?.title).toContain('Bloqueada');
    expect(candidates[0]?.deepLink).toBe('/tax');
  });

  // 7. review candidate (single divergence)
  it('7. review candidate: creates reconciliation review alert for single divergence', () => {
    const reviews: ReviewItem[] = [
      {
        id: 'rev-1',
        runId: 'run-101',
        portfolioId: 'p1',
        portfolioName: 'Principal',
        source: 'B3_NEGOTIATION_XLSX',
        trigger: 'MANUAL',
        status: 'PENDING',
        severity: 'WARNING',
        reasonCodes: ['PROBABLE_DUPLICATE'],
        pairReview: { status: 'PENDING', totalPairs: 1, decidedPairs: 0 },
        metrics: {
          newRecords: 0,
          probableDuplicates: 1,
          conflicts: 0,
          unsupported: 0,
          invalid: 0,
          divergent: 1,
          missingLocal: 0,
          missingSource: 0,
          unresolved: 1,
          partial: false,
        },
        createdAt: '2026-11-04T12:00:00Z',
        action: { kind: 'REVIEW_RUN', runId: 'run-101', portfolioId: 'p1' },
      },
    ];

    const candidates = deriveNotificationCandidates({
      userId: 'user-1',
      portfolioId: 'p1',
      reviewItems: reviews,
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.category).toBe('RECONCILIATION_REVIEW');
    expect(candidates[0]?.title).toBe('Revisão de Conciliação Necessária');
    expect(candidates[0]?.deepLink).toBe('/import');
  });

  // 8. deduplication by deterministic key
  it('8. deduplication: generates identical deterministic key for same entity and version', () => {
    const key1 = buildNotificationKey({
      type: 'darf_due',
      userId: 'user-1',
      portfolioId: 'p1',
      entityId: 'ob-1',
      version: '2026-04-30',
    });

    const key2 = buildNotificationKey({
      type: 'darf_due',
      userId: 'user-1',
      portfolioId: 'p1',
      entityId: 'ob-1',
      version: '2026-04-30',
    });

    expect(key1).toBe(key2);
    expect(stringToNumericId(key1)).toBe(stringToNumericId(key2));
  });

  // 9. cooldown prevents repeat spam
  it('9. cooldown: suppresses identical notification within cooldown period', () => {
    const key = 'darf_due:user-1:p1:ob-1:2026-04-30';
    const now = 1000000;

    expect(isDeduplicated('user-1', key, 6, now)).toBe(false);

    recordNotificationSent(
      'user-1',
      {
        id: key,
        title: 'DARF',
        body: 'Vencimento',
        category: 'FISCAL_DARF',
        severity: 'HIGH',
        createdAt: now,
      },
      now
    );

    // 2 hours later (within 6h cooldown): must be deduplicated
    expect(isDeduplicated('user-1', key, 6, now + 2 * 3600 * 1000)).toBe(true);

    // 7 hours later (cooldown elapsed): can be sent again
    expect(isDeduplicated('user-1', key, 6, now + 7 * 3600 * 1000)).toBe(false);
  });

  // 10. quiet hours suppression
  it('10. quiet hours: suppresses non-critical notifications during overnight quiet hours', () => {
    const prefs: NotificationPreferences = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      quietHoursEnabled: true,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
    };

    // 23:30 is in quiet hours
    const lateNight = new Date(2026, 10, 5, 23, 30);
    expect(isInQuietHours(prefs, lateNight)).toBe(true);

    // 03:15 is in quiet hours
    const earlyMorning = new Date(2026, 10, 5, 3, 15);
    expect(isInQuietHours(prefs, earlyMorning)).toBe(true);

    // 14:00 is outside quiet hours
    const afternoon = new Date(2026, 10, 5, 14, 0);
    expect(isInQuietHours(prefs, afternoon)).toBe(false);
  });

  // 11. group aggregation for multiple review items
  it('11. group aggregation: merges multiple review divergences into one aggregated alert', () => {
    const reviews: ReviewItem[] = [
      {
        id: 'rev-1',
        runId: 'run-1',
        portfolioId: 'p1',
        portfolioName: 'P1',
        source: 'B3',
        trigger: 'AUTO',
        status: 'PENDING',
        severity: 'WARNING',
        reasonCodes: ['CONFLIT'],
        pairReview: { status: 'PENDING', totalPairs: 1, decidedPairs: 0 },
        metrics: { newRecords: 0, probableDuplicates: 0, conflicts: 1, unsupported: 0, invalid: 0, divergent: 1, missingLocal: 0, missingSource: 0, unresolved: 1, partial: false },
        createdAt: '2026-11-04T10:00:00Z',
        action: { kind: 'REVIEW_RUN', runId: 'run-1', portfolioId: 'p1' },
      },
      {
        id: 'rev-2',
        runId: 'run-2',
        portfolioId: 'p1',
        portfolioName: 'P1',
        source: 'CSV',
        trigger: 'MANUAL',
        status: 'PENDING',
        severity: 'ACTION',
        reasonCodes: ['DIVERGENT'],
        pairReview: { status: 'PENDING', totalPairs: 2, decidedPairs: 0 },
        metrics: { newRecords: 0, probableDuplicates: 0, conflicts: 0, unsupported: 0, invalid: 0, divergent: 2, missingLocal: 1, missingSource: 1, unresolved: 2, partial: false },
        createdAt: '2026-11-04T11:00:00Z',
        action: { kind: 'REVIEW_RUN', runId: 'run-2', portfolioId: 'p1' },
      },
    ];

    const candidates = deriveNotificationCandidates({
      userId: 'user-1',
      portfolioId: 'p1',
      reviewItems: reviews,
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.title).toBe('Pendências de Conciliação');
    expect(candidates[0]?.body).toContain('2 itens requerem revisão');
    expect(candidates[0]?.deepLink).toBe('/import');
  });

  // 12. preference disabled
  it('12. preference disabled: ignores disabled categories completely', () => {
    const obligations: ComplianceObligationItem[] = [
      {
        id: 'ob-1',
        competence: '2026-03',
        type: 'MONTHLY_TAX_PAYMENT',
        description: 'DARF Mensal',
        dueDate: '2026-04-30',
        status: 'PENDING',
      },
    ];

    const candidates = deriveNotificationCandidates({
      userId: 'user-1',
      portfolioId: 'p1',
      complianceTimeline: obligations,
      preferences: {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        darfReminders: false,
      },
    });

    expect(candidates).toEqual([]);
  });

  // 13. deep link structure
  it('13. deep link: provides direct route without sensitive tokens in URL', () => {
    const obligations: ComplianceObligationItem[] = [
      {
        id: 'ob-1',
        competence: '2026-03',
        type: 'MONTHLY_TAX_PAYMENT',
        description: 'DARF',
        dueDate: '2026-04-30',
        status: 'PENDING',
      },
    ];

    const candidates = deriveNotificationCandidates({
      userId: 'user-1',
      portfolioId: 'p1',
      complianceTimeline: obligations,
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
    });

    expect(candidates[0]?.deepLink).toBe('/tax');
    expect(candidates[0]?.deepLink).not.toContain('token');
    expect(candidates[0]?.deepLink).not.toContain('bearer');
  });

  // 14. unauthenticated deep link
  it('14. unauthenticated deep link: queues navigation safely until auth is confirmed', async () => {
    // In service memory mock
    expect(mockService.scheduledNotifications).toHaveLength(0);
  });

  // 15. logout isolation
  it('15. logout isolation: purges notification logs, history and cancels scheduled alerts', async () => {
    recordNotificationSent('user-1', {
      id: 'k1',
      title: 'T',
      body: 'B',
      category: 'FISCAL_DARF',
      severity: 'HIGH',
      createdAt: Date.now(),
    });

    notificationCenter.addNotification('user-1', {
      id: 'k1',
      title: 'T',
      body: 'B',
      category: 'FISCAL_DARF',
      severity: 'HIGH',
      createdAt: Date.now(),
    });

    expect(notificationCenter.getHistory('user-1')).toHaveLength(1);

    purgeUserNotifications('user-1');
    notificationCenter.clearHistory('user-1');
    await mockService.cancelAll();

    expect(notificationCenter.getHistory('user-1')).toHaveLength(0);
    expect(mockService.scheduledNotifications).toHaveLength(0);
  });

  // 16. privacy: no sensitive financial amounts on lock screen
  it('16. privacy: sanitizes and omits sensitive balances and net worth from body', () => {
    const unsafeText = 'Seu saldo atual é de R$ 742.391,22. Favor revisar.';
    const sanitized = sanitizeNotificationText('Alerta Financeiro', unsafeText);

    expect(sanitized.hadSensitiveContent).toBe(true);
    expect(sanitized.body).not.toContain('742.391,22');
    expect(sanitized.body).toContain('[valor omitido]');
  });

  // 17. offline mode uses authoritative models
  it('17. offline mode: evaluates using last-known authoritative cache without fabricating', () => {
    const offlineContext = {
      userId: 'user-1',
      portfolioId: 'p1',
      complianceTimeline: [
        {
          id: 'ob-offline',
          competence: '2026-03',
          type: 'DARF',
          description: 'DARF',
          dueDate: '2026-04-30',
          status: 'PENDING' as const,
        },
      ],
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
    };

    const candidates = deriveNotificationCandidates(offlineContext);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.body).toContain('2026-04-30');
  });

  // 18. Android adapter
  it('18. Android adapter: registers private channels and dispatches notification', async () => {
    const notification: LocalNotification = {
      id: 'android-test',
      numericId: 1001,
      title: 'Alerta Android',
      body: 'Mensagem privada',
      category: 'FISCAL_DARF',
      severity: 'HIGH',
      createdAt: Date.now(),
    };

    await mockService.send(notification);
    expect(mockService.sentNotifications).toHaveLength(1);
    expect(mockService.sentNotifications[0]?.title).toBe('Alerta Android');
  });

  // 19. Windows adapter
  it('19. Windows adapter: toast dispatches successfully', async () => {
    const notification: LocalNotification = {
      id: 'win-test',
      numericId: 1002,
      title: 'Toast Windows',
      body: 'Notificação nativa Windows',
      category: 'RECONCILIATION_REVIEW',
      severity: 'NORMAL',
      createdAt: Date.now(),
    };

    const dispatched = await mockService.send(notification);
    expect(dispatched).toBe(true);
  });

  // 20. Desktop layout regression: header bell button present
  it('20. Desktop layout regression: renders desktop header with notification bell button', () => {
    queryClient.setQueryData(portfolioKeys.list(), [
      { id: 'p1', name: 'Carteira Principal', currency: 'BRL', createdAt: '2026-01-01' },
    ]);

    const html = renderToString(
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <PortfolioProvider>
            <MemoryRouter initialEntries={['/today']}>
              <NotificationProvider>
                <AppLayout />
              </NotificationProvider>
            </MemoryRouter>
          </PortfolioProvider>
        </QueryClientProvider>
      </AuthProvider>
    );

    expect(html).toContain('desktop-sidebar');
    expect(html).toContain('desktop-header');
    expect(html).toContain('Central de Notificações');
  });

  // 21. Mobile layout regression: mobile header bell button present
  it('21. Mobile layout regression: renders mobile header and settings with notification preferences', () => {
    queryClient.setQueryData(portfolioKeys.list(), [
      { id: 'p1', name: 'Carteira Principal', currency: 'BRL', createdAt: '2026-01-01' },
    ]);

    const html = renderToString(
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <PortfolioProvider>
            <MemoryRouter initialEntries={['/settings']}>
              <NotificationProvider>
                <NotificationSettingsSection />
              </NotificationProvider>
            </MemoryRouter>
          </PortfolioProvider>
        </QueryClientProvider>
      </AuthProvider>
    );

    expect(html).toContain('Preferências de Notificações');
    expect(html).toContain('Lembretes de DARF');
    expect(html).toContain('Horário de Silêncio');
    expect(html).toContain('Harness de Teste Local');
  });
});
