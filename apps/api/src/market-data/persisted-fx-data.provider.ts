import { Injectable, Inject } from '@nestjs/common';
import { LocalDate, Quantity, Currency } from '@atlas/domain';
import { IFxDataProvider, FxObservation, FxRateType } from '@atlas/market-data';
import { IFxObservationRepository } from '@atlas/database';
import { FX_OBSERVATION_REPOSITORY } from '../database/tokens';

function addDays(date: LocalDate, days: number): LocalDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return LocalDate.fromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/**
 * Persisted FX data provider for Phase 5C.
 *
 * Reads canonical daily exchange rates strictly from the persisted
 * `fx_observations` database repository.
 *
 * Performs ZERO live external network calls on reads.
 */
@Injectable()
export class PersistedFxDataProvider implements IFxDataProvider {
  readonly provider = 'PERSISTED_DATABASE';
  private readonly maxLookbackDays: number;

  constructor(
    @Inject(FX_OBSERVATION_REPOSITORY)
    private readonly repository: IFxObservationRepository,
    options: { maxLookbackDays?: number } = {},
  ) {
    this.maxLookbackDays = options.maxLookbackDays ?? 7;
  }

  async getRate(
    baseCurrency: Currency,
    quoteCurrency: Currency,
    date: LocalDate,
  ): Promise<FxObservation> {
    if (baseCurrency === quoteCurrency) {
      return Object.freeze({
        baseCurrency,
        quoteCurrency,
        date,
        rate: Quantity.from('1'),
        rateType: 'MID',
        source: 'IDENTITY',
      });
    }

    // 1. Direct pair lookup on exact date
    const exact = await this.repository.findObservation(baseCurrency, quoteCurrency, date);
    if (exact) {
      return Object.freeze({
        baseCurrency,
        quoteCurrency,
        date: exact.observationDate,
        rate: Quantity.from(exact.rate),
        rateType: exact.rateType as FxRateType,
        source: exact.source,
      });
    }

    // 2. Inverse pair lookup on exact date (e.g. BRL/USD -> invert USD/BRL)
    const exactInv = await this.repository.findObservation(quoteCurrency, baseCurrency, date);
    if (exactInv) {
      const one = Quantity.from('1');
      const invRate = one.divide(Quantity.from(exactInv.rate));
      return Object.freeze({
        baseCurrency,
        quoteCurrency,
        date: exactInv.observationDate,
        rate: invRate,
        rateType: exactInv.rateType as FxRateType,
        source: `${exactInv.source}_INVERTED`,
      });
    }

    // 3. Lookback up to maxLookbackDays (for weekends & banking holidays)
    let current = date;
    for (let i = 1; i <= this.maxLookbackDays; i++) {
      const prev = addDays(current, -1);

      // Try direct on prev
      const prevDirect = await this.repository.findObservation(baseCurrency, quoteCurrency, prev);
      if (prevDirect) {
        return Object.freeze({
          baseCurrency,
          quoteCurrency,
          date: prevDirect.observationDate,
          rate: Quantity.from(prevDirect.rate),
          rateType: prevDirect.rateType as FxRateType,
          source: prevDirect.source,
        });
      }

      // Try inverse on prev
      const prevInv = await this.repository.findObservation(quoteCurrency, baseCurrency, prev);
      if (prevInv) {
        const one = Quantity.from('1');
        const invRate = one.divide(Quantity.from(prevInv.rate));
        return Object.freeze({
          baseCurrency,
          quoteCurrency,
          date: prevInv.observationDate,
          rate: invRate,
          rateType: prevInv.rateType as FxRateType,
          source: `${prevInv.source}_INVERTED`,
        });
      }

      current = prev;
    }

    throw new Error(
      `FX observation not found in database for ${baseCurrency}/${quoteCurrency} on ${date.toString()} (within ${this.maxLookbackDays} days lookback)`,
    );
  }

  async getRates(
    baseCurrency: Currency,
    quoteCurrency: Currency,
    from: LocalDate,
    to: LocalDate,
  ): Promise<FxObservation[]> {
    if (from.compare(to) > 0) throw new Error('Invalid range');

    const rows = await this.repository.findObservations(baseCurrency, quoteCurrency, from, to);
    if (rows.length > 0) {
      return rows.map((r) =>
        Object.freeze({
          baseCurrency,
          quoteCurrency,
          date: r.observationDate,
          rate: Quantity.from(r.rate),
          rateType: r.rateType as FxRateType,
          source: r.source,
        }),
      );
    }

    // Try inverted series
    const invRows = await this.repository.findObservations(quoteCurrency, baseCurrency, from, to);
    return invRows.map((r) => {
      const one = Quantity.from('1');
      const invRate = one.divide(Quantity.from(r.rate));
      return Object.freeze({
        baseCurrency,
        quoteCurrency,
        date: r.observationDate,
        rate: invRate,
        rateType: r.rateType as FxRateType,
        source: `${r.source}_INVERTED`,
      });
    });
  }
}
