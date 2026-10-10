import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SCREEN = 'apps/mobile/app/(app)/(tabs)/tax.tsx';
const COMPONENT = 'apps/mobile/src/components/fiscal/ComplianceTimelineCard.tsx';

describe('Mobile Fiscal Compliance Timeline (Phase 4K.1)', () => {
  it('integrates ComplianceTimelineCard in the mobile Tax tab', () => {
    const screenContent = fs.readFileSync(path.join(process.cwd(), SCREEN), 'utf8');
    expect(screenContent).toContain('ComplianceTimelineCard');
  });

  it('consumes canonical compliance endpoint and shared view-model', () => {
    const compContent = fs.readFileSync(path.join(process.cwd(), COMPONENT), 'utf8');
    expect(compContent).toContain('/api/v1/fiscal/compliance?year=');
    expect(compContent).toContain('mapToTaxComplianceTimelineViewModel');
    expect(compContent).toContain('taxComplianceTimelineQueryKey');
  });

  it('renders timeline, summary metrics, filters, status, due date, amount, and disclaimers read-only', () => {
    const compContent = fs.readFileSync(path.join(process.cwd(), COMPONENT), 'utf8');
    expect(compContent).toContain('Cronograma de Obrigações');
    expect(compContent).toContain('summary.pendingCount');
    expect(compContent).toContain('summary.overdueCount');
    expect(compContent).toContain('summary.completedCount');
    expect(compContent).toContain('dueDateFormatted');
    expect(compContent).toContain('amountFormatted');
    expect(compContent).toContain('statusBadge');
    expect(compContent).toContain('disclaimer');

    // Zero client-side tax math
    expect(compContent).not.toMatch(/parseFloat/);
    expect(compContent).not.toMatch(/Math\./);
    expect(compContent).not.toMatch(/computeTax|calculateTax|calculateDue/i);
  });
});
