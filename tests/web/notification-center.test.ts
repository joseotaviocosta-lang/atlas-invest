import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Phase 5V: Notification Center Web Surface', () => {
  const popover = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/components/notifications/NotificationCenterPopover.tsx'),
    'utf8',
  );
  const layout = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/app/(app)/layout.tsx'),
    'utf8',
  );

  it('popover queries the unified notification endpoint with reactive cache', () => {
    expect(popover).toContain("queryKey: ['notifications-feed']");
    expect(popover).toContain('/api/v1/notifications?limit=30');
    expect(popover).toContain('mapToNotificationCenterVM');
  });

  it('popover trigger button provides complete accessibility attributes', () => {
    expect(popover).toContain('aria-haspopup="dialog"');
    expect(popover).toContain('aria-expanded={isOpen}');
    expect(popover).toContain('title="Central de Notificações"');
    expect(popover).toContain('role="dialog"');
    expect(popover).toContain('aria-label="Central de Notificações do Investidor"');
    expect(popover).toContain("e.key === 'Escape'");
  });

  it('popover renders category and priority filter chips and empty state', () => {
    expect(popover).toContain('label="Todas"');
    expect(popover).toContain("label={`Ação (${centerVM.actionRequiredCount})`}");
    expect(popover).toContain('Nenhuma pendência ou alerta');
    expect(popover).toContain('Tudo em dia nas suas carteiras e obrigações fiscais.');
    expect(popover).toContain('Tentar novamente');
  });

  it('popover routes strictly to verified application pages with no marketing/spam', () => {
    expect(popover).toContain('href={notification.actionHref}');
    expect(popover).not.toMatch(/marketing|promo|upgrade|upsell|newsletter/i);
    // Zero financial floating-point operations
    expect(popover).not.toMatch(/parseFloat|Math\.pow|Math\.sqrt/);
  });

  it('AppLayout integrates the NotificationCenterPopover alongside pending reviews', () => {
    expect(layout).toContain('<NotificationCenterPopover />');
    expect(layout).toContain('<PendingReviewsLink />');
    expect(layout).toContain('/reviews');
    expect(layout).toContain('integration-reviews');
    expect(layout).toContain('Pendências:');
    expect(layout).toContain('CANONICAL_NAV_ITEMS.map');
  });
});
