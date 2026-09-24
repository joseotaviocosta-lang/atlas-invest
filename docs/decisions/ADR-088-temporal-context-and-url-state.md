# ADR-088: Temporal Context, URL State & LocalDate Semantics

**Status:** Accepted  
**Date:** 2026-09-19  
**Phase:** Fase 2F — Historical As-Of UX & Portfolio Time Travel  
**Related:** ADR-008, ADR-064, ADR-087

---

## 1. Context

O modo histórico precisa sobreviver a refresh, deep link e back/forward sem ambiguidade de datas, e sem que conversões de timezone desloquem o dia econômico.

## 2. Decision

### 2.1. URL/Route State

- Web: `asOf` vive na query string (`/portfolio?asOf=YYYY-MM-DD`); trocar a data navega (`router.replace`), de modo que back/forward percorre datas anteriores.
- Mobile: `asOf` viaja em route/search params (`useLocalSearchParams`, `router.setParams`); voltar mantém o comportamento natural.
- Voltar para hoje remove o parâmetro (cleanup), nunca envia `?asOf=<today>`.
- `asOf` inválido ou futuro na URL não quebra: renderiza erro de data com saída para hoje.

### 2.2. LocalDate Semantics

- `asOf` trafega e é validado como string civil `YYYY-MM-DD` (regex estrita + tabela de meses + bissexto), sem `new Date(asOf)`.
- "Hoje" é lido dos campos civis locais (`getFullYear/getMonth/getDate`); `asOf === hoje` normaliza para modo atual.
- `asOf` futuro é recusado na UI ("Escolha uma data de hoje ou anterior."); o servidor, por contrato, acumularia até o estado atual.
- Exibição em `DD/MM/YYYY` é split de string, nunca construção de `Date`.

### 2.3. Cache Isolation

- Chaves incluem o corte: `['portfolio-state', portfolioId, asOf ?? 'current']` (e variantes por ativo/conta). Current e histórico nunca compartilham entries; trocar de data sempre busca o snapshot (sem misturar dados atuais sob banner histórico).

## 3. Consequences

### 3.1. Para Testes

`portfolio-temporal-context-view-model` cobre inválidas, bissexto, normalização de hoje, futuro, formatação e chaves; E2E cobre deep link, seletor e voltar-hoje.

### 3.2. Para o Portfolio Engine

Nenhuma alteração. O contrato do Portfolio Engine 1.0.0-rc.1 permanece congelado.

### 3.3. Para o Portfolio Read API v1

Nenhuma alteração. Os contratos congelados permanecem válidos.

## 4. References

- ADR-008 (Economic Dates)
- ADR-064 (Historical asOf API Semantics)
- ADR-087 (Historical As-Of UX)
