import { AssetId, createAssetId } from '../primitives/domain-id';
import { Currency, assertValidCurrency } from '../primitives/currency';
import { AssetType, AssetStatus } from '../ledger/types';
import { InvalidEntityError } from '../errors/domain-error';

export interface AssetProps {
  id: AssetId;
  ticker: string;
  name: string;
  type: AssetType;
  currency: Currency;
  exchange: string;
  isin?: string;
  cnpj?: string;
  status?: AssetStatus;
}

export interface AssetJSON {
  id: string;
  ticker: string;
  name: string;
  type: AssetType;
  currency: string;
  exchange: string;
  isin?: string;
  cnpj?: string;
  status: AssetStatus;
}

export class Asset {
  readonly id: AssetId;
  readonly ticker: string;
  readonly name: string;
  readonly type: AssetType;
  readonly currency: Currency;
  readonly exchange: string;
  readonly isin?: string;
  readonly cnpj?: string;
  readonly status: AssetStatus;

  private constructor(props: AssetProps) {
    this.id = props.id;
    this.ticker = props.ticker;
    this.name = props.name;
    this.type = props.type;
    this.currency = props.currency;
    this.exchange = props.exchange;
    this.isin = props.isin;
    this.cnpj = props.cnpj;
    this.status = props.status ?? 'ACTIVE';
    Object.freeze(this);
  }

  static create(props: {
    id?: string;
    ticker: string;
    name: string;
    type: AssetType;
    currency: string;
    exchange: string;
    isin?: string;
    cnpj?: string;
    status?: AssetStatus;
  }): Asset {
    if (!props.ticker || props.ticker.trim() === '') {
      throw new InvalidEntityError('Asset ticker cannot be empty');
    }
    if (!props.name || props.name.trim() === '') {
      throw new InvalidEntityError('Asset name cannot be empty');
    }
    if (!props.exchange || props.exchange.trim() === '') {
      throw new InvalidEntityError('Asset exchange cannot be empty');
    }

    const normalizedTicker = props.ticker.trim().toUpperCase();
    const normalizedExchange = props.exchange.trim().toUpperCase();
    const validCurrency = assertValidCurrency(props.currency);

    return new Asset({
      id: createAssetId(props.id),
      ticker: normalizedTicker,
      name: props.name.trim(),
      type: props.type,
      currency: validCurrency,
      exchange: normalizedExchange,
      isin: props.isin?.trim(),
      cnpj: props.cnpj?.trim(),
      status: props.status ?? 'ACTIVE',
    });
  }

  /**
   * Ticker is NOT identity.
   * Identity is determined strictly by AssetId.
   */
  equals(other: Asset): boolean {
    if (!other || !(other instanceof Asset)) {
      return false;
    }
    return this.id === other.id;
  }

  toJSON(): AssetJSON {
    return {
      id: this.id,
      ticker: this.ticker,
      name: this.name,
      type: this.type,
      currency: this.currency,
      exchange: this.exchange,
      ...(this.isin ? { isin: this.isin } : {}),
      ...(this.cnpj ? { cnpj: this.cnpj } : {}),
      status: this.status,
    };
  }
}
