import { describe, it, expect, vi } from 'vitest';
import { LocalDate, Money, Currency } from '@atlas/domain';
import {
  calculatePortfolioPerformance,
  calculatePerformanceSeries,
} from '@atlas/performance-engine';
import { mapToPortfolioPerformanceViewModel } from '../../packages/ui/src/view-models/portfolio-performance.view-model';
import { mapToPortfolioPerformanceSeriesViewModel } from '../../packages/ui/src/view-models/portfolio-performance-series.view-model';
import { HistoricalValuationBuilder } from '../../apps/api/src/application/performance/historical-valuation.builder';
import { ScenarioSnapshotBuilder } from '../../apps/api/src/application/performance/scenario-snapshot.builder';
import { ITransactionRepository, IAssetRepository, AssetRow } from '@atlas/database';
import { TransactionFactory } from '@atlas/domain';

const BRL = 'BRL' as Currency;

describe('Phase 5A-I4-H1: Performance Availability & Historical Replay Correction', () => {
  it('calculatePortfolioPerformance returns INSUFFICIENT_DATA and UNAVAILABLE when observations count is < 2', () => {
    const perfZero = calculatePortfolioPerformance({
      period: { startDate: LocalDate.from('2026-01-01'), endDate: LocalDate.from('2026-10-16') },
      observationsByCurrency: { BRL: [] },
      cashFlowsByCurrency: {},
    });
    expect(perfZero.status).toBe('INSUFFICIENT_DATA');
    expect(perfZero.dataAvailability).toBe('UNAVAILABLE');
    expect(perfZero.currencies['BRL']?.twr).toBeNull();
    expect(perfZero.currencies['BRL']?.xirr).toBeNull();

    const perfOne = calculatePortfolioPerformance({
      period: { startDate: LocalDate.from('2026-01-01'), endDate: LocalDate.from('2026-10-16') },
      observationsByCurrency: {
        BRL: [
          {
            date: LocalDate.from('2026-10-16'),
            value: Money.from('19129.80', BRL),
            currency: BRL,
          },
        ],
      },
      cashFlowsByCurrency: {},
    });
    expect(perfOne.status).toBe('INSUFFICIENT_DATA');
    expect(perfOne.dataAvailability).toBe('UNAVAILABLE');
    expect(perfOne.currencies['BRL']?.twr).toBeNull();
    expect(perfOne.currencies['BRL']?.xirr).toBeNull();
    expect(perfOne.currencies['BRL']?.status).toBe('INSUFFICIENT_DATA');
    expect(perfOne.currencies['BRL']?.dataAvailability).toBe('UNAVAILABLE');
  });

  it('calculatePerformanceSeries returns INSUFFICIENT_DATA and UNAVAILABLE without fabricated trajectory when observations < 2', () => {
    const series = calculatePerformanceSeries({
      observations: [
        {
          date: LocalDate.from('2026-10-16'),
          value: Money.from('19129.80', BRL),
          currency: BRL,
        },
      ],
      cashFlows: [],
      period: { startDate: LocalDate.from('2026-01-01'), endDate: LocalDate.from('2026-10-16') },
      currency: BRL,
      displayDates: [LocalDate.from('2026-01-01'), LocalDate.from('2026-10-16')],
      granularity: 'DAILY',
    });

    expect(series.status).toBe('INSUFFICIENT_DATA');
    expect(series.dataAvailability).toBe('UNAVAILABLE');
    expect(series.points).toHaveLength(2);
    expect(series.points.every((p) => p.cumulativeReturn === null)).toBe(true);
    expect(series.points.every((p) => p.status === 'UNAVAILABLE')).toBe(true);
  });

  it('mapToPortfolioPerformanceViewModel enforces mutual exclusivity and marks isUnavailable=true when status is INSUFFICIENT_DATA', () => {
    const vm = mapToPortfolioPerformanceViewModel({
      portfolioId: 'port-1',
      period: { startDate: '2026-01-01', endDate: '2026-10-16' },
      currencies: {
        BRL: {
          currency: 'BRL',
          twr: null,
          xirr: null,
          twrStatus: 'INSUFFICIENT_DATA',
          xirrStatus: 'INSUFFICIENT_DATA',
          status: 'INSUFFICIENT_DATA',
          dataAvailability: 'UNAVAILABLE',
        },
      },
      status: 'INSUFFICIENT_DATA',
      dataAvailability: 'UNAVAILABLE',
    });

    expect(vm.isUnavailable).toBe(true);
    expect(vm.isPartial).toBe(false);
    expect(vm.isAvailable).toBe(false);
    expect(vm.statusLabel).toBe('Dados indisponíveis');
  });

  it('mapToPortfolioPerformanceSeriesViewModel marks series with < 2 valued points as isUnavailable=true', () => {
    const vm = mapToPortfolioPerformanceSeriesViewModel({
      portfolioId: 'port-1',
      period: { startDate: '2026-01-01', endDate: '2026-10-16' },
      requestedGranularity: 'AUTO',
      currencies: {
        BRL: {
          currency: 'BRL',
          granularity: 'DAILY',
          status: 'PARTIAL',
          dataAvailability: 'PARTIAL',
          points: [
            {
              date: '2026-01-01',
              portfolioReturn: '0',
              benchmarkReturn: null,
              status: 'COMPLETE',
            },
            {
              date: '2026-10-16',
              portfolioReturn: null,
              benchmarkReturn: null,
              status: 'UNAVAILABLE',
            },
          ],
        },
      },
      status: 'PARTIAL',
      dataAvailability: 'PARTIAL',
    });

    const brl = vm?.currencies.find((c) => c.currency === 'BRL');
    expect(brl).toBeDefined();
    expect(brl?.valuedPoints).toHaveLength(1);
    expect(brl?.isUnavailable).toBe(true);
    expect(brl?.isPartial).toBe(false);
  });

  it('HistoricalValuationBuilder does not value positions when provider returns status UNAVAILABLE (no 0.01 fake value)', async () => {
    const mockTxRepo: Partial<ITransactionRepository> = {
      findByPortfolioId: vi.fn().mockResolvedValue([
        TransactionFactory.createBuy({
          id: '11111111-1111-4111-8111-111111111111',
          portfolioId: '22222222-2222-4222-8222-222222222222',
          accountId: '33333333-3333-4333-8333-333333333333',
          assetId: '44444444-4444-4444-8444-444444444444',
          quantity: '100',
          unitPrice: '30.00',
          currency: 'BRL',
          tradeDate: '2026-01-10',
        }),
      ]),
    };

    const mockAsset: AssetRow = {
      id: '44444444-4444-4444-8444-444444444444',
      ticker: 'PETR4',
      exchange: 'B3',
      name: 'Petrobras PN',
      type: 'STOCK',
      currency: 'BRL',
      figi: null,
      isin: null,
      cusip: null,
      sedol: null,
      classCode: null,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockAssetRepo: Partial<IAssetRepository> = {
      findById: vi.fn().mockResolvedValue(mockAsset),
    };

    const mockHistoricalProvider: HistoricalMarketDataProvider = {
      provider: 'BRAPI',
      getDailyPrice: vi.fn().mockResolvedValue({
        assetId: '44444444-4444-4444-8444-444444444444',
        date: LocalDate.from('2026-08-20'),
        close: Money.from('0.01', BRL),
        currency: BRL,
        source: 'BRAPI',
        status: 'UNAVAILABLE',
      }),
      getDailyPrices: vi.fn().mockResolvedValue([]),
    };

    const builder = new HistoricalValuationBuilder(
      mockTxRepo as ITransactionRepository,
      mockAssetRepo as IAssetRepository,
      mockHistoricalProvider,
    );

    const obs = await builder.buildObservation({
      portfolioId: '22222222-2222-4222-8222-222222222222',
      date: LocalDate.from('2026-08-20'),
      currency: BRL,
    });

    expect(obs.status).toBe('UNAVAILABLE');
    expect(obs.valuedPositions).toBe(0);
    expect(obs.value.isZero()).toBe(true);
  });

  it('ScenarioSnapshotBuilder leaves marketPrice and marketValue null when quote is UNAVAILABLE', async () => {
    const mockTxRepo: Partial<ITransactionRepository> = {
      findByPortfolioId: vi.fn().mockResolvedValue([
        TransactionFactory.createBuy({
          id: '11111111-1111-4111-8111-111111111111',
          portfolioId: '22222222-2222-4222-8222-222222222222',
          accountId: '33333333-3333-4333-8333-333333333333',
          assetId: '44444444-4444-4444-8444-444444444444',
          quantity: '100',
          unitPrice: '30.00',
          currency: 'BRL',
          tradeDate: '2026-01-10',
        }),
      ]),
    };

    const mockAsset: AssetRow = {
      id: '44444444-4444-4444-8444-444444444444',
      ticker: 'PETR4',
      exchange: 'B3',
      name: 'Petrobras PN',
      type: 'STOCK',
      currency: 'BRL',
      figi: null,
      isin: null,
      cusip: null,
      sedol: null,
      classCode: null,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockAssetRepo: Partial<IAssetRepository> = {
      findById: vi.fn().mockResolvedValue(mockAsset),
    };

    const mockHistoricalProvider: HistoricalMarketDataProvider = {
      provider: 'BRAPI',
      getDailyPrice: vi.fn().mockResolvedValue({
        assetId: '44444444-4444-4444-8444-444444444444',
        date: LocalDate.from('2026-08-20'),
        close: Money.from('0.01', BRL),
        currency: BRL,
        source: 'BRAPI',
        status: 'UNAVAILABLE',
      }),
      getDailyPrices: vi.fn().mockResolvedValue([]),
    };

    const builder = new ScenarioSnapshotBuilder(
      mockTxRepo as ITransactionRepository,
      mockAssetRepo as IAssetRepository,
      mockHistoricalProvider,
    );

    const snapshots = await builder.build({
      portfolioId: '22222222-2222-4222-8222-222222222222',
      asOf: LocalDate.from('2026-08-20'),
    });

    expect(snapshots).toHaveLength(1);
    const pos = snapshots[0]?.positions[0];
    expect(pos).toBeDefined();
    expect(pos?.marketPrice).toBeNull();
    expect(pos?.marketValue).toBeNull();
  });
});
