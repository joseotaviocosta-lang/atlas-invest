# ADR-087: Historical As-Of UX & Portfolio Time Travel

**Status:** Accepted  
**Date:** 2026-09-19  
**Phase:** Fase 2F — Historical As-Of UX & Portfolio Time Travel  
**Related:** ADR-060, ADR-064, ADR-072, ADR-073, ADR-077, ADR-078

---

## 1. Context

O Portfolio Engine 1.0-rc.1 e a Portfolio Read API v1 já suportam reconstrução histórica por `asOf` (corte inclusivo `tradeDate <= asOf`, ordenação canônica, validação civil via `LocalDate`). A interface precisa expor essa capacidade para que o investidor responda "como estava minha carteira em uma data passada?" sem jamais confundir um snapshot reconstruído com o estado atual.

## 2. Decision

### 2.1. Historical Mode Is a Server-Replay Projection

- Com `asOf`, as telas pedem `GET /state?asOf=YYYY-MM-DD` (e leem `asOfDate` do read model) e apresentam o resultado com os mesmos mappers do modo atual. Sem `asOf`, o comportamento atual permanece idêntico.
- Data anterior à primeira transação retorna estado vazio com sucesso ("Nenhuma posição nesta data"), nunca erro.
- Falha de replay (`PORTFOLIO.REPLAY_FAILED`) renderiza "Não foi possível reconstruir a carteira nesta data.", sem vazar detalhes internos.

### 2.2. Current vs Historical Must Be Unmistakable

- Banner persistente "Visualizando carteira em DD/MM/YYYY" + badge "Histórico" + ação "Voltar para hoje" em overview, asset detail e account detail.
- Seções de agregados lifetime (realized/income no asset detail) ficam ocultas no modo histórico para não misturar totais do ciclo de vida com posições do snapshot. O feed de eventos (audit trail) permanece.

### 2.3. Navigation Preserves Temporal Context

- Links overview → asset/account e voltas carregam `asOf`; trocar de carteira limpa `asOf`.
- Regras de navegação segura (ADR-078) aplicam-se ao estado histórico, não ao atual: um ativo fechado hoje mas aberto então continua navegável no snapshot, e um ativo ausente então mostra "Este ativo não fazia parte da carteira nesta data."
- Conta do diretório sem posição histórica mostra "Esta conta não possuía posições abertas nesta data." — sem afirmar lifecycle histórico da entidade Account.

### 2.4. Terminology

- "Custo total em DD/MM/YYYY" (do servidor) é aceitável. Proibidos: "Valor da carteira", "Patrimônio", "Valor de mercado", e qualquer comparação automática hoje × passado (sem performance/change analysis).

## 3. Consequences

### 3.1. Para Testes

Cobertura em `portfolio-temporal-context-view-model`, `portfolio-asof` (web/mobile), guard arquitetural anti-replay e E2E `historical-asof` (seletor, banner, voltar-hoje, deep-links).

### 3.2. Para o Portfolio Engine

Nenhuma alteração. O contrato do Portfolio Engine 1.0.0-rc.1 permanece congelado.

### 3.3. Para o Portfolio Read API v1

Nenhuma alteração. Os contratos congelados permanecem válidos.

## 4. References

- ADR-060 (Historical Replay Contract)
- ADR-064 (Historical asOf API Semantics)
- ADR-072 (Portfolio MVP Current-State UX)
- ADR-073 (Client View Model Boundary)
- ADR-077 (Zero Client Financial Math)
- ADR-078 (History/Activity UX & Navigation Safety)
- Portfolio Read API v1 Contract Freeze
