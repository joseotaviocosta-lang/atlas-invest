import { describe, it, expect } from 'vitest';
import {
  mapToNotificationVM,
  mapToNotificationCenterVM,
  NOTIFICATION_CATEGORY_LABELS,
  NOTIFICATION_PRIORITY_LABELS,
  NOTIFICATION_PRIORITY_BADGES,
  type NotificationDto,
  type NotificationCenterResponseDto,
} from '../../packages/ui/src/view-models/notification-center.view-model';

describe('Notification Center View-Model (Phase 5V)', () => {
  const sampleNotification: NotificationDto = {
    id: 'fiscal:darf:2026-09:8523',
    category: 'FISCAL',
    priority: 'URGENT',
    title: 'DARF código 8523 vence em breve',
    description: 'Obrigação fiscal referente a 2026-09 no valor de R$ 150,00 vence em 2026-10-31.',
    occurredAt: '2026-10-01T00:00:00.000Z',
    dueAt: '2026-10-31T23:59:59.000Z',
    actionHref: '/tax',
    actionLabel: 'Ver no módulo Fiscal',
    portfolioId: 'p-1',
    portfolioName: 'Carteira Principal',
    sourceContext: {
      origin: 'Tax Engine',
      entityType: 'TAX_OBLIGATION',
      entityId: 'obl-1',
    },
  };

  it('maps single notification dto to presentation view-model', () => {
    const vm = mapToNotificationVM(sampleNotification);

    expect(vm.id).toBe('fiscal:darf:2026-09:8523');
    expect(vm.category).toBe('FISCAL');
    expect(vm.categoryLabel).toBe(NOTIFICATION_CATEGORY_LABELS.FISCAL);
    expect(vm.categoryLabel).toBe('Fiscal');
    expect(vm.priority).toBe('URGENT');
    expect(vm.priorityLabel).toBe(NOTIFICATION_PRIORITY_LABELS.URGENT);
    expect(vm.priorityLabel).toBe('Urgente');
    expect(vm.priorityBadgeVariant).toBe(NOTIFICATION_PRIORITY_BADGES.URGENT);
    expect(vm.priorityBadgeVariant).toBe('danger');
    expect(vm.isUrgent).toBe(true);
    expect(vm.isActionRequired).toBe(true);
    expect(vm.portfolioName).toBe('Carteira Principal');
    expect(vm.formattedDueAt).toBeTruthy();
    expect(vm.formattedOccurredAt).toBeTruthy();
  });

  it('handles action required vs info priorities correctly', () => {
    const actionReq = mapToNotificationVM({
      ...sampleNotification,
      priority: 'ACTION_REQUIRED',
    });
    expect(actionReq.isUrgent).toBe(false);
    expect(actionReq.isActionRequired).toBe(true);
    expect(actionReq.priorityBadgeVariant).toBe('warning');

    const info = mapToNotificationVM({
      ...sampleNotification,
      priority: 'INFO',
    });
    expect(info.isUrgent).toBe(false);
    expect(info.isActionRequired).toBe(false);
    expect(info.priorityBadgeVariant).toBe('neutral');
  });

  it('safely handles center response with empty / undefined input', () => {
    const emptyVM = mapToNotificationCenterVM(null);
    expect(emptyVM.notifications).toEqual([]);
    expect(emptyVM.totalCount).toBe(0);
    expect(emptyVM.actionRequiredCount).toBe(0);
    expect(emptyVM.urgentCount).toBe(0);
    expect(emptyVM.availableCategories).toEqual([]);

    const undefinedVM = mapToNotificationCenterVM(undefined);
    expect(undefinedVM.notifications).toEqual([]);
    expect(undefinedVM.totalCount).toBe(0);
  });

  it('maps full notification center response dto', () => {
    const centerDto: NotificationCenterResponseDto = {
      data: [
        sampleNotification,
        {
          id: 'review:run:run-123',
          category: 'REVIEW',
          priority: 'ACTION_REQUIRED',
          title: 'Importação B3 aguarda revisão',
          description: 'A sincronização produziu 3 registros para conferência.',
          occurredAt: '2026-10-28T12:00:00.000Z',
          dueAt: null,
          actionHref: '/reviews/run-123',
          actionLabel: 'Revisar agora',
          portfolioId: 'p-1',
          portfolioName: 'Carteira Principal',
          sourceContext: {
            origin: 'Import Engine',
            entityType: 'INTEGRATION_RUN',
            entityId: 'run-123',
          },
        },
      ],
      meta: {
        totalCount: 2,
        actionRequiredCount: 2,
        urgentCount: 1,
        categories: ['FISCAL', 'REVIEW'],
        generatedAt: '2026-10-28T15:00:00.000Z',
      },
    };

    const vm = mapToNotificationCenterVM(centerDto);
    expect(vm.totalCount).toBe(2);
    expect(vm.actionRequiredCount).toBe(2);
    expect(vm.urgentCount).toBe(1);
    expect(vm.availableCategories).toEqual(['FISCAL', 'REVIEW']);
    expect(vm.notifications).toHaveLength(2);
    expect(vm.notifications[0].id).toBe('fiscal:darf:2026-09:8523');
    expect(vm.notifications[1].id).toBe('review:run:run-123');
  });
});
