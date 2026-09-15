import { describe, it, expect } from 'vitest';
import {
  Asset,
  Institution,
  Account,
  Portfolio,
  InvalidEntityError,
} from '../../packages/domain/src/index';

describe('Domain: Core Entities', () => {
  describe('Asset', () => {
    it('should create valid Asset and normalize ticker to uppercase and trimmed', () => {
      const asset = Asset.create({
        ticker: '  petr4  ',
        name: 'Petrobras PN',
        type: 'STOCK',
        currency: 'BRL',
        exchange: '  b3  ',
      });

      expect(asset.ticker).toBe('PETR4');
      expect(asset.exchange).toBe('B3');
      expect(asset.type).toBe('STOCK');
      expect(asset.currency).toBe('BRL');
      expect(asset.status).toBe('ACTIVE');
    });

    it('should reject empty ticker, empty name, or empty exchange', () => {
      expect(() =>
        Asset.create({
          ticker: '   ',
          name: 'Valid Name',
          type: 'STOCK',
          currency: 'BRL',
          exchange: 'B3',
        }),
      ).toThrow(InvalidEntityError);

      expect(() =>
        Asset.create({
          ticker: 'PETR4',
          name: '',
          type: 'STOCK',
          currency: 'BRL',
          exchange: 'B3',
        }),
      ).toThrow(InvalidEntityError);
    });

    it('must strictly enforce that ticker is NOT identity (two assets with same ticker can exist across exchanges with distinct IDs)', () => {
      const assetB3 = Asset.create({
        id: '11111111-1111-4111-8111-111111111111',
        ticker: 'VALE',
        name: 'Vale S.A. (B3)',
        type: 'STOCK',
        currency: 'BRL',
        exchange: 'B3',
      });

      const assetNyse = Asset.create({
        id: '22222222-2222-4222-8222-222222222222',
        ticker: 'VALE',
        name: 'Vale S.A. ADR (NYSE)',
        type: 'STOCK',
        currency: 'USD',
        exchange: 'NYSE',
      });

      expect(assetB3.ticker).toBe(assetNyse.ticker);
      expect(assetB3.id).not.toBe(assetNyse.id);
      expect(assetB3.equals(assetNyse)).toBe(false);
    });
  });

  describe('Institution', () => {
    it('should create an institution with valid properties', () => {
      const inst = Institution.create({
        id: '33333333-3333-4333-8333-333333333333',
        name: 'BTG Pactual',
        type: 'BANK',
        country: 'br',
      });

      expect(inst.name).toBe('BTG Pactual');
      expect(inst.type).toBe('BANK');
      expect(inst.country).toBe('BR');
    });
  });

  describe('Account', () => {
    it('should create an account linked to a portfolio and institution', () => {
      const account = Account.create({
        id: '44444444-4444-4444-8444-444444444444',
        portfolioId: '55555555-5555-4555-8555-555555555555',
        institutionId: '33333333-3333-4333-8333-333333333333',
        name: 'Conta Investimento BTG',
        currency: 'BRL',
      });

      expect(account.name).toBe('Conta Investimento BTG');
      expect(account.status).toBe('ACTIVE');
      expect(account.currency).toBe('BRL');
    });
  });

  describe('Portfolio', () => {
    it('should create a portfolio linked to a user with baseCurrency and type', () => {
      const portfolio = Portfolio.create({
        id: '55555555-5555-4555-8555-555555555555',
        userId: '66666666-6666-4666-8666-666666666666',
        name: 'Carteira Aposentadoria',
        baseCurrency: 'BRL',
        type: 'PERSONAL',
      });

      expect(portfolio.name).toBe('Carteira Aposentadoria');
      expect(portfolio.baseCurrency).toBe('BRL');
      expect(portfolio.type).toBe('PERSONAL');
      expect(portfolio.status).toBe('ACTIVE');
      expect(portfolio.createdAt).toBeInstanceOf(Date);
    });
  });
});
