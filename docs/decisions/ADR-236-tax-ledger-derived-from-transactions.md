# ADR-236: Tax Ledger Derivado de Transações Imutáveis

## Status

Aceito (Fase 4A)

## Contexto

O livro-razão de transações (`Transaction`) é imutável e append-only (ADR global do
projeto). Qualquer tentativa de manter um estado fiscal editável paralelo introduziria
divergência e risco de dupla contagem ou perda de histórico.

## Decisão

1.  **Fonte da Verdade:** O livro-razão imutável de transações é a única fonte da verdade
    fiscal. Um `FiscalEvent` é **derivado**, nunca editável.

2.  **Identidade Estável:** Todo evento fiscal possui identidade determinística derivada
    do id da transação de origem e da versão da projeção
    (`fev:<projectionVersion>:<sourceTransactionId>`).

3.  **Rastreabilidade:** Todo evento carrega `sourceTransactionId` (e `portfolioId`,
    `accountId` quando aplicável), permitindo auditoria completa até a transação canônica.

4.  **Determinismo e Imutabilidade:** A mesma transação de origem com a mesma versão de
    projeção gera sempre o mesmo evento fiscal. Estruturas retornadas são congeladas
    (`Object.freeze`).

5.  **Ordenação Canônica:** A projeção ordena por `(tradeDate ASC, createdAt ASC, id ASC)`,
    garantindo invariância à permutação da entrada.

6.  **Sem Estado Compartilhado:** A projeção é pura: sem I/O, sem persistência, sem estado
    mantido entre chamadas.

## Consequências

- O Tax Ledger nunca se torna uma segunda fonte da verdade.
- Reconstruções históricas são reproduzíveis bit a bit.
- Correções fiscais futuras somente por eventos compensatórios (append), nunca por mutação.
