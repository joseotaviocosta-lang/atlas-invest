# ADR-012: Precisão Numérica Financeira no Banco de Dados (NUMERIC(38,18))

## Status

Aprovado

## Contexto

O Project Atlas suporta múltiplos tipos de ativos (Ações B3, FIIs, ETFs, BDRs, Criptoativos e frações) e operações complexas (grupamentos, desdobramentos com fatores fracionários, amortizações e proventos com 6+ casas decimais). O uso de ponto flutuante binário (`FLOAT`, `DOUBLE PRECISION`) em bancos relacionais introduz erros inaceitáveis de arredondamento.

## Decisão

1. Todas as colunas financeiras (`quantity`, `unit_price`, `amount`, `fees`, `taxes`, `factor`) são armazenadas no PostgreSQL como `DECIMAL(38, 18)` (`NUMERIC(38, 18)`).
   - 38 dígitos de precisão total e 18 casas decimais.
   - Permite representar desde frações microscópicas (satoshis ou frações de desdobramento) até patrimônios na ordem de centenas de bilhões de reais.
2. A biblioteca Prisma mapeia `DECIMAL` para `Prisma.Decimal`.
3. A fronteira entre persistência e domínio adota a **Regra de Ouro da Serialização Decimal por String**:
   - `Prisma.Decimal` é convertido para string canônica via `.toString()`.
   - As primitivas de domínio (`Money`, `Quantity`, `Percentage`) são instanciadas a partir dessas strings via `Money.from(str, currency)` e `Quantity.from(str)`.
   - É **terminantemente proibido** converter `Prisma.Decimal` para `number` ou invocar `toNumber()` / `parseFloat()`.

## Consequências

- **Positivas:**
  - Preservação exata de valores monetários e quantidades fracionárias em round-trips com o banco.
  - Zero risco de divergência por representação IEEE-754.
- **Negativas / Mitigações:**
  - Maior consumo de bytes por linha em relação a inteiros ou floats. Essa decisão prioriza integridade e exatidão contábil sobre economia marginal de storage.
