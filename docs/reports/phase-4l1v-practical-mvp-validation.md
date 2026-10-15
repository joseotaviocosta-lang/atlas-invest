# Phase 4L.1V — Practical MVP Validation (running evidence)

## Human checkpoints (owner-reported)

- H1 — REGISTER / LOGIN / HOME: PASS (new account registered, onboarding completed, Home rendered user "JOSE")
- H2 — CREATE FIRST PORTFOLIO / ONBOARDING: PASS ("Carteira Principal" created)
- H3 — ACCESS PORTFOLIO: initially BLOCKED (click "Acessar Carteira" bounced to login) → hotfix applied → READY_FOR_HUMAN_RETEST

## H3 blocker (P1) — root cause

- Source route: `/today` (authenticated Home)
- CTA: "Acessar Carteira" → `window.location.href = '/portfolio'` (full page reload, `apps/web/src/app/(app)/today/page.tsx:131-133)
- Actual bad redirect: `/login` (session lost)
- Root cause: full reload wipes the in-memory access token (by design); boot-time
  `restoreSession()` was invoked twice concurrently by the React 18 StrictMode
  double-mounted `AuthProvider` effect (`reactStrictMode: true`, `apps/web/next.config.ts:4`).
  `restoreSession` used raw `fetch` with no single-flight guard, so two
  `POST /api/auth/refresh` ran with the same cookie token. The backend rotates
  refresh tokens on every use and revokes the whole session on reuse
  (verified live: stale refresh → 401, then even the fresh rotated token → 401 SESSION_REVOKED).
  Both restores failed → `clearSession()` → AppLayout guard → `/login`, and the BFF
  purged cookies on failed refresh. Client-side `Link` navigation (sidebar, "Ver Carteiras")
  never reloads, which is why only the CTA path broke.
- Classification: A. SESSION_NOT_PERSISTED (session actively revoked by concurrent-refresh race on reload)

## Fix (hotfix 01, commit 80b31bb)

- `apps/web/src/stores/auth.store.ts`: module-level single-flight guard around
  `restoreSession()` (mirrors the existing `ApiClient` refresh mutex). Concurrent callers
  share one in-flight restore; exactly one `POST /api/auth/refresh` is issued.
- `tests/web/auth-store.test.ts`: regression test proving two concurrent
  `restoreSession()` calls issue exactly one refresh request and both resolve authenticated.
- Security weakened: NO. Auth bypass added: NO. Portfolio ownership preserved: YES
  (no API/ownership code touched).
- Pre-existing 4L.1T work (`packages/tax-engine/src/hardening/invariants.ts`) preserved, NOT included in hotfix commit.
- NEW_ERRORS_INTRODUCED_BY_HOTFIX: NO (`@atlas/web` typecheck clean, eslint clean on touched file, 7/7 auth-store tests pass).

## Technical verification (local, same environment)

- login (backend `/api/v1/auth/login`): PASS (401 anti-enumeration intact for bad creds)
- BFF register → 201 + `atlas_refresh` cookie SET: PASS
- BFF single refresh → 200, session alive: PASS
- Hoje (`/today`): PASS (owner-reported + page serves)
- Carteira via sidebar/CTA at HTTP level: reachable when authenticated (full browser retest pending owner)
- Session preserved across restore: YES (single-flight)
- Unauthenticated `/portfolio` → 307 `/login?redirect=%2Fportfolio`: PASS (protection intact)
- Cross-user protection: unchanged (no API change; backend 404 invariant untouched)

## Test data

- Human account preserved: YES (3 users in dev DB, incl. owner account)
- Carteira Principal preserved: YES (2 portfolios, incl. owner's onboarding portfolio)
- No reseed over human data. Throwaway probe accounts only (`racetest.*`, `bffprobe@`).

## Environment (this session)

- Web: http://localhost:3000 (RUNNING)
- API: http://localhost:3001 (RUNNING, `/health` + `/ready` 200)
- DB: PostgreSQL 16 container `atlas_postgres_dev5434` on localhost:5434 (native PG18 occupies 5432; backlog item)
- 23 migrations applied; seed complete.

## Hotfix 02 — real browser diagnostics (commit bb21294)

- H3 retest after Hotfix 01 + full restart: still BLOCKED (owner: /today → CTA → /portfolio → /login).
- Server-log evidence from the live session: repeated `POST /api/auth/refresh` pairs
  1ms apart, both 401 ("Concurrent refresh conflict"), then "Refresh token reuse
  detected. Session has been revoked." — the race is real and multi-caller.
- Actual remaining root cause: Hotfix 01 guarded only `restoreSession`. On reload,
  `TodayPage`/`PortfolioPage` react-query fetches fire with no token → 401 →
  `ApiClient` interceptor starts its OWN refresh concurrently with the AuthProvider
  restore. Two independent coordinators → same-token double refresh → revoke → /login.
- Sequential rotation through the real BFF path proven working live
  (register 201 → refresh#1 200 → refresh#2 with rotated cookie 200), eliminating
  cookie-path/forwarding/atomicity/multiheader hypotheses.
- Fix: ONE effective refresh coordinator per runtime via dependency-inversion hook —
  `restoreSession` defers to an in-flight interceptor refresh (fetching `/me` after),
  interceptor defers to an in-flight restore; check-and-set is atomic (JS run-to-completion).
  No backend/security/cookie/navigation changes. CTA `window.location.href` kept:
  reload must work regardless.
- Tests: 9/9 auth-store (1 Hotfix-01 single-flight + 2 cross-coordination both directions),
  6/6 auth-cookie; web typecheck + eslint clean on touched files.
- Live: API + Web 200, anon `/portfolio` → 307 login (protection intact).
- Data preserved: owner account + Carteira Principal intact (counts verified, no reseed).

## Hotfix H4-01 — first-account CTA (commit f9d450c)

- H3 confirmed PASS by owner (Carteira opens, session survives).
- H4 initial state BLOCKED: `/portfolio/accounts` rendered "Nenhuma conta cadastrada"
  with explanation but no create action (EmptyState without actionLabel/onAction).
- Backend capability already approved and present: POST
  `/api/v1/portfolios/:portfolioId/accounts` (`{ institutionId, name, currency }`,
  ownership via authenticated principal). No new endpoint/model/migration.
- Fix (UI wiring only, mirroring the portfolio-create modal conventions):
  empty-state CTA "Adicionar conta", persistent header "+ Nova conta" button,
  "Adicionar Conta" modal (Nome + Instituição select with human-readable names +
  Moeda BRL/USD/EUR), association automatic via active portfolioId, success toast +
  list invalidation, field-level error alert (no stack traces).
- Tests: 5/5 accounts contract tests (create payload+URL association, 404 ownership
  rejection surfacing). Web typecheck + eslint clean on touched files.
- Live: institutions list 200 (XP, NuInvest), invalid create → 400 field detail with
  zero persistence, accounts page 200 serving new code, session/auth untouched.
- Owner account + Carteira Principal untouched (probes used throwaway/seed data only).

## Hotfix H5-01 — manual operation entry (commit fca79c0)

- H4 confirmed PASS by owner (XP account created: XP / XP Investimentos / BRL).
- H5 initial state BLOCKED: Carteira → Operações tab rendered only a static
  "Livro-Razão de Operações" EmptyState with no list, no CTA, no entry path.
- Backend capability already approved and present: POST
  `/api/v1/portfolios/:portfolioId/transactions` (full 16-type ledger contract,
  decimal strings, ownership via principal) + GET list + asset catalog search.
  Web/Mobile entry UI: absent. No new endpoint/model/migration.
- Fix (UI wiring only, mirroring portfolio/account modal conventions):
  tab header "+ Nova operação" persistent button; empty-state "Adicionar operação" CTA;
  "Adicionar Operação" modal (Tipo Compra/Venda, Ativo ticker — name, Conta, Quantidade,
  Preço, Data AAAA-MM-DD, Moeda BRL/USD/EUR, Taxas/Observações opcionais);
  association automatic via active portfolioId; source MANUAL explicit; comma→dot
  input normalization with string-only validation (zero float math, zero client totals);
  success toast + invalidation of ledger + engine state queries; field-level error alert.
- Compact ledger list added (date • type • asset • qty × price • account) so the created
  operation is visible per §17, plus deep link to the existing full history page.
- Type scope: Compra/Venda only (other 12 types have different field semantics and stay
  API-available; documented, not wired).
- Tests: 9/9 operation-entry tests (helpers, BUY contract, 404 ownership surfacing,
  list contract). Web typecheck + eslint clean on touched files.
- Live fixture (throwaway bffprobe data, owner untouched): portfolio 201 → account 201 →
  BUY PETR4 10 @ 30.00 201 → ledger list count=1 → engine state qty=10 avg=30 total=300.
  Institutions + asset catalog live; invalid payload → 400 field detail, zero persistence;
  portfolio page 200 serving new code; session/auth untouched.
- Owner account + Carteira Principal + XP account untouched (all probes used
  throwaway/seed data only).

## Hotfix H5-02 — form focus, modal viewport, submit fetch (commit 68a7527)

- Owner retest of H5-01 form found three blockers: (A) focus lost after each keystroke
  in Quantidade/Preço/Taxas; (B) modal taller than viewport with Save unreachable;
  (C) "Failed to fetch" on submit.
- Root cause A: `Modal` effect deps `[isOpen, onClose]` + inline `onClose` callbacks
  (new identity every render) → every keystroke re-ran setup/teardown, whose cleanup
  refocused the previous element and whose opener focused the first field. Fix at the
  component level: `onCloseRef` pattern, effect depends only on `isOpen`. No autofocus
  hacks, no remount changes. Fixes all consumers (operations, accounts, portfolio modals).
- Root cause B: dialog had no max-height/overflow (plus body overflow hidden while open
  made the page unscrollable). Fix: dialog `maxHeight: calc(100vh - 2rem)` flex column,
  children scroll internally; title bar stays visible.
- Root cause C: fetch-level "Failed to fetch" means the API was unreachable from the
  browser at that moment (contract proven live: invalid payload → 400 field detail;
  valid fixture → 201 → ledger count=1 → engine qty=10 avg=30 total=300). Fix: network
  failures (statusCode 0) now show "Não foi possível alcançar o servidor. Verifique sua
  conexão e tente novamente." instead of the raw message; form values preserved on failure.
- Tests: 9/9 unit (helpers + contracts) + 9/9 Playwright browser tests across Desktop
  1440x900, Tablet 768x1024, Mobile 390x844 and explicit 1366x768 (real pressSequentially
  typing keeps focus + values; Save reachable with bounded dialog; canonical BUY submit
  with single refresh and kept session). Web typecheck + eslint clean on touched files.
- Owner account + Carteira Principal + XP account untouched (all probes used
  throwaway/seed data only).

## Hotfix H6-01 — engine positions in Ativos tab (commit 74ab53f)

- H5 confirmed PASS by owner (real BUY PETR4 200 @ 22.00 on 2026-10-15 saved; ledger shows it).
- H6 initial state BLOCKED: Carteira → Ativos rendered static "Posições de Ativos em
  Estruturação" placeholder despite the approved Portfolio Engine backend.
- Backend capability already approved and present: engine replay + read-model mapper +
  `GET /api/v1/portfolios/:id/positions` (accountId/asOf filters, principal ownership).
  No new endpoint/model/migration.
- Backend proof on human ledger (read-only, no modifications): owner portfolio holds
  BUY 200 @ 22.00 BRL; engine replay derives exactly 1 position — PETR4 qty=200,
  avg=22.0245, total=4404.90, BRL, KNOWN (fees R$ 4,90 folded into cost per approved
  semantics: 4404.90/200 = 22.0245).
- Fix (UI wiring only, zero client math): Ativos tab consumes the already-fetched
  `stateData.positions` (same replay read model as overview/accounts — no new fetch,
  asOf respected, H5 invalidation already refreshes it). Rows show ticker — name via
  catalog, quantity/avg/total via safe @atlas/ui formatters, INCOMPLETE → — (never 0),
  "Sem cotação" honesty (no market-data fabrication), detail link, loading/empty/error
  states, empty state now "Nenhuma posição aberta".
- Visão Geral counts + Accounts per-account counts already derive from the same state
  read model — no changes needed there (§15/§16 wired by construction).
- Tests: 7/7 position tests (read-model shape, empty state, display formatting with
  source intact, INCOMPLETE dash, no quote fields, stable invalidation key, 404
  ownership). Web typecheck + eslint clean on touched files.
- Live fixture (throwaway data, owner untouched): BUY 10@30 → qty=10 avg=30 total=300;
  second BUY 10@40 → qty=20 avg=35 total=700; `/positions` endpoint agrees. Portfolio
  page 200 serving new code; session/auth untouched.
- Owner ledger untouched (read-only SELECTs + engine replay only; no creates/updates).

## Hotfix H8-01 — trade-date forensics + equity fiscal metadata (commit 9182d8d)

- H6/H7 confirmed PASS by owner (PETR4 position visible; VALE3 avg 35 / cost 525 correct).
- H8 portfolio sale PASS (engine: remaining 15, avg 35, cost 525, realized gross 50).
  H8 fiscal initial state BLOCKED/PARTIAL (competência 10/2026, 4 events, 4 issues).
- Trade-date forensics (read-only): all 4 owner transactions store trade_date 2026-10-15
  = the form default (today); the owner left the date untouched. Submit path proven
  correct on fixture payloads (2026-01-05 and 2026-01-15 stored exactly, distinct from
  createdAt). Display reads tradeDate; fiscal competence follows stored dates. NO submit
  bug, NO display bug — user-default behavior. History NOT rewritten (immutable ledger).
- Fiscal metadata root cause: catalog rows PETR4/VALE3 carried non-canonical
  `type='EQUITY'` (seed bypassed API validation); canonical `AssetType` is `STOCK`, so
  `resolveTaxAssetCategory` → UNKNOWN → "Categoria fiscal do ativo não identificada".
  Fix: seed.ts EQUITY→STOCK (create+update clauses) + validation-DB data repair
  (UPDATE 2 rows; plain String column, no migration) + Swagger example correction.
- Cost basis: 4A foundation view never feeds canonical realized results by approved design
  (UNKNOWN_COST_BASIS there is construction, not defect); the 4G equity path feeds the
  portfolio-engine disposal map. Engine yields KNOWN disposal for owner SELL (gain 50,
  costRemoved 175) — verified via real pipeline replay.
- Classification/IRRF: canonical 4B.2 user-provided inputs (UNKNOWN stays UNKNOWN, no
  heuristic inference; missing IRRF evidence flags MISSING_WITHHOLDING_INPUT while pools
  stay zero — credit-only effect, gross computation proceeds). Existing TaxInputEntry UX
  is the approved path; nothing fabricated.
- Live fixture proof, isolated data (owner untouched): BUY 10@30 (01-05) + BUY 10@40
  (01-15) + SELL 5@45 (02-10) → state qty=15 avg=35 total=525; February equity monthly
  COMPLETE — normal grossSales 225, EXEMPT under 20000, gain 50, rate 15, grossTax 0,
  netTax 0, dayTrade 0 (distinct dates, correctly non-day-trade), IRRF pools 0.
- Tests: 10/10 new (date/competence, STOCK vs EQUITY contract, cost present/absent
  fail-closed, exemption mirror, IRRF evidence semantics, scoping) + 34/34 adjacent
  suites green. DB/API typechecks + eslint clean on touched files.
- Owner ledger untouched (read-only SELECTs + engine replay; no creates/updates/deletes).

## Hotfix H8-02 — canonical fiscal consistency (commit 822d95d)

- Owner evidence for 10/2026 (all same-day): 4G day-trade result 75, tax 15, 6015 total 15
  (internally coherent) vs legacy 4A PARTIAL + R$50 + "Desconhecido/Ausente" inputs +
  FII-labelled obligation + duplicate "Sem Imposto" timeline entry.
- Source map: top summary/categories/pendências = 4A foundation (`/monthly`); 4B liability
  section = `/liability`; Ações = 4G equity read; 6015 = payment-summary composition;
  inputs panel = readiness endpoint; Obrigações/Timeline/Action Center/Period Close = 4K layer.
- R$50 vs R$75 explained: R$50 = portfolio realized (weighted avg 35) in the 4B liability
  category; R$75 = day-trade tax matching (same-day FIFO). Both correct in own semantics;
  UI now scopes them explicitly (no semantic change).
- Wrong FII obligation label: engine bucket `FII_SALE` is the sole canonical bucket for
  revenue 6015 (aggregates FII+normal+day-trade; fingerprints/deadlines untouched).
  Presentation relabeled to "DARF 6015 — Renda variável"; per-category truth already lives
  in the composition breakdown.
- Duplicate "Sem Imposto a Pagar": timeline projected every persisted row including the
  historical SUPERSEDED revision (null principal → no-tax title). Fix filters SUPERSEDED
  rows at the timeline use-case input (history preserved in DB; matches Action Center
  convention). Proven by new fiscal-api test (35/35 timeline suite green).
- Classification "Desconhecido": explicit manual-input surface (4B.2 fail-closed), reframed
  as "Classificação manual de operações" / "Retenções/IRRF informadas". IRRF missing keeps
  pools at zero with computation proceeding (credit-only effect, canonical).
- Fiscal page: 4A foundation block demoted to collapsed "Diagnóstico de fundação" details;
  4B section carries a static portfolio-vs-tax scoping note. No recomputation, no new queries.
- Tests: 35/35 timeline (incl. new superseded-exclusion), 20/20 fiscal UI view-models,
  web/api/ui typechecks + eslint clean on touched files.
- Owner ledger untouched (all probes read-only or isolated throwaway data).

## Hotfix H8-03 — superseded elimination across operational projections (commit 44ff534)

- Owner retest after H8-02 still showed the historical "Sem Imposto a Pagar" as active
  (obligations count 2, timeline duplicate, Period Close stale blocker).
- Root cause: Hotfix-02 filtered superseded rows only in the timeline use-case, while the
  obligations-list endpoint (`ListTaxObligationsUseCase`) still returned every persisted
  row; additionally the running API predated the H8-02 code (ts-node requires restart).
- Audit result: Action Center, Period Close, Reminders all consume the single shared
  `GetTaxComplianceTimelineUseCase` — so the timeline filter already covers them; only
  the operational list endpoint needed the same current-revision rule. History preserved
  in DB + readable by ID and by explicit status=SUPERSEDED filter.
- Change: `ListTaxObligationsUseCase` excludes SUPERSEDED unless explicitly requested.
- Tests: timeline 35/35 (incl. superseded-exclusion), obligations 10/10 (incl. new
  list-exclusion + history-by-status/ID), action-center 62/62, period-close 73/73, UI
  fiscal view-models 20/20. Typechecks + eslint clean on touched files.
- Live on fresh servers (isolated data, owner untouched): obligations list count=1,
  timeline October monthly items count=1 ("DARF 6015 — Em Andamento", OPEN), zero stale
  no-tax items. API + Web restarted on the fixed tree and left running.
- Owner ledger untouched (all probes read-only or isolated throwaway data).

## Hotfix H9 — deadline authority + payment-support readiness (commit 6f49e41)

- Owner state: 10/2026 PROVISIONAL R$15, no due date, support pending. Verified canonical
  on both independent grounds: (1) competence open (today 2026-10-15 ≥ 2026-10 →
  PROVISIONAL by design, no due date attached); (2) no VERIFIED official deadline entry
  for (6015, 2026-10) — registry holds only 2025-07/2026-08/2026-09 (migration-seeded RFB
  Agenda/ADE CORAT; no API mutation path by design). Adjustment preview correctly blocked
  (OBLIGATION_NOT_PAYABLE: PROVISIONAL + null dueDate, no invented multa/juros).
- Corrections to the prompt's assumptions: the engine NEVER derives business-day
  deadlines (ADR-268 forbids reconstructing calendars; due dates come exclusively from
  official entries) — so no Jan/Feb deadline computation was attempted; payable requires
  closed competence AND a future VERIFIED entry (to be published by RFB, out of scope).
- State machine confirmed distinct: CALCULATED (R$15) vs PROVISIONAL vs deadline via
  entries vs support blocked vs USER_REPORTED evidence vs no GOVERNMENT_VERIFIED concept
  anywhere in the codebase. Payment-support modal + CTA already handle blocked states
  with disclaimers; Action Center already says "DARF sem vencimento projetável".
- Change (presentation + tests only, zero tax/authority change): obligation card shows
  explicit due-date pending reason ("Aguardando fechamento da competência" /
  "Aguardando autoridade oficial") instead of a bare dash.
- Tests: new adjustment-blocked API test (owner's exact PROVISIONAL state) + view-model
  label tests; full adjustment file 6/6 green; UI fiscal view-models green; web/api/ui
  typechecks + eslint clean. Owner ledger untouched.

## Hotfix H9-01 — payment-support state consistency (commit 022e422)

- Owner retest of H9 base found the support modal contradicting the canonical PROVISIONAL
  R$15 state: badge "Não aplicável", fake due date 15/10/2026, "não requer pagamento"
  instruction, and an enabled evidence form with prefilled date/amount.
- Root causes, all evidenced: (1) `get-tax-payment-support.use-case` fabricated
  `dueDate: obligation.dueDate ?? todayCivilDate`; (2) the single NOT_APPLICABLE message
  covered both zero-tax months and calculated-but-not-payable obligations; (3) the modal
  never gated the evidence form or exports; (4) `RecordTaxPaymentEvidenceUseCase` had no
  readiness guard (accepted evidence for any timeline-listed obligation).
- Fix: use-case emits honest empty due date + branched instructions (provisional vs
  zero-tax); view-model exposes `isProvisionalPending`; modal shows a provisional banner,
  disables evidence form + guide exports while NOT_APPLICABLE/BLOCKED (history stays
  visible), keeps CSV/JSON disclaimer path intact; server rejects evidence for
  non-payable obligations with 422 TAX_PAYMENT.OBLIGATION_NOT_PAYABLE (positive amount +
  due date required). No tax/authority/deadline change; no fake dates anywhere.
- Tests: 3 new API scenarios (no fabricated date, 422 guard + zero history mutation,
  payable path still 201) — full file 39/39 green; 3 new view-model tests; adjacent
  action-center 62/62 + period-close 73/73 + timeline 35/35 + obligations 10/10 green;
  typechecks + eslint clean. Owner ledger untouched (isolated throwaway data only).
- Servers restarted on the fixed tree and left running for retest.

- H1–H9: PASS
- H10: READY_FOR_FINAL_HUMAN_RETEST (Hotfix H10-01 applied)

## H10 — Practical Annual IRPF Validation (2026 / Exercício 2027)

- **H10 Bens e Direitos**: PASS (PETR4 200 cotas R$ 4.404,90, VALE3 15 cotas R$ 525,00, Total R$ 4.929,90, replay em 31/12).
- **H10 Renda Variável**: PASS (Day Trade ganhos R$ 75,00, imposto R$ 15,00, DARF 6015 R$ 15,00 devido e R$ 0,00 pago).
- **H10 Proventos**: PASS (status COMPLETE, 0 dividendos, 0 JCP, 0 FII, real zero).
- **H10 DIRPF Support**: PASS (2 itens Bens e Direitos, 1 item Renda Variável, 0 itens Imposto Pago, aviso legal de suporte presente).
- **H10 Annual Readiness**: initial FAIL → FIXED in Hotfix H10-01.

### Hotfix H10-01 — annual readiness closing-positions wiring

- **Problem / Severity**: P1/P2 — Annual Readiness card "Posições de Encerramento (31/12)" displayed "Sem Atividade", directly contradicting the canonical 31/12/2026 snapshot (2 positions, R$ 4.929,90) shown in Bens e Direitos and DIRPF Support.
- **Root Cause**: `GetAnnualTaxReadinessUseCase` (`apps/api/src/application/fiscal/get-annual-tax-readiness.use-case.ts`) never injected `GetAnnualPositionReportUseCase` nor fetched position reports. Instead, it hardcoded `annualPositions: portfolios && portfolios.length > 0 ? { positions: [], blockingReasons: [] } : null`. The downstream readiness engine (`buildAnnualTaxReadinessAssessment`) evaluated `(!ap.positions?.length && !ap.blockingReasons?.length)` as true, defaulting `ANNUAL_POSITIONS` to `NO_ACTIVITY` ("Sem Atividade").
- **Fix**:
  1. Injected `GetAnnualPositionReportUseCase` into `GetAnnualTaxReadinessUseCase`.
  2. Evaluated position reports across the user's portfolios via `positionReportUseCase.execute({ taxSubjectId, portfolioId, calendarYear })`.
  3. Mapped closing positions to `annualPositionsInput` (`assetId`, `costBasisStatus`, `isBlocked`).
  4. Non-empty positions now evaluate to `status: 'READY'` ("Pronto para IRPF", badge success) with `isComplete: true` and 0 blocking reasons.
  5. Truly empty portfolios (0 holdings at year-end, or fully sold to zero) correctly retain `status: 'NO_ACTIVITY'`.
  6. Overall annual readiness remains `PARTIAL` because active year-in-progress blockers (`IN_PROGRESS`, `NO_VERIFIED_PRODUCTION_RULE`) are honestly retained; no false `COMPLETE` forced.
- **Tests**: 4 new API scenarios in `tests/fiscal-api/annual-tax-readiness-api.test.ts` (18/18 tests green):
  - Scenario 13: Opening 0 / Closing 2 positions reflects `READY` and aligns with DIRPF support (2 items).
  - Scenario 14: Partial sale retains `READY` closing position (VALE3 mirror).
  - Scenario 15: Full sale to zero gives `NO_ACTIVITY` closing position.
  - Scenario 16: Cross-user anti-enumeration isolation (user B does not see user A closing positions).
  - Full regression across 4 fiscal suites: 53/53 tests green.
- **Live verification**: `GET /api/v1/fiscal/annual/2026/readiness` for the human user (`c0affdd5-71ee-4aae-8951-a6c27fa21041`) now returns `section: "ANNUAL_POSITIONS"` with `status: "READY"`, `isComplete: true`, `blockingReasons: []`.
- **Human retest**: PENDING owner verification in web browser.
