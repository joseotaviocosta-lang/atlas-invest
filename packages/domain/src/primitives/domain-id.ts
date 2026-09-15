import { InvalidDomainIdError } from '../errors/domain-error';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUUID(id: string): boolean {
  return typeof id === 'string' && UUID_V4_REGEX.test(id.trim());
}

export function assertValidUUID(id: string, entityName = 'DomainId'): string {
  if (!isValidUUID(id)) {
    throw new InvalidDomainIdError(`Invalid ${entityName} UUID format: '${id}'`);
  }
  return id.trim().toLowerCase();
}

/**
 * Universal UUID generator compatible across Node.js, Web, and React Native.
 */
export function generateUUID(): string {
  if (
    typeof globalThis !== 'undefined' &&
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID();
  }

  // Fallback RFC4122 v4 generator without native crypto dependency
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

declare const brand: unique symbol;

export type Branded<T, BrandTag extends string> = T & { readonly [brand]: BrandTag };

export type UserId = Branded<string, 'UserId'>;
export type PortfolioId = Branded<string, 'PortfolioId'>;
export type AccountId = Branded<string, 'AccountId'>;
export type InstitutionId = Branded<string, 'InstitutionId'>;
export type AssetId = Branded<string, 'AssetId'>;
export type TransactionId = Branded<string, 'TransactionId'>;

export function createUserId(id?: string): UserId {
  return assertValidUUID(id ?? generateUUID(), 'UserId') as UserId;
}

export function createPortfolioId(id?: string): PortfolioId {
  return assertValidUUID(id ?? generateUUID(), 'PortfolioId') as PortfolioId;
}

export function createAccountId(id?: string): AccountId {
  return assertValidUUID(id ?? generateUUID(), 'AccountId') as AccountId;
}

export function createInstitutionId(id?: string): InstitutionId {
  return assertValidUUID(id ?? generateUUID(), 'InstitutionId') as InstitutionId;
}

export function createAssetId(id?: string): AssetId {
  return assertValidUUID(id ?? generateUUID(), 'AssetId') as AssetId;
}

export function createTransactionId(id?: string): TransactionId {
  return assertValidUUID(id ?? generateUUID(), 'TransactionId') as TransactionId;
}
