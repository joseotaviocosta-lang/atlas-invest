# ADR-294: Replay Mensal Fiscal de Ações a partir do Ledger e Eleições Persistidas

## Status

Aceito (Fase 4G.2A.1b.1)

## Contexto

O núcleo puro (4G.2A) e a eleição persistida (4G.2A.1a) estavam verdes, mas a
leitura mensal real ainda não consumia o livro-razão. Era necessário ligar o
ledger ao matcher e ao núcleo, com custo base autoritativo e replay histórico.

## Decisão

1. **Ledger como fonte da verdade**: a leitura mensal mapeia `BUY`/`SELL` do
   ledger para `EquityExecution[]`; posições atuais nunca são fonte.
2. **Identidade de instituição**: o day trade usa `account.institutionId`; contas
   do mesmo intermediário compartilham identidade; intermediários distintos nunca
   casam; instituição ausente bloqueia.
3. **Matcher reutilizado**: `classifyEquityTradesForTax` é a única classificação.
4. **Custo base autoritativo**: legs normais usam a disposição realizada canônica
   rateada por quantidade; day trade usa o leg de compra casado. Custo ausente
   bloqueia (nunca zero).
5. **Replay cronológico**: prejuízos normais e day trade são transportados em
   buckets isolados; eleições são injetadas competência a competência.
6. **Revisão de eleição em M** afeta M e seguintes, nunca M-1.
7. **Fail-closed**: ativo desconhecido, instituição ausente, custo ausente,
   falha do matcher e competência anterior bloqueada produzem `BLOCKED` sem
   isenção afirmada nem prejuízo fabricado.
8. **Puro e read-time**: sem Prisma/network no motor; sem materialização mutável.

## Consequências

- Leitura mensal determinística, auditável e idempotente a partir de dados reais.
- Isolamento normal/day trade e de intermediários preservado.
- IRRF, 6015, mínimo DARF e DARF de ações permanecem fora desta fase.
