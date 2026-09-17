import { describe, it, expect } from 'vitest';
import { scenario } from '../scenario-builder';
import { ACCOUNT_XP, ACCOUNT_NU, ASSET_PETR4, ASSET_VALE3 } from '../fixtures/assets';
import {
  TransferPairMismatchError,
  CrossAssetTransferError,
  TransferCurrencyMismatchError,
  DuplicateTransferLegError,
  InvalidTransferGroupError,
  NegativePositionError,
} from '@atlas/portfolio-engine';

describe('Portfolio Engine: Transfer Semantic Validations (Phase 1F)', () => {
  it('should reject quantity mismatch between paired OUT and IN legs with TransferPairMismatchError', () => {
    expect(() => {
      scenario()
        .buy({
          accountId: ACCOUNT_XP,
          assetId: ASSET_PETR4,
          quantity: '100',
          unitPrice: '10.00',
          tradeDate: '2026-01-05',
        })
        .transferOut({
          accountId: ACCOUNT_XP,
          assetId: ASSET_PETR4,
          quantity: '100',
          transferGroupId: 'tg-qty-mismatch',
          tradeDate: '2026-01-10',
        })
        .transferIn({
          accountId: ACCOUNT_NU,
          assetId: ASSET_PETR4,
          quantity: '90', // Mismatch!
          transferGroupId: 'tg-qty-mismatch',
          tradeDate: '2026-01-10',
        })
        .replay();
    }).toThrow(TransferPairMismatchError);
  });

  it('should reject asset mismatch in transfer group with CrossAssetTransferError', () => {
    expect(() => {
      scenario()
        .buy({
          accountId: ACCOUNT_XP,
          assetId: ASSET_PETR4,
          quantity: '100',
          unitPrice: '10.00',
          tradeDate: '2026-01-05',
        })
        .transferOut({
          accountId: ACCOUNT_XP,
          assetId: ASSET_PETR4,
          quantity: '50',
          transferGroupId: 'tg-asset-mismatch',
          tradeDate: '2026-01-10',
        })
        .transferIn({
          accountId: ACCOUNT_NU,
          assetId: ASSET_VALE3, // Mismatch!
          quantity: '50',
          transferGroupId: 'tg-asset-mismatch',
          tradeDate: '2026-01-10',
        })
        .replay();
    }).toThrow(CrossAssetTransferError);
  });

  it('should reject currency mismatch in transfer group with TransferCurrencyMismatchError', () => {
    expect(() => {
      scenario()
        .buy({
          accountId: ACCOUNT_XP,
          assetId: ASSET_PETR4,
          quantity: '100',
          unitPrice: '10.00',
          currency: 'BRL',
          tradeDate: '2026-01-05',
        })
        .transferOut({
          accountId: ACCOUNT_XP,
          assetId: ASSET_PETR4,
          quantity: '50',
          currency: 'BRL',
          transferGroupId: 'tg-curr-mismatch',
          tradeDate: '2026-01-10',
        })
        .transferIn({
          accountId: ACCOUNT_NU,
          assetId: ASSET_PETR4,
          quantity: '50',
          currency: 'USD', // Mismatch!
          transferGroupId: 'tg-curr-mismatch',
          tradeDate: '2026-01-10',
        })
        .replay();
    }).toThrow(TransferCurrencyMismatchError);
  });

  it('should reject duplicate TRANSFER_OUT with same transferGroupId with DuplicateTransferLegError', () => {
    expect(() => {
      scenario()
        .buy({
          accountId: ACCOUNT_XP,
          assetId: ASSET_PETR4,
          quantity: '100',
          unitPrice: '10.00',
          tradeDate: '2026-01-05',
        })
        .transferOut({
          accountId: ACCOUNT_XP,
          assetId: ASSET_PETR4,
          quantity: '50',
          transferGroupId: 'tg-dup-out',
          tradeDate: '2026-01-10',
        })
        .transferOut({
          accountId: ACCOUNT_XP,
          assetId: ASSET_PETR4,
          quantity: '50',
          transferGroupId: 'tg-dup-out', // Duplicate OUT!
          tradeDate: '2026-01-10',
        })
        .replay();
    }).toThrow(DuplicateTransferLegError);
  });

  it('should reject duplicate TRANSFER_IN with same transferGroupId with DuplicateTransferLegError', () => {
    expect(() => {
      scenario()
        .transferIn({
          accountId: ACCOUNT_NU,
          assetId: ASSET_PETR4,
          quantity: '50',
          transferGroupId: 'tg-dup-in',
          tradeDate: '2026-01-10',
        })
        .transferIn({
          accountId: ACCOUNT_NU,
          assetId: ASSET_PETR4,
          quantity: '50',
          transferGroupId: 'tg-dup-in', // Duplicate IN!
          tradeDate: '2026-01-10',
        })
        .replay();
    }).toThrow(DuplicateTransferLegError);
  });

  it('should reject transfer to the same account with InvalidTransferGroupError', () => {
    expect(() => {
      scenario()
        .buy({
          accountId: ACCOUNT_XP,
          assetId: ASSET_PETR4,
          quantity: '100',
          unitPrice: '10.00',
          tradeDate: '2026-01-05',
        })
        .transfer({
          fromAccountId: ACCOUNT_XP,
          toAccountId: ACCOUNT_XP, // Self-transfer!
          assetId: ASSET_PETR4,
          quantity: '50',
          transferGroupId: 'tg-self-transfer',
          tradeDate: '2026-01-10',
        })
        .replay();
    }).toThrow(InvalidTransferGroupError);
  });

  it('should reject causal date inversion where IN tradeDate precedes OUT tradeDate with InvalidTransferGroupError', () => {
    expect(() => {
      scenario()
        .buy({
          accountId: ACCOUNT_XP,
          assetId: ASSET_PETR4,
          quantity: '100',
          unitPrice: '10.00',
          tradeDate: '2026-01-05',
        })
        .transfer({
          fromAccountId: ACCOUNT_XP,
          toAccountId: ACCOUNT_NU,
          assetId: ASSET_PETR4,
          quantity: '50',
          transferGroupId: 'tg-causal-inversion',
          outTradeDate: '2026-01-15',
          inTradeDate: '2026-01-10', // Arrives before departure!
        })
        .replay();
    }).toThrow(InvalidTransferGroupError);
  });

  it('should reject transfer exceeding available custody with NegativePositionError', () => {
    expect(() => {
      scenario()
        .buy({
          accountId: ACCOUNT_XP,
          assetId: ASSET_PETR4,
          quantity: '50',
          unitPrice: '10.00',
          tradeDate: '2026-01-05',
        })
        .transfer({
          fromAccountId: ACCOUNT_XP,
          toAccountId: ACCOUNT_NU,
          assetId: ASSET_PETR4,
          quantity: '80', // Exceeds 50 available!
          transferGroupId: 'tg-exceed-qty',
          tradeDate: '2026-01-10',
        })
        .replay();
    }).toThrow(NegativePositionError);
  });
});
