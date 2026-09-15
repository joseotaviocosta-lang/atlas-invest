# ADR-006: Adoção e Encapsulamento de decimal.js para Precisão Decimal Arbitrária

## Status

Accepted

## Context

Cálculos financeiros em investimentos (operações fracionárias, preços unitários com muitas casas decimais, apuração de proventos, taxas B3 e tributação) não toleram a imprecisão binária do ponto flutuante (`number` do JavaScript baseado em IEEE 754).
É imperativo utilizar uma biblioteca consolidada de precisão arbitrária decimal. Contudo, expor classes de bibliotecas externas (como `Decimal` do `decimal.js`) diretamente pela API pública de todo o monorepo cria alto acoplamento à dependência de terceiros e polui a semântica de domínio.

## Decision

Adotar a biblioteca **`decimal.js`** como engine interna de cálculo decimal arbitrário no pacote `@atlas/domain`, sob a seguinte diretriz de design:

1. **`decimal.js` é estritamente um detalhe de implementação:**
   - Instâncias da classe `Decimal` de `decimal.js` **NUNCA** devem ser expostas na API pública de domínio ou exportadas na raiz de `@atlas/domain`.
2. **Encapsulamento em Primitivas de Domínio:**
   - Todo comportamento numérico decimal é encapsulado nos Value Objects semânticos de domínio:
     - `Money` (valor monetário atrelado a uma `Currency`);
     - `Quantity` (quantidade de ativos em custódia ou negociados);
     - `Percentage` (valores percentuais explícitos).
3. **Entrada e Saída Decimais Canônicas:**
   - Entradas de valores decimais devem ser fornecidas primordialmente como `string` (ex.: `Money.from("10.50", "BRL")`).
   - A serialização JSON de primitivas financeiras deve produzir strings decimais explícitas (ex.: `"10.50"` ou `{"amount": "10.50", "currency": "BRL"}`), nunca números de ponto flutuante.

## Consequences

- **Positivas:**
  - Garantia de precisão matemática arbitrária exata (`0.1 + 0.2 === 0.3`).
  - Isolamento completo: se no futuro for necessário substituir `decimal.js` por outra biblioteca ou implementação nativa (como `BigDecimal` futuro do TC39), nenhuma entidade ou consumidor externo do domínio será impactado.
  - APIs de domínio expressivas e seguras quanto a tipos e unidades.
- **Negativas:**
  - Necessidade de implementar e manter métodos de conveniência nos Value Objects de domínio (`add`, `subtract`, `multiply`, `divide`, etc.).
