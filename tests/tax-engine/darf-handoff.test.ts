import { describe, expect, it } from 'vitest';
import {
  buildDarfHandoffPlan,
  isCanonicalCpf,
  isCanonicalCnpj,
  maskCnpj,
  maskCpf,
  maskTaxpayerIdentifier,
  type BuildDarfHandoffPlanInput,
  type OfficialDarfDestination,
} from '@atlas/tax-engine';

const DESTINATION: OfficialDarfDestination = {
  sourceSystem: 'RFB_SICALC',
  url: 'https://sicalc.receita.fazenda.gov.br/sicalc/principal',
  prefillSupported: false,
};

function input(over: Partial<BuildDarfHandoffPlanInput> = {}): BuildDarfHandoffPlanInput {
  return {
    revenueCode: '6015',
    competence: '2026-08',
    currency: 'BRL',
    eligibilityStatus: 'PAYABLE',
    totalPayable: '199.9',
    minimumThreshold: '10',
    currentPrincipal: '199.9',
    carryForwardAmount: null,
    dueDate: '2026-09-30',
    overdue: false,
    adjustment: null,
    identityAvailable: true,
    destination: DESTINATION,
    supportedRevenueCodes: ['6015'],
    paymentDate: null,
    ...over,
  };
}

describe('Phase 4F — taxpayer identity boundary (never raw)', () => {
  it('validates CPF/CNPJ check digits', () => {
    expect(isCanonicalCpf('529.982.247-25')).toBe(true);
    expect(isCanonicalCpf('111.111.111-11')).toBe(false);
    expect(isCanonicalCpf('123.456.789-00')).toBe(false);
    expect(isCanonicalCpf('123')).toBe(false);
    expect(isCanonicalCnpj('11.222.333/0001-81')).toBe(true);
    expect(isCanonicalCnpj('11.111.111/1111-11')).toBe(false);
  });

  it('masks identifiers and never returns the raw value', () => {
    const masked = maskCpf('529.982.247-25')!;
    expect(masked).toBe('***.***.247-**');
    expect(masked).not.toContain('529');
    expect(maskCnpj('11.222.333/0001-81')).toBe('**.***.***/****-81');
    expect(maskTaxpayerIdentifier('52998224725', 'CPF')).toBe('***.***.247-**');
    expect(maskCpf('123')).toBeNull();
  });
});

describe('Phase 4F — official DARF handoff plan (pure, no tax math)', () => {
  it('prepares an on-time payable handoff (USER_ACTION_REQUIRED)', () => {
    const plan = buildDarfHandoffPlan(input());
    expect(plan.generationMode).toBe('OFFICIAL_INTERACTIVE_HANDOFF');
    expect(plan.status).toBe('USER_ACTION_REQUIRED');
    expect(plan.requiresUserAction).toBe(true);
    expect(plan.preparedValues?.revenueCode).toBe('6015');
    expect(plan.preparedValues?.principalAmount).toBe('199.9');
    expect(plan.preparedValues?.totalAmount).toBe('199.9');
    expect(plan.preparedValues?.lateFeeAmount).toBeNull();
    expect(plan.destination?.sourceSystem).toBe('RFB_SICALC');
    expect(plan.destination?.prefillSupported).toBe(false);
    expect(plan.instructions.length).toBeGreaterThan(0);
  });

  it('fails closed below the minimum (never generates a sub-minimum DARF)', () => {
    const plan = buildDarfHandoffPlan(
      input({ eligibilityStatus: 'CARRIED_FORWARD', totalPayable: '4' }),
    );
    expect(plan.status).toBe('BLOCKED');
    expect(plan.reasonCode).toBe('BELOW_MINIMUM');
    expect(plan.preparedValues).toBeNull();
  });

  it('fails closed for unsupported codes and missing deadline', () => {
    expect(buildDarfHandoffPlan(input({ revenueCode: '5993' })).reasonCode).toBe(
      'UNSUPPORTED_CODE',
    );
    expect(buildDarfHandoffPlan(input({ dueDate: null })).reasonCode).toBe(
      'MISSING_OFFICIAL_DEADLINE',
    );
    expect(buildDarfHandoffPlan(input({ eligibilityStatus: 'BLOCKED' })).reasonCode).toBe(
      'NOT_PAYABLE',
    );
  });

  it('uses the 4D adjustment for overdue and fails closed without it', () => {
    const ready = buildDarfHandoffPlan(
      input({
        overdue: true,
        adjustment: { status: 'READY', updatedAmount: '202.56', lateFee: '0.66', interest: '2.00' },
        paymentDate: '2026-10-01',
      }),
    );
    expect(ready.status).toBe('USER_ACTION_REQUIRED');
    expect(ready.preparedValues?.lateFeeAmount).toBe('0.66');
    expect(ready.preparedValues?.interestAmount).toBe('2.00');
    expect(ready.preparedValues?.totalAmount).toBe('202.56');

    const blockedAdjustment = buildDarfHandoffPlan(
      input({
        overdue: true,
        adjustment: { status: 'BLOCKED', reasonCode: 'MISSING_LATE_FEE_AUTHORITY' },
      }),
    );
    expect(blockedAdjustment.status).toBe('BLOCKED');
    expect(blockedAdjustment.reasonCode).toBe('ADJUSTMENT_UNAVAILABLE');
  });

  it('flags taxpayer identity requirement without blocking the handoff', () => {
    const plan = buildDarfHandoffPlan(input({ identityAvailable: false }));
    expect(plan.status).toBe('USER_ACTION_REQUIRED');
    expect(plan.requiresTaxpayerIdentity).toBe(true);
    expect(plan.reasonCode).toBe('TAXPAYER_IDENTITY_REQUIRED');
  });

  it('preserves carry-forward principal breakdown for aggregated payments', () => {
    const plan = buildDarfHandoffPlan(
      input({
        totalPayable: '14.7',
        currentPrincipal: '5.9',
        carryForwardAmount: '8.8',
      }),
    );
    expect(plan.preparedValues?.principalAmount).toBe('14.7');
    expect(plan.preparedValues?.carryForwardAmount).toBe('8.8');
  });

  it('is deterministic (stable fingerprint)', () => {
    expect(buildDarfHandoffPlan(input()).fingerprint).toBe(
      buildDarfHandoffPlan(input()).fingerprint,
    );
    expect(buildDarfHandoffPlan(input()).fingerprint).not.toBe(
      buildDarfHandoffPlan(input({ paymentDate: '2026-10-01' })).fingerprint,
    );
  });
});
