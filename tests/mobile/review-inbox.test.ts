import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SCREEN = 'apps/mobile/app/(app)/reviews.tsx';
const TODAY = 'apps/mobile/app/(app)/(tabs)/today.tsx';
const API = 'apps/mobile/src/api/reviews.ts';

describe('Mobile Review Inbox (Phase 5P-B)', () => {
  it('routes a read-only inbox screen outside the canonical tabs', () => {
    const screenContent = fs.readFileSync(path.join(process.cwd(), SCREEN), 'utf8');
    expect(screenContent).toContain('integration-reviews');
    expect(screenContent).toContain('Pendências');
    const tabsLayout = fs.readFileSync(
      path.join(process.cwd(), 'apps/mobile/app/(app)/(tabs)/_layout.tsx'),
      'utf8',
    );
    expect(tabsLayout).not.toContain('reviews');
  });

  it('consumes the canonical inbox endpoint and shared view-model', () => {
    const apiContent = fs.readFileSync(path.join(process.cwd(), API), 'utf8');
    expect(apiContent).toContain('/api/v1/integration-reviews');
    const screenContent = fs.readFileSync(path.join(process.cwd(), SCREEN), 'utf8');
    expect(screenContent).toContain('REVIEW_SEVERITY_PRESENTATION');
    expect(screenContent).toContain('buildReviewItemTitle');
    expect(screenContent).toContain('buildReviewItemSummaryLines');
    expect(screenContent).toContain('describeImportRunSource');
    expect(screenContent).toContain('describeIntegrationRunTrigger');
  });

  it('renders states, severity text labels and the web-handoff note read-only', () => {
    const screenContent = fs.readFileSync(path.join(process.cwd(), SCREEN), 'utf8');
    expect(screenContent).toContain('LoadingState');
    expect(screenContent).toContain('ErrorState');
    expect(screenContent).toContain('EmptyState');
    expect(screenContent).toContain('Nenhuma pendência no momento');
    expect(screenContent).toContain('severityLabel');
    expect(screenContent).toContain('versão web');

    // Zero client-side financial math; read-only (no import/confirm writes).
    expect(screenContent).not.toMatch(/parseFloat/);
    expect(screenContent).not.toMatch(/Math\./);
    expect(screenContent).not.toMatch(/imports\/confirm|imports\/preview/);
    expect(screenContent).not.toMatch(/\.post\(|\.put\(|\.patch\(/);
  });

  it('exposes the inbox from the mobile Today tab', () => {
    const todayContent = fs.readFileSync(path.join(process.cwd(), TODAY), 'utf8');
    expect(todayContent).toContain('/(app)/reviews');
    expect(todayContent).toContain('Ver pendências');
    expect(todayContent).toContain('integration-reviews');
  });
});
