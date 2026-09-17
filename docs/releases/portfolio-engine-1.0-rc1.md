# Portfolio Engine 1.0 Release Candidate (`1.0.0-rc.1`)

**Data de Lançamento:** 17 de Setembro de 2026  
**Status:** Release Candidate — Contratos Congelados  
**Branch de Origem:** `feature/phase-1h-portfolio-engine-rc`

---

## 1. Visão Geral do Release

O **Portfolio Engine 1.0 Release Candidate** consolida o ciclo de desenvolvimento do núcleo determinístico de cálculo patrimonial do Project Atlas. O motor é responsável por recalcular, a partir de um livro-razão imutável (_append-only ledger_), as posições abertas, custos médios ponderados, eventos de renda, ações corporativas, fluxos de caixa e transferências de custódia.

Este marco congela formalmente os contratos da biblioteca `@atlas/portfolio-engine` e dos endpoints da camada de aplicação `Portfolio Read API v1`.

---

## 2. Capacidades Funcionais Consolidadas

1. **Replay Determinístico e Ordenação Canônica**:
   - Algoritmo puro de replay com ordenação cronológica estrita `(tradeDate ASC, createdAt ASC, id ASC)`.
   - Idempotência absoluta comprovada em testes de repetição (1.000 execuções idênticas bit a bit).

2. **Custo Médio Ponderado e Desinvestimento (BUY/SELL)**:
   - Apuração exata de custo médio por ativo em nível de conta e carteira.
   - Apuração de resultado realizado econômico com segregação por moeda.

3. **Ações Corporativas (Corporate Actions)**:
   - Suporte a `SPLIT`, `REVERSE_SPLIT`, `BONUS` (com ou sem custo atribuído) e `AMORTIZATION`.
   - Amortização gera dedução de custo base e evento de retorno de capital (`CAPITAL_RETURN`).

4. **Eventos de Renda (Income Events)**:
   - Classificação estrita de `DIVIDEND`, `JCP` e `FII_INCOME`.
   - Neutralidade em relação à quantidade e custo da posição custodiada.

5. **Transferências de Custódia (Transfers)**:
   - Suporte a transferências pareadas internas (`TRANSFER_OUT` e `TRANSFER_IN` com `transferGroupId`).
   - Preservação do custo de aquisição da conta de origem para a de destino.
   - Degradação elegante para `costBasisStatus = 'INCOMPLETE'` em transferências órfãs/externas sem fabricação de custo zero.

6. **Modelos de Leitura e API HTTP v1**:
   - `GET /api/v1/portfolios/:id/state`: Estado patrimonial consolidado e segregado por conta.
   - `GET /api/v1/portfolios/:id/positions`: Consulta focada em posições ativas (omissão automática de posições zeradas).
   - `GET /api/v1/portfolios/:id/history`: Extrato cronológico unificado paginado via cursor keyset estável.

7. **Blindagem e Resiliência (Hardening)**:
   - Validação de cursores contra adulteração e reutilização entre carteiras distintas (IDOR).
   - Limite de paginação parametrizável entre 1 e 200 (padrão 50).
   - Princípio fail-closed absoluto: transações malformadas no ledger disparam erro atômico mapeado para HTTP 422 `PORTFOLIO.REPLAY_FAILED`.

---

## 3. Garantias de Qualidade e Gates Aprovados

- **Cobertura de Testes**: Mais de 50 suítes unitárias e de integração específicas para o Portfolio Engine e API.
- **Suítes de Hardening Específicas**:
  - `malformed-ledger.test.ts`: Rejeição estrita e atômica de todas as classes de inconsistência de ledger.
  - `portfolio-invariants-property.test.ts`: Testes baseados em propriedades com sementes fixas para conservação de massa financeira e quantidade.
  - `golden-scenarios.test.ts`: Ciclos reais de investidores de 5 anos, múltiplas corretoras, ações corporativas encadeadas e multimoeda.
  - `api-contract-freeze.test.ts`: Verificação do schema, serialização de decimais e OpenAPI.
  - `history-pagination-consistency.test.ts`: Consistência ponta a ponta na iteração paginada e validação de cursores.
  - `portfolio-read-idempotency.test.ts`: 0 mutações no banco durante leituras e isolamento sob 20 requisições simultâneas.
  - `large-ledger-read-model.test.ts`: Boundedness de payload `O(posições)`.
- **Validation Gates**:
  - `pnpm validate:foundation`: 100% PASS
  - `pnpm validate:portfolio-engine-rc`: 100% PASS

---

## 4. Declaração de Maturidade e Próximos Passos

O motor encontra-se na versão `1.0.0-rc.1`, pronto para integração com o MVP da carteira. Ficam mantidas as fronteiras de anti-escopo: Market Data, motores de Performance (TWR/XIRR), Tax Engine (DARF/IRPF) e persistência de posições no banco de dados permanecem para as fases subsequentes do roadmap.
