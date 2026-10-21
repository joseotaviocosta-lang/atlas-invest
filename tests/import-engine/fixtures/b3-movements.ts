/**
 * Phase 5L — synthetic B3 movement fixtures (A–H).
 *
 * 100% fictional: no real CPF, name, account, broker linkage, token,
 * certificate or owner data. Custodian/account labels are obvious
 * placeholders. Tickers are public market symbols, not personal data.
 */

import type { B3MovementRecord } from '@atlas/import-engine';

export const SYNTHETIC_CUSTODIAN = 'CORRETORA EXEMPLO S.A.';
export const SYNTHETIC_ACCOUNT = 'CONTA SINTETICA 001';

/** A — compra PETR4. */
export function fixtureBuyPetr4(): B3MovementRecord {
  return {
    movementId: 'B3-SIM-0001',
    nature: 'COMPRA',
    ticker: 'PETR4',
    tradeDate: '2026-03-10',
    settlementDate: '2026-03-12',
    quantity: '100',
    unitPrice: '38,50',
    fees: '4,90',
    currency: 'BRL',
    custodianLabel: SYNTHETIC_CUSTODIAN,
    accountLabel: SYNTHETIC_ACCOUNT,
  };
}

/** B — compra VALE3. */
export function fixtureBuyVale3(): B3MovementRecord {
  return {
    movementId: 'B3-SIM-0002',
    nature: 'COMPRA',
    ticker: 'VALE3',
    tradeDate: '2026-03-11',
    settlementDate: '2026-03-13',
    quantity: '50',
    unitPrice: '72,10',
    currency: 'BRL',
    custodianLabel: SYNTHETIC_CUSTODIAN,
    accountLabel: SYNTHETIC_ACCOUNT,
  };
}

/** C — venda parcial. */
export function fixtureSellPartial(): B3MovementRecord {
  return {
    movementId: 'B3-SIM-0003',
    nature: 'VENDA',
    ticker: 'PETR4',
    tradeDate: '2026-04-05',
    settlementDate: '2026-04-07',
    quantity: '30',
    unitPrice: '41,00',
    fees: '1,90',
    currency: 'BRL',
    custodianLabel: SYNTHETIC_CUSTODIAN,
    accountLabel: SYNTHETIC_ACCOUNT,
  };
}

/** D — dividendo. */
export function fixtureDividend(): B3MovementRecord {
  return {
    movementId: 'B3-SIM-0004',
    nature: 'DIVIDENDO',
    ticker: 'PETR4',
    tradeDate: '2026-04-15',
    quantity: '100',
    amount: '87,30',
    currency: 'BRL',
    custodianLabel: SYNTHETIC_CUSTODIAN,
    accountLabel: SYNTHETIC_ACCOUNT,
  };
}

/** E — JCP. */
export function fixtureJcp(): B3MovementRecord {
  return {
    movementId: 'B3-SIM-0005',
    nature: 'JCP',
    ticker: 'VALE3',
    tradeDate: '2026-04-15',
    quantity: '50',
    amount: '42,10',
    currency: 'BRL',
    custodianLabel: SYNTHETIC_CUSTODIAN,
    accountLabel: SYNTHETIC_ACCOUNT,
  };
}

/** F — transferência de custódia (par espelhado, sem alienação econômica). */
export function fixtureTransferPair(): [B3MovementRecord, B3MovementRecord] {
  const pairKey = 'B3-SIM-TRF-001';
  return [
    {
      movementId: 'B3-SIM-0006-OUT',
      nature: 'TRANSFERENCIA_SAIDA',
      ticker: 'PETR4',
      tradeDate: '2026-05-02',
      quantity: '70',
      currency: 'BRL',
      custodianLabel: SYNTHETIC_CUSTODIAN,
      accountLabel: 'CONTA SINTETICA 001',
      pairKey,
    },
    {
      movementId: 'B3-SIM-0006-IN',
      nature: 'TRANSFERENCIA_ENTRADA',
      ticker: 'PETR4',
      tradeDate: '2026-05-02',
      quantity: '70',
      currency: 'BRL',
      custodianLabel: SYNTHETIC_CUSTODIAN,
      accountLabel: 'CONTA SINTETICA 002',
      pairKey,
    },
  ];
}

/** Payload desconhecido — nunca pode corromper o ledger. */
export function fixtureUnknownNature(): B3MovementRecord {
  return {
    movementId: 'B3-SIM-9999',
    nature: 'EVENTO_DESCONHECIDO_XYZ',
    ticker: 'PETR4',
    tradeDate: '2026-06-01',
    quantity: '10',
    currency: 'BRL',
    custodianLabel: SYNTHETIC_CUSTODIAN,
    accountLabel: SYNTHETIC_ACCOUNT,
  };
}
