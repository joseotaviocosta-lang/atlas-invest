# ADR-303: Projeção de Posições Anuais de Bens e Direitos via Replay do Portfolio Engine

## Contexto

A Receita Federal exige na Declaração de Ajuste Anual (DIRPF) a discriminação dos bens e direitos em 31/12 pelo seu custo histórico de aquisição. O Project Atlas já possui um motor determinístico puro e auditado (`PortfolioReplayEngine`) que realiza o replay do histórico de transações e eventos corporativos até qualquer data arbitrária (`asOfDate`).

## Decisão

1. O relatório anual de posições (`buildAnnualPositionReport`) projeta o estado de custódia e custo de aquisição exclusivamente executando `PortfolioReplayEngine.replay(transactions, portfolioId, { asOfDate: YYYY-12-31 })`.
2. É terminantemente proibido duplicar a lógica de cálculo de preço médio ou custo histórico no módulo fiscal.
3. É terminantemente proibido utilizar cotação, valor de mercado ou mark-to-market na declaração de Bens e Direitos.
4. Quando o custo histórico for incompleto (`costBasisStatus = INCOMPLETE`), o valor retornado é `null` (nunca `"0"` ou `R$ 0,00`) e a posição é marcada como `BLOCKED` com a razão `UNKNOWN_COST_BASIS`.
5. Posições com quantidade zerada (`quantity.isZero()`) em 31/12 são estritamente omitidas da listagem de bens em custódia.

## Consequências

- Positivas: Determinismo matemático absoluto (1.000x idêntico), zero duplicação de regras contábeis/societárias, conformidade rigorosa com a legislação da Receita Federal.
- Negativas: Nenhuma.
