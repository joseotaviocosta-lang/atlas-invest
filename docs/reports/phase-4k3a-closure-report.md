# PROJECT ATLAS — RELATÓRIO DE FECHAMENTO FORMAL DEFINITIVO

## FASE 4K.3A: DISMISS / SOURCE-CHANGE CONCURRENCY & DEFINITIVE CLOSURE

**Data:** 12 de Outubro de 2026
**Base:** b98454b237a622b507fe7bc94eddd00feb57d451
**Branch:** feature/phase-4k3a-dismiss-source-change-concurrency-closure
**Escopo:** um único blocker de concorrência (DISMISS(A) || SOURCE_CHANGE(A→B)); sem mudança de produção
**Banco de Dados:** PostgreSQL 16.x (Porta 5433, Database `atlas_test`, 22 Migrations, 0 Pending, 0 Drift)

---

## 1. Git e Ancestralidade

- HEAD na abertura: `b98454b237a622b507fe7bc94eddd00feb57d451` (worktree clean)
- Ancestralidade confirmada (exit 0) para `b98454b`, `8936729`, `e920c67`, `465e9d9`
- Mudanças da fase: `tests/fiscal-api/tax-compliance-reminders-concurrency.test.ts` (cenários 7–8) + este relatório

---

## 2. Concorrência Dedicada — DISMISS(A) || SOURCE_CHANGE(A→B)

Suíte: `tests/fiscal-api/tax-compliance-reminders-concurrency.test.ts`, Scenario 7.

- Fonte inicial: `fp-dismiss-race-A` (obrigação 2026-03, DARF 6015, vencimento 2026-04-30, relógio fixo 2026-04-20)
- Task 1: `POST .../reminders/:key/actions` (DISMISS do `UPCOMING_DUE:2026-04-23`)
- Task 2: `updateMany` do ledger fiscal A→B (`fp-dismiss-race-B`, 600.00) com stagger 0/25ms alternado
- Task 3 (1 a cada 5 runs): `GET reminders` mid-race (snapshot coerente)
- Overlap genuíno: o POST atravessa guard + validação + lookup de projeção enquanto o update commita mid-flight
- 100 iterações, 1 usuário/obrigação isolados por iteração (sem contaminação cruzada)

Semântica de assentamento (por construção, ambas as ordens convergem):

- lookup vê A vivo → 201: dismissal A registrado; após o commit sobrevive só como shell `SUPERSEDED`
- lookup vê B vivo sob a mesma chave (a chave exclui o fingerprint) → 201 como histórico; a projeção o arquiva como shell imediatamente; B segue acionável
- 404 só quando não há instância viva para a chave (provado deterministicamente no Scenario 8)

| Gate                        | Resultado                                   |
| :-------------------------- | :------------------------------------------ |
| runs                        | 100                                         |
| failures                    | 0                                           |
| old dismissal preserved     | YES (shell `SUPERSEDED` com fingerprint A)  |
| old dismissal reused on B   | NO (instâncias B com `actedAt: null`)       |
| old reminder superseded     | YES                                         |
| new reminder actionable     | YES (`SCHEDULED`, 3 UPCOMING_DUE em B)      |
| new reminder suppressed     | NO                                          |
| history corruption          | NO                                          |
| duplicate semantic reminder | NO (`dedupKey` único em todas as projeções) |
| mixed fingerprint state     | NO                                          |
| deterministic final state   | YES                                         |

Nota de investigação: a primeira versão do teste falhou com `429 Too Many Requests` (throttle global produtivo de 100 req/60s) — comportamento correto da produção, não defeito. O teste foi ritmado (~1s/iteração, mid-read a cada 5ª) para respeitar o guard sem mascarar a race. Nenhum código de produção foi alterado.

Mecanismos que garantem a correção (sem vagueza):

- unicidade `(taxSubjectId, reminderKey, revision)` + retry monotônico no repositório (barreira de concorrência na escrita);
- reconciliação por `sourceFingerprint` no motor puro (ação com fingerprint divergente nunca suprime a linhagem atual; gera shell auditável);
- liveness fail-closed no use-case (chave sem instância viva → 404, sem inventar entrega);
- idempotência de entrega por `(taxSubjectId, dedupKey)`.

---

## 3. Matriz de Concorrência (reconfirmação)

| Cenário                                              | Resultado |
| :--------------------------------------------------- | :-------- |
| C1 duplicate delivery (10 idênticas → 1 evento)      | PASS      |
| C2 acknowledge + source change (rev 1,2 monotônicas) | PASS      |
| C3 snooze + delivery (sem duplicata, SNOOZED final)  | PASS      |
| C4 dismiss + source change (ordenado/async)          | PASS      |
| C5 preferences + scheduler (sem estado misto)        | PASS      |
| C6 read + rebuild (snapshot coerente)                | PASS      |
| C7 dedicated dismiss race 100 runs (novo, 4K.3A)     | PASS      |
| C8 stale dismiss fail-closed 404 (novo, 4K.3A)       | PASS      |

---

## 4. Propriedades e Fuzz

- `tax-compliance-reminder-properties.test.ts`: 9/9 **PASS** (re-executado; arquivo inalterado)
- `tax-compliance-reminder-fuzz.test.ts`: 20.000 casos / 0 falhas **PASS** (re-executado; sem mudança de produção)

---

## 5. Banco de Dados (sem mudança de schema)

- Migration count: 22; migration 22 unchanged: **YES** (`git diff` vazio em `prisma/migrations` + `schema.prisma`)
- `schema.prisma` changed: **NO**; pending: **NO**; drift: **NO**; `db push`: **NO**; migração histórica editada: **NO**

---

## 6. Regressões

- 4K.3 focada: concurrency (8/8, incl. C7–C8) + properties (9/9) + fuzz (20k/0) — **PASS**; E2E 45/45 carry-forward (arquivo inalterado)
- 4G/4H/4I/4J/4K.1/4K.2: **PASS** por carry-forward explícito (zero arquivos-fonte alterados fora de testes/docs; `git diff --stat` comprova)
- semantic drift: **NO**

---

## 7. Plataforma (mínimo 4K.3A)

| Comando                  | Resultado                                                      |
| :----------------------- | :------------------------------------------------------------- |
| `pnpm test:fiscal-api`   | 62 arquivos / 537 testes — **PASS** (incl. C7 race 100/0 + C8) |
| `pnpm test:tax-engine`   | 70 arquivos / 761 testes — **PASS**                            |
| `pnpm test:database`     | 28 arquivos / 148 testes — **PASS**                            |
| `pnpm test:architecture` | 26 arquivos / 218 testes — **PASS**                            |
| `pnpm test:security`     | 14 arquivos / 55 testes — **PASS**                             |
| `pnpm typecheck`         | 21/21 tasks — **PASS**                                         |
| `pnpm lint`              | 0 erros, 0 warnings — **PASS**                                 |
| `pnpm format:check`      | 100% — **PASS**                                                |

Root/governance (`pnpm test`, `build`, `web:e2e`, validators): carry-forward dos resultados 4K.3 já verdes (somente arquivos de teste/relatório mudaram nesta fase).

---

## 8. Contratos

- `tax-compliance-reminders-v1`: **MATCH** (semântica de identidade, dedup, source-change e entrega inalteradas)
- `ADR-287`: **MATCH**
- `AGENTS.md` Seção 84: **MATCH** (arquivo intocado nesta fase)

---

## 9. Auditoria de Produção

Arquivos de produção alterados: **NO**. Mudanças: 1 arquivo de teste (cenários 7–8 + pacing documentado) + este relatório.

---

## 10. Bloco Canônico de Aprovação

```text
DISMISS_SOURCE_CHANGE_CONCURRENCY: READY
CONCURRENCY: READY
REGRESSIONS: READY
PLATFORM: READY
CONTRACTS: READY
REAL_4K3A_BLOCKERS: none

PHASE 4K.3A: APROVADA
PHASE 4K.3: APROVADA DEFINITIVAMENTE
PHASE 4K: NÃO APROVADA
```

Sem avanço a 4K.4. Sem Sicalc, pagamentos, bancos, DIRPF, Receita ou Tax AI.
