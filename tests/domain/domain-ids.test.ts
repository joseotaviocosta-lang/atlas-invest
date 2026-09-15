import { describe, it, expect } from 'vitest';
import {
  createUserId,
  createPortfolioId,
  createAccountId,
  createInstitutionId,
  createAssetId,
  createTransactionId,
  isValidUUID,
  generateUUID,
  InvalidDomainIdError,
} from '../../packages/domain/src/index';

describe('Domain: Domain IDs and UUID Validation', () => {
  const validUUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

  it('should create branded Domain IDs from valid UUIDs', () => {
    const userId = createUserId(validUUID);
    const portfolioId = createPortfolioId(validUUID);
    const accountId = createAccountId(validUUID);
    const institutionId = createInstitutionId(validUUID);
    const assetId = createAssetId(validUUID);
    const txId = createTransactionId(validUUID);

    expect(userId).toBe(validUUID);
    expect(portfolioId).toBe(validUUID);
    expect(accountId).toBe(validUUID);
    expect(institutionId).toBe(validUUID);
    expect(assetId).toBe(validUUID);
    expect(txId).toBe(validUUID);
  });

  it('should generate valid UUID v4 when no ID is provided', () => {
    const id = createUserId();
    expect(isValidUUID(id)).toBe(true);

    const generated = generateUUID();
    expect(isValidUUID(generated)).toBe(true);
  });

  it('should reject invalid UUID strings with InvalidDomainIdError', () => {
    expect(() => createUserId('not-a-uuid')).toThrow(InvalidDomainIdError);
    expect(() => createAssetId('')).toThrow(InvalidDomainIdError);
    expect(() => createPortfolioId('1234-5678')).toThrow(InvalidDomainIdError);
  });

  it('should normalize UUIDs to lowercase', () => {
    const upperUUID = 'A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11';
    const id = createAssetId(upperUUID);
    expect(id).toBe(validUUID);
  });
});
