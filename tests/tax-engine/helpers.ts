import { TransactionFactory, type Transaction } from '@atlas/domain';

export const PF = '11111111-1111-4111-8111-111111111111';
export const ACC = '22222222-2222-4222-8222-222222222222';
export const PETR = '33333333-3333-4333-8333-333333333333';
export const VALE = '44444444-4444-4444-8444-444444444444';

/**
 * Deterministic valid UUID (v4-shaped) derived from a label. Keeps tests
 * deterministic without depending on random id generation.
 */
export function uuidFor(label: string): string {
  const parts: number[] = [];
  for (let k = 0; k < 4; k++) {
    let h = (2166136261 ^ (k * 2654435761)) >>> 0;
    for (let i = 0; i < label.length; i++) {
      h ^= label.charCodeAt(i) + k;
      h = Math.imul(h, 16777619) >>> 0;
    }
    parts.push(h >>> 0);
  }
  const hex = parts
    .map((n) => n.toString(16).padStart(8, '0'))
    .join('')
    .split('');
  hex[12] = '4';
  hex[16] = '8';
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

export function buy(
  id: string,
  date = '2026-09-10',
  qty = '10',
  price = '25.00',
  currency = 'BRL',
  assetId = PETR,
): Transaction {
  return TransactionFactory.createBuy({
    id: uuidFor(id),
    portfolioId: PF,
    accountId: ACC,
    assetId,
    quantity: qty,
    unitPrice: price,
    currency,
    tradeDate: date,
  });
}

export function sell(
  id: string,
  date = '2026-09-20',
  qty = '10',
  price = '30.00',
  currency = 'BRL',
  assetId = PETR,
  fees?: string,
  taxes?: string,
): Transaction {
  return TransactionFactory.createSell({
    id: uuidFor(id),
    portfolioId: PF,
    accountId: ACC,
    assetId,
    quantity: qty,
    unitPrice: price,
    currency,
    tradeDate: date,
    ...(fees !== undefined ? { fees } : {}),
    ...(taxes !== undefined ? { taxes } : {}),
  });
}

export function income(
  type: 'DIVIDEND' | 'JCP' | 'FII_INCOME',
  id: string,
  date = '2026-09-15',
  amount = '100.00',
  currency = 'BRL',
  assetId = PETR,
): Transaction {
  return TransactionFactory.createIncome({
    id: uuidFor(id),
    portfolioId: PF,
    accountId: ACC,
    assetId,
    type,
    amount,
    currency,
    tradeDate: date,
  });
}

export function split(
  type: 'SPLIT' | 'REVERSE_SPLIT',
  id: string,
  factor = '2',
  date = '2026-09-05',
  assetId = PETR,
): Transaction {
  return TransactionFactory.createSplit({
    id: uuidFor(id),
    portfolioId: PF,
    accountId: ACC,
    assetId,
    type,
    factor,
    currency: 'BRL',
    tradeDate: date,
  });
}

export function bonus(
  id: string,
  qty = '1',
  date = '2026-09-06',
  assignedCost?: string,
  assetId = PETR,
): Transaction {
  return TransactionFactory.createBonus({
    id: uuidFor(id),
    portfolioId: PF,
    accountId: ACC,
    assetId,
    quantity: qty,
    currency: 'BRL',
    tradeDate: date,
    ...(assignedCost !== undefined ? { assignedCost } : {}),
  });
}

export function subscription(
  id: string,
  qty = '5',
  price = '10.00',
  date = '2026-09-07',
  assetId = PETR,
): Transaction {
  return TransactionFactory.createSubscription({
    id: uuidFor(id),
    portfolioId: PF,
    accountId: ACC,
    assetId,
    quantity: qty,
    unitPrice: price,
    currency: 'BRL',
    tradeDate: date,
  });
}

export function amortization(
  id: string,
  amount = '5.00',
  date = '2026-09-08',
  assetId = PETR,
): Transaction {
  return TransactionFactory.createAmortization({
    id: uuidFor(id),
    portfolioId: PF,
    accountId: ACC,
    assetId,
    amount,
    currency: 'BRL',
    tradeDate: date,
  });
}

export function transfer(
  type: 'TRANSFER_IN' | 'TRANSFER_OUT',
  id: string,
  qty = '10',
  date = '2026-09-09',
  transferGroupId?: string,
  assetId = PETR,
): Transaction {
  return TransactionFactory.createTransfer({
    id: uuidFor(id),
    portfolioId: PF,
    accountId: ACC,
    assetId,
    type,
    quantity: qty,
    currency: 'BRL',
    tradeDate: date,
    ...(transferGroupId !== undefined ? { transferGroupId } : {}),
  });
}

export function cashMovement(
  type: 'DEPOSIT' | 'WITHDRAWAL',
  id: string,
  amount = '1000.00',
  date = '2026-09-01',
): Transaction {
  return TransactionFactory.createCashMovement({
    id: uuidFor(id),
    portfolioId: PF,
    accountId: ACC,
    type,
    amount,
    currency: 'BRL',
    tradeDate: date,
  });
}

export function expense(
  type: 'FEE' | 'TAX',
  id: string,
  amount = '5.00',
  date = '2026-09-11',
  assetId?: string,
): Transaction {
  return TransactionFactory.createExpense({
    id: uuidFor(id),
    portfolioId: PF,
    accountId: ACC,
    type,
    amount,
    currency: 'BRL',
    tradeDate: date,
    ...(assetId !== undefined ? { assetId } : {}),
  });
}

export function conversion(
  id: string,
  qty = '200',
  targetQty = '200',
  ratio = '1',
  date = '2026-09-17',
  assetId = PETR,
  targetAssetId = VALE,
): Transaction {
  return TransactionFactory.createReceiptConversion({
    id: uuidFor(id),
    portfolioId: PF,
    accountId: ACC,
    assetId,
    targetAssetId,
    quantity: qty,
    targetQuantity: targetQty,
    conversionRatio: ratio,
    conversionType: 'SUBSCRIPTION_RECEIPT',
    currency: 'BRL',
    tradeDate: date,
  });
}

export function allSeventeenTypes(prefix: string): Transaction[] {
  return [
    buy(`${prefix}-buy`, '2026-09-01'),
    sell(`${prefix}-sell`, '2026-09-02'),
    income('DIVIDEND', `${prefix}-div`, '2026-09-03'),
    income('JCP', `${prefix}-jcp`, '2026-09-04'),
    income('FII_INCOME', `${prefix}-fii`, '2026-09-05'),
    bonus(`${prefix}-bonus`, '1', '2026-09-06'),
    split('SPLIT', `${prefix}-split`, '2', '2026-09-07'),
    split('REVERSE_SPLIT', `${prefix}-rsplit`, '0.5', '2026-09-08'),
    subscription(`${prefix}-sub`, '5', '10', '2026-09-09'),
    amortization(`${prefix}-amort`, '5', '2026-09-10'),
    transfer('TRANSFER_IN', `${prefix}-tin`, '10', '2026-09-11'),
    transfer('TRANSFER_OUT', `${prefix}-tout`, '10', '2026-09-12'),
    cashMovement('DEPOSIT', `${prefix}-dep`, '1000', '2026-09-13'),
    cashMovement('WITHDRAWAL', `${prefix}-wd`, '100', '2026-09-14'),
    expense('FEE', `${prefix}-fee`, '5', '2026-09-15'),
    expense('TAX', `${prefix}-tax`, '7', '2026-09-16'),
    conversion(`${prefix}-conv`),
  ];
}
