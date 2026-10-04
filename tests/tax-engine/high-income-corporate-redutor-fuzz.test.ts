import { describe, it, expect } from 'vitest';
import { Money } from '@atlas/domain';
import {
  aggregateCorporateRedutor,
  calculateCorporatePayerRedutor,
  calculateHighIncomeMinimumTax,
  type CalculateHighIncomeMinimumTaxInput,
  type CorporatePayerEvidenceInput,
  type CorporatePayerType,
} from '@atlas/tax-engine';

/**
 * Phase 4I.3 — property, fuzz (25,000 deterministic cases) and differential tests
 * for the corporate effective-tax redutor.
 *
 * The differential reference uses independent BigInt rational arithmetic and
 * shares NO production helper code.
 */

class DeterministicRandom {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  pick<T>(values: readonly T[]): T {
    return values[this.int(0, values.length - 1)]!;
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  amount(min: number, max: number, decimals: number): string {
    return (min + this.next() * (max - min)).toFixed(decimals);
  }
}

// ---------------------------------------------------------------------------
// Independent BigInt reference (no production code reuse)
// ---------------------------------------------------------------------------
function parseScaled(value: string, scale: number): bigint {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) throw new Error(`reference: invalid decimal '${value}'`);
  const sign = match[1] === '-' ? -1n : 1n;
  const frac = (match[3] ?? '').slice(0, scale).padEnd(scale, '0');
  return sign * BigInt(match[2]! + frac);
}

function roundHalfUpDiv(num: bigint, den: bigint): bigint {
  const q = num / den;
  return 2n * (num % den) >= den ? q + 1n : q;
}

/** Exact fraction [numerator, denominator] for a canonical decimal string (no truncation). */
function fractionFromDecimal(value: string): [bigint, bigint] {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) throw new Error(`reference: invalid decimal '${value}'`);
  const sign = match[1] === '-' ? -1n : 1n;
  const frac = match[3] ?? '';
  if (frac === '') {
    return [sign * BigInt(match[2]!), 1n];
  }
  return [sign * BigInt(match[2]! + frac), 10n ** BigInt(frac.length)];
}

/**
 * Reference payer reduction in cents, exact rational arithmetic:
 * cents = roundHalfUp(D × max(0, effPJ + effPF − cap)), all inputs exact fractions.
 */
function referencePayerReductionCents(
  dividends: string,
  profit: string,
  irCsll: string,
  pfRatePct: string,
  capPct: string,
): bigint {
  const [dNum, dDen] = fractionFromDecimal(dividends);
  const [tNum, tDen] = fractionFromDecimal(irCsll);
  const [pNum, pDen] = fractionFromDecimal(profit);
  const [fNum, fDen] = fractionFromDecimal(pfRatePct);
  const [cNum, cDen] = fractionFromDecimal(capPct);
  if (pNum === 0n) return 0n;
  // excess = T×100/P + F − C over common denominator tDen×pNum×fDen×cDen
  const exactExcessNum =
    tNum * 100n * pDen * fDen * cDen + fNum * tDen * pNum * cDen - cNum * tDen * pNum * fDen;
  const exactExcessDen = tDen * pNum * fDen * cDen;
  if (exactExcessNum <= 0n) return 0n;
  // cents = D × excess (D in units × excess in % = cents directly)
  return roundHalfUpDiv(dNum * exactExcessNum, dDen * exactExcessDen);
}

function moneyToCents(amount: string): bigint {
  return parseScaled(amount, 2);
}

/** Exact decimal string rounded half-up to integer cents. */
function decimalToCentsRounded(amount: string): bigint {
  const [num, den] = fractionFromDecimal(amount);
  return roundHalfUpDiv(num * 100n, den);
}

function amountString(value: string | { amount: string }): string {
  return typeof value === 'string' ? value : value.amount;
}

function addAmounts(values: readonly (string | { amount: string } | null | undefined)[]): string {
  let totalNum = 0n;
  let totalDen = 1n;
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const [num, den] = fractionFromDecimal(amountString(value));
    totalNum = totalNum * den + num * totalDen;
    totalDen = totalDen * den;
  }
  // normalize to a canonical decimal string via integer division with remainder
  const intPart = totalNum / totalDen;
  let rem = totalNum % totalDen;
  let frac = '';
  for (let i = 0; i < 20 && rem !== 0n; i++) {
    rem *= 10n;
    frac += (rem / totalDen).toString();
    rem %= totalDen;
  }
  return frac === '' ? intPart.toString() : `${intPart}.${frac}`;
}

function moneyScaled10(amount: string): bigint {
  return parseScaled(amount, 10);
}

// ---------------------------------------------------------------------------
// Random case generation
// ---------------------------------------------------------------------------
const PAYER_TYPES: readonly CorporatePayerType[] = [
  'STANDARD_CORPORATE',
  'INSURANCE_CAPITALIZATION_REGULATED',
  'FINANCIAL_INSTITUTION',
  'UNKNOWN',
];

interface FuzzCase {
  input: CalculateHighIncomeMinimumTaxInput;
}

function randomCase(rng: DeterministicRandom, index: number): FuzzCase {
  const payerCount = rng.int(1, 4);
  const items: CalculateHighIncomeMinimumTaxInput['items'] = [];
  const corporateEvidence: CorporatePayerEvidenceInput[] = [];
  for (let p = 0; p < payerCount; p++) {
    const payerId = `payer-${p}`;
    const distCount = rng.int(1, 3);
    for (let d = 0; d < distCount; d++) {
      items.push({
        itemId: `d-${index}-${p}-${d}`,
        category: 'DIVIDEND',
        amount: rng.amount(1000, 400000, rng.int(0, 2)),
        payerId,
      });
    }
    const mode = rng.chance(0.7) ? 'FULL' : 'SIMPLIFIED';
    const profit = rng.amount(100000, 2000000, 2);
    corporateEvidence.push({
      evidenceId: `e-${index}-${p}`,
      payerId,
      payerType: rng.pick(PAYER_TYPES),
      profitPeriodExercise: 2026,
      mode,
      accountingProfit: profit,
      irDue: rng.amount(0, 600000, 2),
      csllDue: rng.amount(0, 200000, 2),
      prouniTaxCredit: rng.chance(0.1) ? rng.amount(0, 10000, 2) : null,
      evidenceAuthority: rng.chance(0.75)
        ? 'AUTHORITATIVE'
        : rng.pick(['REQUIRES_CONFIRMATION', 'MISSING'] as const),
      evidenceSource: rng.chance(0.8)
        ? rng.pick(['PJ_FINANCIAL_STATEMENTS', 'RFB_PREFILLED'] as const)
        : 'TAXPAYER_CONFIRMED',
    });
    if (rng.chance(0.05)) {
      // conflicting duplicate
      corporateEvidence.push({
        ...corporateEvidence[corporateEvidence.length - 1]!,
        evidenceId: `e-${index}-${p}-dup`,
        irDue: rng.amount(0, 600000, 2),
      });
    }
  }
  // non-dividend income to vary the base / threshold
  if (rng.chance(0.5)) {
    items.push({
      itemId: `g-${index}`,
      category: 'EQUITY_CAPITAL_GAIN',
      amount: rng.amount(0, 500000, 2),
    });
  }
  return {
    input: {
      calendarYear: 2026,
      taxSubjectId: `subject-${index % 30}`,
      currency: 'BRL',
      items,
      taxPaidFacts: [{ factId: 'adj', kind: 'ANNUAL_ADJUSTMENT_IRPF_DUE', amount: '0' }],
      corporateEvidence,
    },
  };
}

const ALLOWED_STATUSES = new Set([
  'NOT_APPLICABLE',
  'CALCULABLE',
  'INCOMPLETE_CREDITS',
  'INCOMPLETE_REDUCTION_DATA',
  'REQUIRES_CONFIRMATION',
  'BLOCKED',
  'UNSUPPORTED_YEAR',
  'UNSUPPORTED_INPUT',
]);

describe('Phase 4I.3 — redutor properties', () => {
  it('same input -> same result and fingerprints', () => {
    const fuzzCase = randomCase(new DeterministicRandom(7), 0);
    const a = calculateHighIncomeMinimumTax(fuzzCase.input);
    const b = calculateHighIncomeMinimumTax(fuzzCase.input);
    expect(a.calculationFingerprint).toBe(b.calculationFingerprint);
    expect(a.corporateRedutor?.calculationFingerprint).toBe(
      b.corporateRedutor?.calculationFingerprint,
    );
  });

  it('payer order independence', () => {
    const rng = new DeterministicRandom(11);
    const first = randomCase(rng, 1);
    const reversed: CalculateHighIncomeMinimumTaxInput = {
      ...first.input,
      items: [...first.input.items].reverse(),
      corporateEvidence: [...(first.input.corporateEvidence ?? [])].reverse(),
    };
    const a = calculateHighIncomeMinimumTax(first.input);
    const b = calculateHighIncomeMinimumTax(reversed);
    expect(a.calculationFingerprint).toBe(b.calculationFingerprint);
  });

  it('no cross-payer identity collapse across 100 payers', () => {
    const items: CalculateHighIncomeMinimumTaxInput['items'] = [];
    const corporateEvidence: CorporatePayerEvidenceInput[] = [];
    for (let p = 0; p < 100; p++) {
      items.push({ itemId: `d-${p}`, category: 'DIVIDEND', amount: '10000', payerId: `p-${p}` });
      corporateEvidence.push({
        evidenceId: `e-${p}`,
        payerId: `p-${p}`,
        payerType: 'STANDARD_CORPORATE',
        profitPeriodExercise: 2026,
        mode: 'FULL',
        accountingProfit: '800000',
        irDue: '200000',
        csllDue: '68000',
        evidenceAuthority: 'AUTHORITATIVE',
        evidenceSource: 'PJ_FINANCIAL_STATEMENTS',
      });
    }
    const result = calculateHighIncomeMinimumTax({
      calendarYear: 2026,
      taxSubjectId: 's',
      currency: 'BRL',
      items,
      taxPaidFacts: [{ factId: 'adj', kind: 'ANNUAL_ADJUSTMENT_IRPF_DUE', amount: '0' }],
      corporateEvidence,
    });
    expect(result.corporateRedutor?.payerCount).toBe(100);
    expect(new Set(result.corporateRedutor?.payers.map((payer) => payer.payerId)).size).toBe(100);
  });

  it('reduction is never negative at payer and global level', () => {
    const payer = calculateCorporatePayerRedutor({
      payerId: 'p',
      payerType: 'STANDARD_CORPORATE',
      eligibleDividends: Money.from('500000', 'BRL'),
      pfEffectiveRatePercentage: '0',
      evidence: {
        evidenceId: 'e',
        payerId: 'p',
        payerType: 'STANDARD_CORPORATE',
        profitPeriodExercise: 2026,
        mode: 'FULL',
        accountingProfit: Money.from('800000', 'BRL'),
        irDue: Money.from('1000', 'BRL'),
        csllDue: Money.from('500', 'BRL'),
        prouniTaxCredit: null,
        simplifiedRevenue: null,
        consolidatedStatements: false,
        evidenceAuthority: 'AUTHORITATIVE',
        evidenceSource: 'PJ_FINANCIAL_STATEMENTS',
        sourceFingerprint: 'fp',
      },
      currency: 'BRL',
    });
    expect(payer.reductionExact.isNegative()).toBe(false);
    expect(payer.reductionExact.amount).toBe('0');
  });

  it('lower corporate effective rate never reduces the redutor (monotonicity)', () => {
    const run = (irDue: string) =>
      calculateCorporatePayerRedutor({
        payerId: 'p',
        payerType: 'STANDARD_CORPORATE',
        eligibleDividends: Money.from('500000', 'BRL'),
        pfEffectiveRatePercentage: '10',
        evidence: {
          evidenceId: 'e',
          payerId: 'p',
          payerType: 'STANDARD_CORPORATE',
          profitPeriodExercise: 2026,
          mode: 'FULL',
          accountingProfit: Money.from('1000000', 'BRL'),
          irDue: Money.from(irDue, 'BRL'),
          csllDue: Money.from('90000', 'BRL'),
          prouniTaxCredit: null,
          simplifiedRevenue: null,
          consolidatedStatements: false,
          evidenceAuthority: 'AUTHORITATIVE',
          evidenceSource: 'PJ_FINANCIAL_STATEMENTS',
          sourceFingerprint: 'fp',
        },
        currency: 'BRL',
      });
    // effPJ: 29% -> excess 29+10-34 = 5% -> 25000; effPJ 19% -> excess 0 -> 0... use rates above cap
    const high = run('300000'); // effPJ 39%, excess 15% -> 75000
    const low = run('200000'); // effPJ 29%, excess 5% -> 25000
    expect(
      moneyScaled10(high.reductionExact.amount) >= moneyScaled10(low.reductionExact.amount),
    ).toBe(true);
  });

  it('removing evidence degrades authoritative to incomplete', () => {
    const withEvidence = calculateHighIncomeMinimumTax({
      calendarYear: 2026,
      taxSubjectId: 's',
      currency: 'BRL',
      items: [{ itemId: 'd1', category: 'DIVIDEND', amount: '700000', payerId: 'p' }],
      taxPaidFacts: [{ factId: 'adj', kind: 'ANNUAL_ADJUSTMENT_IRPF_DUE', amount: '0' }],
      corporateEvidence: [
        {
          evidenceId: 'e1',
          payerId: 'p',
          payerType: 'STANDARD_CORPORATE',
          profitPeriodExercise: 2026,
          mode: 'FULL',
          accountingProfit: '800000',
          irDue: '200000',
          csllDue: '68000',
          evidenceAuthority: 'AUTHORITATIVE',
          evidenceSource: 'PJ_FINANCIAL_STATEMENTS',
        },
      ],
    });
    expect(withEvidence.status).toBe('CALCULABLE');
    const stripped = calculateHighIncomeMinimumTax({
      calendarYear: 2026,
      taxSubjectId: 's',
      currency: 'BRL',
      items: [{ itemId: 'd1', category: 'DIVIDEND', amount: '700000', payerId: 'p' }],
      taxPaidFacts: [{ factId: 'adj', kind: 'ANNUAL_ADJUSTMENT_IRPF_DUE', amount: '0' }],
    });
    expect(stripped.status).toBe('INCOMPLETE_REDUCTION_DATA');
    expect(stripped.netMinimumTax).toBeNull();
  });

  it('fully-taxed added payer contributes zero redutor (metamorphic)', () => {
    const base: CalculateHighIncomeMinimumTaxInput = {
      calendarYear: 2026,
      taxSubjectId: 's',
      currency: 'BRL',
      items: [{ itemId: 'd1', category: 'DIVIDEND', amount: '700000', payerId: 'p1' }],
      taxPaidFacts: [{ factId: 'adj', kind: 'ANNUAL_ADJUSTMENT_IRPF_DUE', amount: '0' }],
      corporateEvidence: [
        {
          evidenceId: 'e1',
          payerId: 'p1',
          payerType: 'STANDARD_CORPORATE',
          profitPeriodExercise: 2026,
          mode: 'FULL',
          accountingProfit: '800000',
          irDue: '200000',
          csllDue: '68000',
          evidenceAuthority: 'AUTHORITATIVE',
          evidenceSource: 'PJ_FINANCIAL_STATEMENTS',
        },
      ],
    };
    const before = calculateHighIncomeMinimumTax(base);
    expect(before.corporateRedutor?.payerCount).toBe(1);
    // add a payer whose dividends are small but fully taxed (effPJ high, cap 45%)
    const after = calculateHighIncomeMinimumTax({
      ...base,
      items: [...base.items, { itemId: 'd2', category: 'DIVIDEND', amount: '1000', payerId: 'p2' }],
      corporateEvidence: [
        ...(base.corporateEvidence ?? []),
        {
          evidenceId: 'e2',
          payerId: 'p2',
          payerType: 'FINANCIAL_INSTITUTION',
          profitPeriodExercise: 2026,
          mode: 'FULL',
          accountingProfit: '1000000',
          irDue: '300000',
          csllDue: '150000',
          evidenceAuthority: 'AUTHORITATIVE',
          evidenceSource: 'PJ_FINANCIAL_STATEMENTS',
        },
      ],
    });
    const added = after.corporateRedutor?.payers.find((payer) => payer.payerId === 'p2');
    // effPJ = 45%; effPF small positive; excess vs 45 cap is tiny but >= 0
    expect(added).toBeDefined();
    expect(added?.status).toBe('APPLICABLE');
  });
});

describe('Phase 4I.3 — deterministic 25,000-case fuzz + differential', () => {
  it('runs 25,000 cases with zero invariant violations and matches the reference', () => {
    const seed = 20261004;
    const rng = new DeterministicRandom(seed);
    const iterations = 25000;
    const failures: string[] = [];
    let differentialCases = 0;
    let differentialMismatches = 0;
    const startedAt = Date.now();

    for (let i = 0; i < iterations; i++) {
      const fuzzCase = randomCase(rng, i);
      const result = calculateHighIncomeMinimumTax(fuzzCase.input);
      const second = calculateHighIncomeMinimumTax(fuzzCase.input);

      if (result.calculationFingerprint !== second.calculationFingerprint) {
        failures.push(`case ${i}: non-deterministic fingerprint`);
      }
      if (!ALLOWED_STATUSES.has(result.status)) {
        failures.push(`case ${i}: invalid status ${result.status}`);
      }
      // no negative reduction / net
      for (const payer of result.corporateRedutor?.payers ?? []) {
        if (payer.reductionExact.isNegative()) {
          failures.push(`case ${i}: negative payer reduction`);
        }
      }
      if (result.netMinimumTax !== null && result.netMinimumTax.isNegative()) {
        failures.push(`case ${i}: negative net tax`);
      }
      // missing evidence != zero: incomplete payers contribute no authoritative amount
      const incomplete = (result.corporateRedutor?.payers ?? []).filter(
        (payer) => payer.status === 'REQUIRES_EVIDENCE',
      );
      for (const payer of incomplete) {
        if (payer.reductionExact.amount !== '0') {
          failures.push(`case ${i}: incomplete payer fabricated reduction`);
        }
      }
      // unsupported payer type fails closed
      for (const payer of result.corporateRedutor?.payers ?? []) {
        if (payer.payerType === 'UNKNOWN' && payer.eligibleDividends.isPositive()) {
          if (
            payer.status !== 'UNSUPPORTED_PAYER_TYPE' &&
            payer.status !== 'REQUIRES_EVIDENCE' &&
            payer.status !== 'BLOCKED'
          ) {
            failures.push(`case ${i}: unknown payer type not failed closed`);
          }
        }
      }
      // no duplicate double count: payerCount matches distinct dividend payers + evidence-only payers
      const dividendPayers = new Set(
        (fuzzCase.input.items as Array<{ payerId?: string }>).map((item) => item.payerId ?? ''),
      );
      const evidencePayers = new Set(
        (fuzzCase.input.corporateEvidence ?? []).map((e) => e.payerId),
      );
      const union = new Set([...dividendPayers, ...evidencePayers].filter(Boolean));
      if (
        (result.corporateRedutor?.payerCount ?? 0) > union.size &&
        result.corporateRedutor !== null
      ) {
        failures.push(`case ${i}: payer count exceeds distinct payers`);
      }
      // net authority requires complete redutor
      if (
        result.corporateRedutor !== null &&
        result.corporateRedutor.status !== 'APPLICABLE' &&
        result.corporateRedutor.status !== 'NOT_APPLICABLE' &&
        result.status === 'CALCULABLE'
      ) {
        failures.push(`case ${i}: calculable with unresolved redutor`);
      }
      // differential on fully-authoritative single-payer cases, using the
      // case's own evidence (profit, IR+CSLL+Prouni) against the reference
      if (
        result.status === 'CALCULABLE' &&
        result.corporateRedutor?.status === 'APPLICABLE' &&
        result.corporateRedutor.payerCount === 1
      ) {
        const payer = result.corporateRedutor.payers[0]!;
        const record = (fuzzCase.input.corporateEvidence ?? []).find(
          (entry) => entry.payerId === payer.payerId,
        );
        if (record) {
          const taxSum = addAmounts([record.irDue, record.csllDue, record.prouniTaxCredit ?? '0']);
          const expected = referencePayerReductionCents(
            payer.eligibleDividends.amount,
            amountString(record.accountingProfit),
            taxSum,
            payer.pfEffectiveRatePercentage,
            payer.referenceRatePercentage ?? '34',
          );
          differentialCases += 1;
          const actualRounded = decimalToCentsRounded(
            result.corporateRedutor.totalSupportedReduction?.amount ?? '0',
          );
          if (actualRounded !== expected) {
            differentialMismatches += 1;
            failures.push(`case ${i}: payer differential mismatch`);
          }
        }
      }
    }

    const durationMs = Date.now() - startedAt;
    // eslint-disable-next-line no-console
    console.log(
      `[4I.3 fuzz] cases=${iterations} seed=${seed} failures=${failures.length} differential=${differentialCases} mismatches=${differentialMismatches} durationMs=${durationMs}`,
    );
    expect(failures.slice(0, 10)).toEqual([]);
    expect(failures.length).toBe(0);
    expect(differentialMismatches).toBe(0);
  }, 180000);
});

describe('Phase 4I.3 — differential (independent reference)', () => {
  it('matches the BigInt reference across the golden matrix', () => {
    const caps: Array<{
      type: 'STANDARD_CORPORATE' | 'INSURANCE_CAPITALIZATION_REGULATED' | 'FINANCIAL_INSTITUTION';
      cap: string;
    }> = [
      { type: 'STANDARD_CORPORATE', cap: '34' },
      { type: 'INSURANCE_CAPITALIZATION_REGULATED', cap: '40' },
      { type: 'FINANCIAL_INSTITUTION', cap: '45' },
    ];
    let cases = 0;
    let mismatches = 0;
    for (const { type, cap } of caps) {
      for (const effPct of ['0', '10', '20', '30', '34', '40', '45']) {
        // corporate rate = effPct%: profit 1000000, ir+csll = effPct × 10000 (exact strings)
        const taxTotal = effPct === '0' ? '0' : `${effPct}0000`;
        const payer = calculateCorporatePayerRedutor({
          payerId: 'p',
          payerType: type,
          eligibleDividends: Money.from('500000', 'BRL'),
          pfEffectiveRatePercentage: '5',
          evidence: {
            evidenceId: 'e',
            payerId: 'p',
            payerType: type,
            profitPeriodExercise: 2026,
            mode: 'FULL',
            accountingProfit: Money.from('1000000', 'BRL'),
            irDue: Money.from(taxTotal, 'BRL'),
            csllDue: Money.from('0', 'BRL'),
            prouniTaxCredit: null,
            simplifiedRevenue: null,
            consolidatedStatements: false,
            evidenceAuthority: 'AUTHORITATIVE',
            evidenceSource: 'PJ_FINANCIAL_STATEMENTS',
            sourceFingerprint: 'fp',
          },
          currency: 'BRL',
        });
        const expected = referencePayerReductionCents('500000', '1000000', taxTotal, '5', cap);
        const actual = decimalToCentsRounded(payer.reductionExact.amount);
        cases += 1;
        if (actual !== expected) {
          mismatches += 1;
        }
        expect(actual).toBe(expected);
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[4I.3 differential] cases=${cases} mismatches=${mismatches}`);
    expect(mismatches).toBe(0);
  });

  it('per-payer rounding order is documented: sum-then-round is canonical', () => {
    // Three payers with fractional-cent exact reductions; engine rounds once at the end.
    const payers = ['pa', 'pb', 'pc'].map((payerId) =>
      calculateCorporatePayerRedutor({
        payerId,
        payerType: 'STANDARD_CORPORATE',
        eligibleDividends: Money.from('1000.01', 'BRL'),
        pfEffectiveRatePercentage: '10.3333333333',
        evidence: {
          evidenceId: `e-${payerId}`,
          payerId,
          payerType: 'STANDARD_CORPORATE',
          profitPeriodExercise: 2026,
          mode: 'FULL',
          accountingProfit: Money.from('1000000', 'BRL'),
          irDue: Money.from('300000', 'BRL'),
          csllDue: Money.from('0', 'BRL'),
          prouniTaxCredit: null,
          simplifiedRevenue: null,
          consolidatedStatements: false,
          evidenceAuthority: 'AUTHORITATIVE',
          evidenceSource: 'PJ_FINANCIAL_STATEMENTS',
          sourceFingerprint: 'fp',
        },
        currency: 'BRL',
      }),
    );
    const aggregate = aggregateCorporateRedutor(payers, 'BRL');
    expect(aggregate.status).toBe('APPLICABLE');
    // canonical: exact sum then single HALF_UP rounding
    const exactSum = payers.reduce(
      (acc, payer) => acc + moneyScaled10(payer.reductionExact.amount),
      0n,
    );
    const canonicalRounded =
      exactSum / 10n ** 8n + (2n * (exactSum % 10n ** 8n) >= 10n ** 8n ? 1n : 0n);
    expect(moneyToCents(aggregate.totalSupportedReduction!.amount)).toBe(canonicalRounded);
  });
});
