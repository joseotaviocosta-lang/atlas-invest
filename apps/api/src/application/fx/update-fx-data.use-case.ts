import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { LocalDate, Currency, assertValidCurrency } from '@atlas/domain';
import {
  IFxDataProvider,
  FxObservation,
  BcbFxDataProvider,
  InMemoryFxDataProvider,
} from '@atlas/market-data';
import { IFxObservationRepository } from '@atlas/database';
import { FX_OBSERVATION_REPOSITORY } from '../../database/tokens';

export interface FxIngestionReceipt {
  baseCurrency: Currency;
  quoteCurrency: Currency;
  provider: string;
  from: string;
  to: string;
  observationsFetched: number;
  observationsInserted: number;
  observationsUnchanged: number;
  observationsRevised: number;
  providerErrors: string[];
  startedAt: string;
  finishedAt: string;
  status: 'COMPLETED' | 'COMPLETED_WITH_WARNINGS' | 'FAILED';
}

export interface UpdateFxDataParams {
  baseCurrency: string;
  quoteCurrency: string;
  from: string;
  to: string;
  providerOverride?: 'BCB' | 'IN_MEMORY';
}

@Injectable()
export class UpdateFxDataUseCase {
  constructor(
    @Inject(FX_OBSERVATION_REPOSITORY)
    private readonly repository: IFxObservationRepository,
  ) {}

  async execute(params: UpdateFxDataParams): Promise<FxIngestionReceipt> {
    const startedAt = new Date().toISOString();
    const baseCurrency = assertValidCurrency(params.baseCurrency);
    const quoteCurrency = assertValidCurrency(params.quoteCurrency);

    if (baseCurrency === quoteCurrency) {
      throw new BadRequestException({
        message: `Same-currency FX pair '${baseCurrency}/${quoteCurrency}' is not allowed for ingestion. Identity rate 1.0 is handled internally.`,
        code: 'VALIDATION.SAME_CURRENCY_NOT_ALLOWED',
      });
    }

    let fromDate: LocalDate;
    let toDate: LocalDate;
    try {
      fromDate = LocalDate.from(params.from);
      toDate = LocalDate.from(params.to);
    } catch {
      throw new BadRequestException({
        message: `Invalid date format in range '${params.from}' to '${params.to}'. Expected YYYY-MM-DD.`,
        code: 'VALIDATION.INVALID_DATE_FORMAT',
      });
    }

    if (fromDate.compare(toDate) > 0) {
      throw new BadRequestException({
        message: `Invalid date range: 'from' (${params.from}) cannot be after 'to' (${params.to})`,
        code: 'VALIDATION.INVALID_DATE_RANGE',
      });
    }

    const da = Date.UTC(fromDate.year, fromDate.month - 1, fromDate.day);
    const db = Date.UTC(toDate.year, toDate.month - 1, toDate.day);
    const days = Math.round((db - da) / (1000 * 60 * 60 * 24));
    if (days > 365 * 5) {
      throw new BadRequestException({
        message: `Date range exceeds maximum allowed limit of 5 years (requested ${days} days)`,
        code: 'VALIDATION.RANGE_TOO_LARGE',
      });
    }

    const providerOverride =
      params.providerOverride ?? (process.env.NODE_ENV === 'test' ? 'IN_MEMORY' : undefined);

    const receipt: FxIngestionReceipt = {
      baseCurrency,
      quoteCurrency,
      provider: providerOverride ?? 'BCB',
      from: fromDate.toString(),
      to: toDate.toString(),
      observationsFetched: 0,
      observationsInserted: 0,
      observationsUnchanged: 0,
      observationsRevised: 0,
      providerErrors: [],
      startedAt,
      finishedAt: '',
      status: 'COMPLETED',
    };

    let provider: IFxDataProvider;
    if (providerOverride === 'IN_MEMORY') {
      provider = new InMemoryFxDataProvider();
    } else {
      provider = new BcbFxDataProvider();
    }

    let fetched: FxObservation[] = [];
    try {
      fetched = await provider.getRates(baseCurrency, quoteCurrency, fromDate, toDate);
    } catch (err) {
      receipt.providerErrors.push(
        `Failed to fetch FX data from provider ${receipt.provider}: ${err instanceof Error ? err.message : String(err)}`,
      );
      receipt.status = 'FAILED';
      receipt.finishedAt = new Date().toISOString();
      return receipt;
    }

    receipt.observationsFetched = fetched.length;

    for (const obs of fetched) {
      try {
        const result = await this.repository.upsertObservation({
          baseCurrency: obs.baseCurrency,
          quoteCurrency: obs.quoteCurrency,
          observationDate: obs.date,
          rate: obs.rate.value,
          rateType: obs.rateType,
          source: obs.source,
        });

        if (result.outcome === 'INSERTED') receipt.observationsInserted++;
        else if (result.outcome === 'UNCHANGED') receipt.observationsUnchanged++;
        else if (result.outcome === 'REVISED') receipt.observationsRevised++;
      } catch (err) {
        receipt.providerErrors.push(
          `Failed to persist observation for ${obs.date.toString()}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (receipt.providerErrors.length > 0) {
      receipt.status = 'COMPLETED_WITH_WARNINGS';
    }

    receipt.finishedAt = new Date().toISOString();
    return receipt;
  }
}
