/**
 * Phase 5K — Atlas canonical import template.
 *
 * Maps flexible PT/EN header spellings to canonical fields. Unknown columns
 * are ignored (forward compatibility); missing required columns fail closed.
 */

export const CANONICAL_COLUMNS = [
  'date',
  'ticker',
  'operation',
  'quantity',
  'unit_price',
  'fees',
  'currency',
  'broker',
  'account',
  'external_id',
  'settlement_date',
  'notes',
] as const;
export type CanonicalColumn = (typeof CANONICAL_COLUMNS)[number];

const HEADER_ALIASES: Record<string, CanonicalColumn> = {
  data: 'date',
  date: 'date',
  trade_date: 'date',
  tradedate: 'date',
  datanegocio: 'date',
  data_negocio: 'date',
  ticker: 'ticker',
  ativo: 'ticker',
  codigo: 'ticker',
  código: 'ticker',
  symbol: 'ticker',
  papel: 'ticker',
  operacao: 'operation',
  operação: 'operation',
  operation: 'operation',
  tipo: 'operation',
  side: 'operation',
  compra_venda: 'operation',
  'compra/venda': 'operation',
  quantidade: 'quantity',
  quantity: 'quantity',
  qtd: 'quantity',
  quant: 'quantity',
  preco_unitario: 'unit_price',
  preço_unitário: 'unit_price',
  precounitario: 'unit_price',
  unit_price: 'unit_price',
  unitprice: 'unit_price',
  preco: 'unit_price',
  preço: 'unit_price',
  price: 'unit_price',
  valor_unitario: 'unit_price',
  taxas: 'fees',
  fees: 'fees',
  fee: 'fees',
  corretagem: 'fees',
  custos: 'fees',
  custo: 'fees',
  emolumentos: 'fees',
  moeda: 'currency',
  currency: 'currency',
  corretora: 'broker',
  broker: 'broker',
  brokername: 'broker',
  instituicao: 'broker',
  instituição: 'broker',
  institution: 'broker',
  conta: 'account',
  account: 'account',
  accountname: 'account',
  external_id: 'external_id',
  externalid: 'external_id',
  id_externo: 'external_id',
  idexterno: 'external_id',
  numero_negocio: 'external_id',
  número_negócio: 'external_id',
  liquidacao: 'settlement_date',
  liquidação: 'settlement_date',
  settlement_date: 'settlement_date',
  settlementdate: 'settlement_date',
  dataliquidacao: 'settlement_date',
  observacoes: 'notes',
  observações: 'notes',
  notes: 'notes',
  note: 'notes',
  obs: 'notes',
};

const REQUIRED_COLUMNS: CanonicalColumn[] = ['date', 'ticker', 'operation', 'quantity'];

export interface MappedHeaders {
  mapping: Partial<Record<CanonicalColumn, number>>;
  missing: CanonicalColumn[];
}

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_-]+/g, '');
}

export function mapHeaders(headers: string[]): MappedHeaders {
  const mapping: Partial<Record<CanonicalColumn, number>> = {};
  headers.forEach((header, index) => {
    const canonical = HEADER_ALIASES[normalizeHeader(header)];
    if (canonical && mapping[canonical] === undefined) {
      mapping[canonical] = index;
    }
  });
  const missing = REQUIRED_COLUMNS.filter((col) => mapping[col] === undefined);
  return { mapping, missing };
}

const BUY_SYNONYMS = new Set(['COMPRA', 'C', 'BUY', 'B', 'PURCHASE']);
const SELL_SYNONYMS = new Set(['VENDA', 'V', 'SELL', 'S', 'SALE']);

export type MappedOperation =
  | { kind: 'BUY' }
  | { kind: 'SELL' }
  | { kind: 'DEFERRED'; operation: string }
  | { kind: 'UNKNOWN'; raw: string };

const DEFERRED_SYNONYMS: Record<string, string> = {
  DIVIDENDO: 'DIVIDEND',
  DIVIDENDOS: 'DIVIDEND',
  DIVIDEND: 'DIVIDEND',
  JCP: 'JCP',
  'JUROS SOBRE CAPITAL PRÓPRIO': 'JCP',
  RENDIMENTO: 'FII_INCOME',
  RENDIMENTOS: 'FII_INCOME',
  FII_INCOME: 'FII_INCOME',
  DESDOBRAMENTO: 'SPLIT',
  SPLIT: 'SPLIT',
  GRUPAMENTO: 'REVERSE_SPLIT',
  REVERSE_SPLIT: 'REVERSE_SPLIT',
  BONIFICACAO: 'BONUS',
  BONIFICAÇÃO: 'BONUS',
  BONUS: 'BONUS',
  SUBSCRICAO: 'SUBSCRIPTION',
  SUBSCRIÇÃO: 'SUBSCRIPTION',
  SUBSCRIPTION: 'SUBSCRIPTION',
  AMORTIZACAO: 'AMORTIZATION',
  AMORTIZAÇÃO: 'AMORTIZATION',
  AMORTIZATION: 'AMORTIZATION',
  TRANSFERENCIA: 'TRANSFER_IN',
  TRANSFERÊNCIA: 'TRANSFER_IN',
  TRANSFER_IN: 'TRANSFER_IN',
  APORTE: 'DEPOSIT',
  DEPOSITO: 'DEPOSIT',
  DEPÓSITO: 'DEPOSIT',
  DEPOSIT: 'DEPOSIT',
  RETIRADA: 'WITHDRAWAL',
  RESGATE: 'WITHDRAWAL',
  WITHDRAWAL: 'WITHDRAWAL',
  TAXA: 'FEE',
  FEE: 'FEE',
  IMPOSTO: 'TAX',
  TAX: 'TAX',
  DARF: 'TAX',
  IR: 'TAX',
};

export function mapOperation(raw: string): MappedOperation {
  const normalized = raw
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (BUY_SYNONYMS.has(normalized)) return { kind: 'BUY' };
  if (SELL_SYNONYMS.has(normalized)) return { kind: 'SELL' };
  const deferred = DEFERRED_SYNONYMS[normalized];
  if (deferred) return { kind: 'DEFERRED', operation: deferred };
  return { kind: 'UNKNOWN', raw: raw.trim() };
}
