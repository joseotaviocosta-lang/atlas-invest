# Contract: `annual-period-position-v1`

Fase 4H.2 — Invariantes de Modelo Temporal, Posições Anuais em 31/12 e Posição de Abertura Pré-Atlas.

## 1. Princípio de Projeção Determinística de Replay

```
Ledger de Transações Imutável + Posições Iniciais Confirmadas
  → PortfolioReplayEngine.replay(transactions, portfolioId, { asOfDate: YYYY-12-31 })
  → Derived Year-End Positions (31/12)
  → Annual Position Report (Bens e Direitos)
```

O relatório anual de posições:

- É uma projeção determinística derivada do motor de replay canônico (`@atlas/portfolio-engine`);
- **NÃO** duplica a lógica de apuração de custo médio ou saldo de custódia;
- Executa corte exato em 31 de dezembro do ano-calendário (`asOfDate = YYYY-12-31`).

## 2. Modelo Temporal Estrito

1. `CalendarYear` (ano-calendário) representa o ano civil dos fatos econômicos (`1900 <= year <= 2100`).
2. `DeclarationExercise` (exercício) representa o ano de entrega da declaração (`1900 <= exercise <= 2100`).
3. Invariante legal: `DeclarationExercise = CalendarYear + 1`.
4. `CalendarYear` e `DeclarationExercise` são tipos nominais distintos; nenhuma regra resolve por "ano atual".
5. Datas econômicas utilizam estritamente `LocalDate` no formato civil `YYYY-MM-DD`.

## 3. Regra de Custo Histórico de Aquisição (Bens e Direitos)

1. **PROIBIDO** utilizar cotação, valor de mercado, mark-to-market ou valuation como valor da declaração anual de Bens e Direitos.
2. O valor patrimonial em 31/12 reflete invariavelmente o **custo histórico de aquisição** (`totalHistoricalCost`) derivado do livro-razão e eventos societários.
3. Se o custo de aquisição for desconhecido (`costBasisStatus = INCOMPLETE`), o sistema:
   - Emite `totalHistoricalCost = null` e `averageHistoricalCost = null`;
   - Atribui `costBasisStatus = INCOMPLETE` e `completenessStatus = BLOCKED`;
   - **NUNCA** serializa custo desconhecido como `"0"` ou `R$ 0,00`.

## 4. Posição Zero e Custódia Positiva

1. Apenas ativos com custódia econômica estritamente positiva (`quantity > 0`) em 31/12 constam no array `positions`.
2. Ativos cuja posição foi totalmente encerrada (`quantity.isZero()`) em data anterior ou em 31/12 são omitidos da listagem de bens finais.

## 5. Posição Inicial de Abertura Pré-Atlas (`AnnualOpeningPositionInput`)

1. Representa custódia e custo de aquisição estabelecidos antes do início do histórico transacional no Atlas.
2. Identidade lógica: `(taxSubjectId, portfolioId, accountId, assetId, revision)`.
3. Histórico imutável: revisões subsequentes incrementam `revision` de forma monotônica e marcam a versão anterior como `SUPERSEDED`.
4. Idempotência por Fingerprint: submissões idênticas (`fingerprint` idêntico via SHA-256) retornam `IDEMPOTENT_CONFIRMED` sem gerar nova revisão.
5. Invariante Anti-Sobreposição (`OVERLAPPING_OPENING_AND_LEDGER_HISTORY`): se existirem transações no livro-razão com `tradeDate <= effectiveDate` para o mesmo ativo, a aplicação da posição de abertura é bloqueada e o ativo é marcado como `BLOCKED`.
6. Posições `DRAFT` não-confirmadas geram o status `REQUIRES_CONFIRMATION` (`UNCONFIRMED_OPENING_POSITION`).

## 6. Identidade e Segurança

1. Identidade de ativo é estritamente `AssetId`; o ticker é atributo meramente visual.
2. Sujeito passivo (`taxSubjectId`) deriva invariavelmente do principal autenticado.
3. Anti-enumeração: tentativas de consulta ou gravação em carteiras/contas de terceiros retornam `404 Not Found` invariavelmente.
