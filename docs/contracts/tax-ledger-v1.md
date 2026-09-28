# Contrato: Tax Ledger v1 (Fase 4A)

O Tax Ledger é a representação fiscal imutável derivada do livro-razão canônico de
transações. Ele **não** é fonte da verdade e **não** é editável (ADR-236, ADR-241).

## Estratégia

- **Compute-on-Read:** derivado a cada leitura; sem persistência na Fase 4A
  (`migration: NONE`).
- **Rebuildável:** reconstruível integralmente a partir de `(transações, versão de projeção,
versões de regra)`.

## Entrada

- Transações canônicas imutáveis (`Transaction[]`).
- Metadados canônicos de ativos (`AssetType`) para classificação fiscal.
- Resultados realizados canônicos do Portfolio Engine (opcional, para vendas).
- Conjunto de regras versionado (fixtures `TEST_ONLY` na 4A).

## Saída

- `FiscalEvent[]` — projeção determinística (ver `fiscal-event-v1.md`).
- `MonthlyTaxState` — agregado mensal normalizado (ver `monthly-tax-state-v1.md`).

## Invariantes

1. **Fonte da Verdade:** o livro-razão de transações é a única fonte da verdade fiscal.
2. **Sem Duplicação:** uma transação de origem nunca produz eventos fiscais duplicados.
3. **Idempotência:** replay repetido → resultado idêntico.
4. **Invariância de Ordem:** entrada permutada → mesmo resultado após ordenação canônica
   `(tradeDate ASC, createdAt ASC, id ASC)`.
5. **Sem Estado Compartilhado:** funções puras, sem I/O, sem cache, sem rede.
6. **Fingerprint:** opcional; identidade de evento é determinística.

## Fronteiras (arquitetura)

O Tax Engine não depende de Prisma, IA, UI, network ou market intelligence. Depende apenas
de `@atlas/domain`.
