import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import {
  normalizeB3Movement,
  canonicalFingerprint,
  classifyOne,
  resolveAsset,
  resolveAccount,
  B3_CAPABILITIES,
  type ExistingLedgerRow,
} from '@atlas/import-engine';
import {
  fixtureBuyPetr4,
  fixtureBuyVale3,
  fixtureSellPartial,
  fixtureDividend,
  fixtureJcp,
  fixtureTransferPair,
  fixtureUnknownNature,
} from './fixtures/b3-movements';

const OPTIONS = { today: '2026-06-30', defaultCurrency: 'BRL' };
const PORTFOLIO = '11111111-1111-4111-8111-111111111111';
const ACCOUNT = '22222222-2222-4222-8222-222222222222';
const ASSET_PETR4 = '33333333-3333-4333-8333-333333333333';

function assetMatch() {
  return resolveAsset('PETR4', [
    { id: ASSET_PETR4, ticker: 'PETR4', exchange: 'B3', status: 'ACTIVE' },
  ]);
}

function accountMatch() {
  return resolveAccount('Principal', [{ id: ACCOUNT, name: 'Principal' }]);
}

describe('Phase 5L: B3 adapter contract (no network, no secrets)', () => {
  it('exposes the B3 capability surface without any HTTP client', () => {
    expect(B3_CAPABILITIES).toEqual([
      'POSITIONS',
      'MOVEMENTS',
      'TRADES',
      'PROVISIONED_EVENTS',
      'AUTHORIZATION_STATUS',
      'GUIDE',
      'LAST_AVAILABLE_DATA',
    ]);
    const source: string = fs.readFileSync('packages/import-engine/src/b3.ts', 'utf8');
    const importLines = source.split('\n').filter((line) => line.trim().startsWith('import '));
    for (const line of importLines) {
      expect(line).toMatch(/from '(\.|@atlas\/domain|node:crypto)/);
    }
    expect(source).not.toMatch(/\bfetch\s*\(|\baxios\b|\bXMLHttpRequest\b/);
    expect(source).not.toMatch(/https?:\/\/[a-z0-9]/i);
    expect(source).not.toMatch(/client_id\s*[:=]|apiKey|privateKey|BEGIN [A-Z ]*PRIVATE KEY/);
  });

  it('A/B: normalizes B3 buys through the canonical pipeline', () => {
    for (const movement of [fixtureBuyPetr4(), fixtureBuyVale3()]) {
      const candidate = normalizeB3Movement(movement, 2, OPTIONS);
      expect(candidate.status).toBe('READY');
      expect(candidate.operation).toBe('BUY');
      expect(candidate.currency).toBe('BRL');
      expect(candidate.externalId).toBe(movement.movementId);
      expect(candidate.tradeDate).toBe(movement.tradeDate);
      expect(candidate.settlementDate).toBe(movement.settlementDate);
    }
    expect(normalizeB3Movement(fixtureBuyPetr4(), 2, OPTIONS).quantity).toBe('100');
    expect(normalizeB3Movement(fixtureBuyPetr4(), 2, OPTIONS).unitPrice).toBe('38.50');
  });

  it('C: normalizes partial sells as SELL', () => {
    const candidate = normalizeB3Movement(fixtureSellPartial(), 2, OPTIONS);
    expect(candidate.status).toBe('READY');
    expect(candidate.operation).toBe('SELL');
    expect(candidate.quantity).toBe('30');
  });

  it('D/E: dividends and JCP normalize to importable income with exact amounts', () => {
    const dividend = normalizeB3Movement(fixtureDividend(), 2, OPTIONS);
    expect(dividend.status).toBe('READY');
    expect(dividend.operation).toBe('DIVIDEND');
    expect(dividend.rawOperation).toBe('DIVIDENDO');
    expect(dividend.amount).toBe('87.30');

    const jcp = normalizeB3Movement(fixtureJcp(), 2, OPTIONS);
    expect(jcp.status).toBe('READY');
    expect(jcp.operation).toBe('JCP');
    expect(jcp.rawOperation).toBe('JCP');
    expect(jcp.amount).toBe('42.10');

    // Income is value-only: never a trade, never priced.
    expect([dividend.operation, jcp.operation]).not.toContain('BUY');
    expect([dividend.operation, jcp.operation]).not.toContain('SELL');
  });

  it('F: custody transfer legs keep the pair key and never become trades', () => {
    const [outLeg, inLeg] = fixtureTransferPair();
    const out = normalizeB3Movement(outLeg, 2, OPTIONS);
    const inn = normalizeB3Movement(inLeg, 3, OPTIONS);
    // Phase 5M: mirrored legs are importable as custody moves (not trades).
    expect(out.status).toBe('READY');
    expect(inn.status).toBe('READY');
    expect(out.operation).toBe('TRANSFER_OUT');
    expect(inn.operation).toBe('TRANSFER_IN');
    expect([out.operation, inn.operation]).not.toContain('BUY');
    expect([out.operation, inn.operation]).not.toContain('SELL');
    expect(out.transferGroupId).toBe('B3-SIM-TRF-001');
    expect(inn.transferGroupId).toBe('B3-SIM-TRF-001');
    expect(out.transferGroupId).toBe(inn.transferGroupId);
  });

  it('G: the same movement normalized twice yields the same fingerprint', () => {
    const first = normalizeB3Movement(fixtureBuyPetr4(), 2, OPTIONS);
    const second = normalizeB3Movement(fixtureBuyPetr4(), 2, OPTIONS);
    const fingerprintOf = (quantity: string) =>
      canonicalFingerprint({
        portfolioId: PORTFOLIO,
        accountId: ACCOUNT,
        assetId: ASSET_PETR4,
        type: 'BUY',
        tradeDate: '2026-03-10',
        quantity,
        unitPrice: '38.50',
        fees: '4.90',
        currency: 'BRL',
      });
    expect(fingerprintOf(first.quantity)).toBe(fingerprintOf(second.quantity));
  });

  it('unknown B3 payloads fail closed without touching the ledger', () => {
    const candidate = normalizeB3Movement(fixtureUnknownNature(), 2, OPTIONS);
    expect(candidate.status).toBe('INVALID');
    expect(candidate.issues.map((issue) => issue.code)).toContain('UNKNOWN_OPERATION');
  });

  it('B3 movement replays the same trade imported by CSV (cross-source dedupe)', () => {
    const candidate = normalizeB3Movement(fixtureBuyPetr4(), 2, OPTIONS);
    const classified = classifyOne({
      portfolioId: PORTFOLIO,
      provider: 'B3',
      candidate: { ...candidate, externalId: undefined },
      assetMatch: assetMatch(),
      accountMatch: accountMatch(),
      defaultAccountId: ACCOUNT,
      existing: [
        {
          provider: 'CSV',
          externalId: 'NEG-1',
          assetId: ASSET_PETR4,
          accountId: ACCOUNT,
          type: 'BUY',
          tradeDate: '2026-03-10',
          quantity: '100',
          unitPrice: '38.50',
          fees: '4.90',
          amount: null,
          currency: 'BRL',
          fingerprint: canonicalFingerprint({
            portfolioId: PORTFOLIO,
            accountId: ACCOUNT,
            assetId: ASSET_PETR4,
            type: 'BUY',
            tradeDate: '2026-03-10',
            quantity: '100',
            unitPrice: '38.50',
            fees: '4.90',
            currency: 'BRL',
          }),
        } satisfies ExistingLedgerRow,
      ],
    });
    expect(classified.duplicate).toBe('EXACT_DUPLICATE');
    expect(classified.status).toBe('DUPLICATE');
  });

  it('fixtures carry zero PII, secrets or credentials', () => {
    const content: string = fs.readFileSync('tests/import-engine/fixtures/b3-movements.ts', 'utf8');
    expect(content).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
    expect(content).not.toMatch(/\b\d{11}\b/);
    expect(content).not.toMatch(/token\s*[:=]\s*['"][^'"]+['"]/i);
    expect(content).not.toMatch(/secret\s*[:=]\s*['"][^'"]+['"]/i);
    expect(content).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY/);
    expect(content).not.toMatch(/cnpj\s*[:=]/i);
    expect(content).toContain('SINTETIC');
  });
});
