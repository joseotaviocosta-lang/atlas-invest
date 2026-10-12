# PROJECT ATLAS — RELATÓRIO DE FECHAMENTO FORMAL DEFINITIVO

## FASE 4K.3: TAX COMPLIANCE REMINDERS & DEADLINE NOTIFICATION ORCHESTRATION FOUNDATION

**Data:** 11 de Outubro de 2026
**Base:** 8936729f522556b45d8a50ba754e98f96d77a5b3
**Branch:** feature/phase-4k3-compliance-reminder-notification-foundation
**Banco de Dados:** PostgreSQL 16.x (Porta 5433, Database `atlas_test`, 22 Migrations, 0 Pending, 0 Drift)

---

## 1. Git e Ancestralidade

- HEAD na abertura: `8936729f522556b45d8a50ba754e98f96d77a5b3` (worktree clean)
- Ancestralidade confirmada (exit 0) para `8936729`, `e920c67`, `465e9d9`
- Baseline: árvore idêntica à 4K.2D aprovada (todas as suítes verdes) + smoke `tax-payment-support-properties` 11/11

---

## 2. Arquitetura (sem novo motor fiscal)

| Gate                         | Evidência                                                                      | Resultado |
| :--------------------------- | :----------------------------------------------------------------------------- | :-------- |
| new tax engine               | nenhum; `reminder-engine.ts` é projeção pura sobre 4K.1/4K.2                   | **NO**    |
| tax recomputation            | `projectTaxComplianceReminders` consome obrigações + hints; zero Money/Decimal | **NO**    |
| legal due-date recomputation | apenas `reminderAt = dueDate − leadTime` (aritmética civil inteira UTC)        | **NO**    |
| penalty/interest/SELIC       | OVERDUE declara "O Atlas não calcula multa, juros ou SELIC" (E2E S13)          | **NO**    |
| payment execution            | sem provedor bancário/PIX/boleto; entrega é `IN_APP` registrada pelo cliente   | **NO**    |
| government integration       | sem Sicalc/gov.br/e-CAC/Receita; `USER_REPORTED` estrito                       | **NO**    |

Fluxo canônico: `Transactions → Portfolio → Fiscal → 4K.1 Compliance → 4K.2 Payment Support → 4K.3 Reminder Projection → In-app Delivery`. 4K.3 nunca é fonte de verdade fiscal.

---

## 3. Domínio de Lembretes

- Lembrete derivado: `TaxComplianceReminder` (`packages/tax-engine/src/compliance/reminder-types.ts`, `reminder-engine.ts`), `sourceVersion: '4K.3'`, `Object.freeze` profundo
- Chave semântica: `reminderKey = obligationKey:kind:triggerAt`; `dedupKey = reminderKey:sourceFingerprint`; sem UUID de negócio
- Kinds (8, todos exercitados): `UPCOMING_DUE`, `DUE_TODAY`, `OVERDUE`, `ACTION_REQUIRED`, `EVIDENCE_REQUIRED`, `PAYMENT_EVIDENCE_REVIEW`, `STALE_SOURCE`, `ANNUAL_REVIEW_REQUIRED`
- Estados: `PENDING` (reservado), `SCHEDULED`, `DELIVERED`, `ACKNOWLEDGED`, `SNOOZED`, `DISMISSED`, `SUPERSEDED`, `CANCELLED`
- Fingerprint-bound: toda instância carrega `sourceFingerprint`; ação com fingerprint divergente é ignorada para a fonte atual
- Política default (UX, não lei): lead times `[7, 3, 1]`, instância `OVERDUE` única em `dueDate + 1`, `DUE_TODAY` em `dueDate`
- Relógio injetado (`FISCAL_CLOCK`, civil `YYYY-MM-DD`); nenhum `Date.now()` na lógica pura; datas civis via componentes UTC (imune a timezone)

---

## 4. Ações do Usuário

| Ação        | E2E     | Semântica                                                                                                                            |
| :---------- | :------ | :----------------------------------------------------------------------------------------------------------------------------------- |
| ACKNOWLEDGE | S8, S43 | "viu"; nunca pago/entregue/resolvido/aceito (S8: siblings seguem acionáveis)                                                         |
| SNOOZE      | S9, S45 | exige `snoozedUntil` futuro ≤365 dias (S39 rejeita passado); expiração reexpõe como `DELIVERED`; nunca toca dueDate/status/pagamento |
| DISMISS     | S10     | oculta a instância; nunca resolve a obrigação                                                                                        |

---

## 5. Mudança de Fonte

- Instância antiga vira shell `SUPERSEDED` (`isStale: true`, histórico preservado); instância nova acionável é gerada (S18, S19, S23)
- Ack/dismissal antigos nunca reutilizados através de fingerprint alterado (S19, S23; propriedade P5; concorrência S3)
- Evidência `MATCH` não gera cobrança pendente (S20, propriedade P9); `MISMATCH` gera `PAYMENT_EVIDENCE_REVIEW` (S21); fonte alterada pós-evidência gera `STALE_SOURCE` (S22)

---

## 6. Preferências

- `tax_compliance_reminder_preferences`: 1 linha por sujeito (upsert), defaults seguros não-spam (tudo habilitado, `[7, 3, 1]` canonizado `[1, 3, 7]` na leitura)
- Habilitadores + `leadTimes` 1..30 (máx 5, sanitizados e ordenados no motor); inválidos → 400 (S32)
- Desligar categoria cancela deterministicamente sem apagar histórico (S7, S25, S30); propriedade P7
- Escopo por principal; sujeitos nunca compartilham linhas (S33)

---

## 7. Entrega

- Canais: `IN_APP`, `MOBILE_IN_APP` (somente in-app; sem PUSH/EMAIL/SMS/WhatsApp)
- `tax_compliance_notification_events` com unicidade `(taxSubjectId, dedupKey)`; retry retorna o evento canônico (S43, concorrência S1: 10 simultâneas → 1 evento)
- Entrega contra fingerprint obsoleto é rejeitada (404), nunca inventada (S44)
- Histórico por lembrete em `GET .../reminders/:key/deliveries` (S43, `no-store`)
- Falha de entrega nunca altera compliance (camada separada, sem escrita no ledger)

---

## 8. Web

`apps/web/src/components/fiscal/TaxComplianceRemindersSection.tsx` integrada à página fiscal após `ComplianceTimelineSection`.

| Item                                           | Resultado                                                                         |
| :--------------------------------------------- | :-------------------------------------------------------------------------------- |
| upcoming                                       | **PASS** (grupos + triggers formatados verbatim)                                  |
| overdue                                        | **PASS** (sem cálculo de penalidade)                                              |
| stale                                          | **PASS** (mensagem canônica de dados alterados)                                   |
| acknowledge / snooze / dismiss                 | **PASS** (payload exato; snooze com data rotulada; dismiss adverte não-resolução) |
| history                                        | **PASS** (eventos de entrega + re-registro)                                       |
| responsive / accessibility                     | **PASS** (alvos 44px, aria-labels, status texto+cor, skeleton/empty/error-retry)  |
| client tax math / deadline math / penalty math | **NO** (grep: só `Number` de ano em select; sem parseFloat/Math financeiro)       |

Suite: `tests/web/tax-compliance-reminders.test.ts` 10/10 **PASS**; `pnpm test:web` 36/210 **PASS**.

---

## 9. Mobile

`apps/mobile/src/components/fiscal/TaxComplianceRemindersCard.tsx` integrada à aba fiscal após `ComplianceTimelineCard`.

| Item                                           | Resultado                                         |
| :--------------------------------------------- | :------------------------------------------------ |
| upcoming / overdue / stale                     | **PASS**                                          |
| acknowledge / snooze / dismiss                 | **PASS** (snooze via texto `YYYY-MM-DD` validado) |
| history                                        | **PASS** (+ disclaimer de apoio)                  |
| client tax math / deadline math / penalty math | **NO** (grep limpo)                               |

Suite: `tests/mobile/tax-compliance-reminders.test.ts` 8/8 **PASS**; `pnpm test:mobile` 28/103 **PASS**.

---

## 10. Banco de Dados

- PostgreSQL canônico: **16.x** (porta 5433)
- Migrations: **22** (`20261012000000_add_tax_compliance_reminders`, aditiva; 1–21 intactas)
- Tabelas: `tax_compliance_reminder_actions` (uniq `tax_compliance_reminder_action_rev_uniq`), `tax_compliance_notification_events` (uniq `tax_compliance_notification_event_dedup_uniq`), `tax_compliance_reminder_preferences` (PK por sujeito)
- Fresh (0→22): **PASS**; idempotente no 2º deploy; `migrate status` limpo
- Upgrade (21→22): **PASS**; 100% preservação (users, portfolios, accounts, transactions, obligations, compliance actions); 0 orphans
- Pending: **NO**; drift: **NO**; `db push`: **NO**; migração histórica editada: **NO**
- Suite: `tests/database/phase-4k3-canonical-db-evidence.test.ts` 5/5 **PASS**
- Manutenção de contagem: 10 arquivos de evidência antigos com `21` hardcoded foram atualizados para `22` (mesmo padrão da 4K.2B que levou 4k2a de 20→21); nenhuma asserção enfraquecida
- `pnpm test:database`: 28 arquivos / 148 testes — **PASS** (ver §13)

---

## 11. E2E (45 cenários)

Suite: `tests/fiscal-api/tax-compliance-reminders-e2e.test.ts` — **45/45 PASS, 0 falhas**.

- Upcoming S1–S10 (3 instâncias T-7/T-3/T-1, `SCHEDULED`, chaves determinísticas, envelope+`no-store`, filtros, preferências, ack/snooze/dismiss)
- Due-today S11; Overdue S12–S17 (instância única `dueDate+1`, sem penalidade, sem duplicata entre ciclos, completion suprime, reopen restaura, zero-amount sem lembrete)
- Stale/evidence S18–S23 (supersessão, sem herança de dismissal, MATCH sem nag, MISMATCH→review, STALE_SOURCE, sem reuso de ack)
- Annual S24–S28 (review presente, opt-out, filtro por kind, ano/exercício preservados, BLOCKED→ACTION_REQUIRED)
- Preferences S29–S34 (defaults, disable total, lead custom `[5]`, inválidos 400, ownership, janela de trigger)
- Security/delivery S35–S45 (cross-user GET vazio, cross-user POST 404, chave estrangeira 404, estrutura forjada 400, snooze passado 400, oversized 400, ação desconhecida 400, sem-auth 401, delivery idempotente + histórico, delivery obsoleta 404, snooze expirado reexpõe)

---

## 12. Propriedades (9) e Fuzz (20.000)

- `tests/tax-engine/tax-compliance-reminder-properties.test.ts`: **9/9 PASS**
  - P1 determinismo (200 replays byte-idênticos, frozen); P2 estabilidade de chave semântica; P3 determinismo de trigger (`dueDate − lead`); P4 dedup (sem spam entre ciclos; 1 OVERDUE); P5 sensibilidade a fingerprint (shell + instância nova acionável); P6 supersessão (dismiss por instância, sem resolver siblings); P7 preferências determinísticas (CANCELLED sem apagar histórico); P8 preservação de histórico (snooze expira → DELIVERED); P9 mapeamento de kinds de evidência
- `tests/tax-engine/tax-compliance-reminder-fuzz.test.ts`: **20.000 iterações, 0 violações PASS** (seed fixa 20260411; invariantes: determinismo, enums fechados, escopo por sujeito, unicidade de dedupKey, SNOOZED com horizonte, SUPERSEDED↔stale, títulos/mensagens presentes, sem throw em entradas civis válidas)

---

## 13. Concorrência (6) e Escala

- `tests/fiscal-api/tax-compliance-reminders-concurrency.test.ts`: **6/6 PASS** (delivery duplicada→1 evento; ações distintas→rev 1,2; ack+source-change→STALE determinístico; snooze+delivery sem duplicata; prefs+scheduler sem estado misto; read+rebuild coerente)
- `tests/fiscal-api/tax-compliance-reminders-scale.test.ts`: **PASS**
  - API: N=10 → 1186ms/123q; 100 → 370ms/123q; 1000 → 598ms/123q; 10000 → 1490ms/123q — orçamento constante O(1), zero N+1, memória <40MB
  - Motor: N=10 → 1ms/30 lembretes; 100 → 18ms/300; 1000 → 97ms/3000; 10000 → 832ms/30000 — O(n log n), sem O(n²)
  - N+1 por reminder/action/event: **NO**; query shape bounded (≤250 asserts, 123 observados); memory bounded: **YES**

---

## 14. Segurança e Privacidade

| Gate                      | Evidência                                                                         | Resultado |
| :------------------------ | :-------------------------------------------------------------------------------- | :-------- |
| cross-user read           | S35 (sujeito estranho vê só o próprio vazio); timeline S27 herdado                | **PASS**  |
| cross-user write          | S36/S37 POST em chave alheia → 404                                                | **PASS**  |
| anti-enumeration          | 404 nunca 403 em todas as rotas (prefix-check + projeção fail-closed)             | **PASS**  |
| private/no-store          | 6 rotas com `Cache-Control: private, no-store` (S5, S29, S43 asserem)             | **PASS**  |
| sensitive logging         | nenhum `logger`/console nos use-cases fiscais novos; grep 0 ocorrências           | **NO**    |
| sensitive preview         | títulos lock-screen-safe, sem valores/credenciais; detalhes só no app autenticado | **NO**    |
| credential storage        | nenhuma credencial nova; sem URL pública de evidência                             | **NO**    |
| official/government claim | `USER_REPORTED` estrito; disclaimer de apoio em todas as superfícies              | **NO**    |

---

## 15. Regressão Upstream (sem drift)

| Fase | Suíte canônica                                                    | Resultado     | Drift  |
| :--- | :---------------------------------------------------------------- | :------------ | :----- |
| 4G   | equity-6015 (10) + monthly-tax-core (14) + day-trade (8)          | **PASS** (32) | **NO** |
| 4H   | position (25) + capital-market (25) + investment-income (36)      | **PASS** (86) | **NO** |
| 4I   | minimum-tax-property (9, fuzz 10k) + review-package-fixtures (26) | **PASS**      | **NO** |
| 4J.1 | consistency + precedence (20) + golden (19) + api service (15)    | **PASS**      | **NO** |
| 4J.2 | review-package (12) + web unified-annual (21)                     | **PASS**      | **NO** |
| 4J.3 | carry-forward 4K.2C (árvore de produção idêntica nos núcleos)     | **PASS**      | **NO** |
| 4K.1 | timeline (8) + properties (8) + supersession (3) + E2E 34/34      | **PASS**      | **NO** |
| 4K.2 | properties 11/11 + fuzz 20k + E2E 36/36 + concurrency 5/5 + scale | **PASS**      | **NO** |

Spot puro consolidado: 16 arquivos / 244 testes **PASS**. Nenhum arquivo-fonte de 4G/4H/4I/4J/4K.1/4K.2 foi modificado (diff comprova).

---

## 16. Plataforma e Raiz

| Comando                             | Resultado                                                                                                |
| :---------------------------------- | :------------------------------------------------------------------------------------------------------- |
| `pnpm test:database`                | 28 arquivos / 148 testes — **PASS**                                                                      |
| `pnpm test:fiscal-api`              | 62 arquivos / 535 testes — **PASS**                                                                      |
| `pnpm test:tax-engine`              | 70 arquivos / 761 testes — **PASS**                                                                      |
| `pnpm test:api`                     | 38 arquivos / 269 testes — **PASS**                                                                      |
| `pnpm test:security`                | 14 arquivos / 55 testes — **PASS**                                                                       |
| `pnpm test:auth`                    | 9 arquivos / 31 testes — **PASS**                                                                        |
| `pnpm test:architecture`            | 26 arquivos / 218 testes — **PASS**                                                                      |
| `pnpm test:web`                     | 36 arquivos / 210 testes — **PASS**                                                                      |
| `pnpm test:ui`                      | 31 arquivos / 244 testes — **PASS**                                                                      |
| `pnpm test:mobile`                  | 28 arquivos / 103 testes — **PASS**                                                                      |
| `pnpm test:web:e2e`                 | 330 testes Playwright — **PASS**                                                                         |
| `pnpm test`                         | turbo + vitest suites (exit 0) — **PASS**                                                                |
| `pnpm build`                        | 2/2 tasks — **PASS**                                                                                     |
| `pnpm typecheck`                    | 21/21 tasks — **PASS**                                                                                   |
| `pnpm lint`                         | 0 erros, 0 warnings — **PASS**                                                                           |
| `pnpm format:check`                 | 100% — **PASS**                                                                                          |
| `pnpm validate:foundation`          | lint + format + typecheck + test + ui + portfolio + security + architecture + web:e2e + build — **PASS** |
| `pnpm validate:portfolio-engine-rc` | portfolio-engine + api + foundation — **PASS** (relançado integral após fix de formato do draft)         |

---

## 17. Contratos

- `docs/contracts/tax-compliance-reminders-v1.md`: **MATCH** (autoridade upstream, identidade, política de trigger, preferências, dedup, semânticas ack/snooze/dismiss, source-change, entrega, privacidade, sem recomputação)
- `docs/decisions/ADR-287-tax-compliance-reminders.md`: **MATCH**
- `AGENTS.md` Seção 84: **MATCH** (10 invariantes; diff cirúrgico de 33 inserções, UTF-8 LF preservado, prettier limpo)

---

## 18. Auditoria de Arquivos de Produção

Para cada arquivo alterado: sem matemática tributária, sem vencimento legal, sem penalidade, sem execução de pagamento, sem integração governamental.

- `packages/tax-engine/.../reminder-{types,engine}.ts` (novos): projeção pura; datas civis inteiras; `Number()` só em componentes de calendário (ano/mês/dia) e validação de lead — zero float financeiro
- `packages/database/...` (3 repos + interfaces + schema + migration 22): persistência append-only/upsert/dedup; sem lógica fiscal
- `apps/api/...` (4 use-cases + DTO Zod + 6 rotas + tokens + módulos): orquestração; relógio injetado; sem `Date.now()` no domínio; sem Prisma no motor
- `packages/ui/...view-model` + web/mobile components: formatação verbatim; sem math financeiro (grep comprova)
- `tests/database/*` (10 arquivos): só bump 21→22 em contagens de migration (padrão herdado da 4K.2B); zero enfraquecimento

---

## 19. Bloco Canônico de Aprovação

```text
ARCHITECTURE: READY
REMINDER_DOMAIN: READY
USER_ACTIONS: READY
SOURCE_CHANGE: READY
PREFERENCES: READY
DELIVERY: READY
WEB: READY
MOBILE: READY
DATABASE: READY
E2E: READY (45/45)
PROPERTIES: READY (9/9)
FUZZ: READY (20000/0)
CONCURRENCY: READY (6/6)
SCALE: READY
SECURITY: READY
REGRESSIONS: READY
PLATFORM: READY
CONTRACTS: READY
REAL_4K3_BLOCKERS: none

PHASE 4K.3: APROVADA
PHASE 4K: NÃO APROVADA
PHASE 4K: NÃO APROVADA
```

Sem avanço a 4K.4. Sem Sicalc, pagamentos, bancos, DIRPF, Receita ou Tax AI.
