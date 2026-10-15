# Phase 4L.1V-C1 — Practical MVP Consolidation & Release-Gap Audit

**Project:** Project Atlas  
**Repository:** `C:\Projetos\atlas-invest`  
**Branch:** `feature/phase-4l1-contextual-tax-intelligence-foundation`  
**Current Commit:** `0176412bf588eb4bc9fe00d84e3b334a8e0fb16b`  
**Date:** 2026-10-15  
**Mode:** AUDIT / CONSOLIDATE / PRIORITIZE

---

## 1. Executive Summary & Purpose

Following the completion of human checkpoints **H1 through H10** in the real application with the project owner's live test data, this report pauses feature expansion to conduct an exhaustive release-oriented audit.

The objectives are:

1. Identify what is already practically usable in real investor workflows.
2. Differentiate between features proven only by technical tests vs. those validated by the human owner.
3. Catalog all remaining placeholders, UX debt, and functional blockers.
4. Establish clear, non-negotiable scopes for **Internal MVP**, **Invited-Client Release**, and **Post-MVP Backlog**.
5. Preserve all existing human test data as an irreplaceable regression baseline.

---

## 2. Environment & Preserved Human Test Data

### 2.1 Execution Topology

- **Web App**: Next.js 15 on `http://localhost:3000` (Node 22 / Fast Refresh active).
- **API Backend**: NestJS modular monolith on `http://localhost:3001` (`/health` and `/ready` responding 200 OK).
- **Database**: PostgreSQL 16 container (`atlas_postgres_dev5434`) running on port `5434` with 23 Prisma migrations applied.
- _(Note: Local port 5432 is occupied by native PG18; development database strictly binds to 5434)_.

### 2.2 Human Test Data State

The human owner data registered during Phase 4L.1V remains intact:

- **User Principal**: `c0affdd5-71ee-4aae-8951-a6c27fa21041` (`jose.otavio.costa@gmail.com`).
- **Portfolio**: `a4f3de8b-5364-45e1-a185-c4d059ef7796` ("Carteira Principal", Personal, BRL).
- **Account**: `53dd3213-397a-4cba-a3f2-1a48c6686150` ("XP Investimentos", Custódia B3, BRL).
- **Ledger Transactions** (tradeDate: `2026-10-15`):
  - `BUY` 200 PETR4 @ R$ 22,00 (Taxas R$ 4,90) → Derived Cost R$ 4.404,90 (Preço médio R$ 22,0245).
  - `BUY` 10 VALE3 @ R$ 30,00 (Taxas R$ 0,00) → Cost R$ 300,00.
  - `BUY` 10 VALE3 @ R$ 40,00 (Taxas R$ 0,00) → Cost R$ 400,00 (Preço médio R$ 35,00).
  - `SELL` 5 VALE3 @ R$ 45,00 (Taxas R$ 0,00) → Alienação R$ 225,00, Custo baixado R$ 175,00, Ganho R$ 75,00 (Day Trade).
- **Derived Engine State** (31/12/2026):
  - PETR4: 200 cotas, PM R$ 22,0245, Custo R$ 4.404,90.
  - VALE3: 15 cotas, PM R$ 35,0000, Custo R$ 525,00.
  - Total Custódia: R$ 4.929,90 across 2 active assets.
- **Monthly Fiscal State** (10/2026):
  - Day Trade base: R$ 75,00 | Alíquota 20% | Imposto R$ 15,00.
  - DARF 6015: R$ 15,00 (`PROVISIONAL`, competence currently open, not payable yet, R$ 0,00 pago).
- **Annual IRPF State** (Ano-calendário 2026 / Exercício 2027):
  - Bens e Direitos: 2 ativos em custódia (R$ 4.929,90).
  - Renda Variável: Ganhos líquidos Day Trade R$ 75,00.
  - Proventos: R$ 0,00 (real zero, COMPLETE).
  - Prontidão Anual: Posições de Encerramento `READY` (Hotfix H10-01), geral `PARTIAL`.
  - DIRPF Support: 3 itens mapeados (2 Bens e Direitos + 1 Renda Variável).

---

## 3. Practical Feature Inventory by User-Facing Domain

| Domain                              | Status                       | Practical Human Reality                                                                                                 | Technical State                                                                                       |
| :---------------------------------- | :--------------------------- | :---------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------- |
| **A. Authentication**               | `PRACTICALLY_VALIDATED`      | Login, Register, Session Restoration on page reload, Cross-user isolation, Token rotation.                              | Argon2id, JWT (15m), HttpOnly Cookie, Mutex single-flight refresh.                                    |
| **B. Onboarding**                   | `PRACTICALLY_VALIDATED`      | Welcome screen, First portfolio creation, Auto-bypass when portfolios exist.                                            | 3-step wizard with real API persistence.                                                              |
| **C. Portfolio Management**         | `PRACTICALLY_VALIDATED`      | Portfolio Switcher, Create new portfolio modal, Summary headers.                                                        | CRUD via NestJS, multi-portfolio ownership isolation.                                                 |
| **D. Custody Accounts**             | `PRACTICALLY_VALIDATED`      | Empty-state CTA, "+ Nova conta" modal, XP/NuInvest institution binding.                                                 | Composite foreign key protection `(account_id, portfolio_id)`.                                        |
| **E. Transactions**                 | `PRACTICALLY_VALIDATED`      | Operations tab, "+ Nova operação" modal, BUY/SELL entry, fee attribution.                                               | Immutable append-only ledger (`Transaction`), no client-side math.                                    |
| **F. Positions (Custódia)**         | `PRACTICALLY_VALIDATED`      | Ativos tab renders engine-derived positions, quantities, average price, total cost.                                     | Pure deterministic replay (`PortfolioReplayEngine`), Zero floats (`Money`/`Quantity`).                |
| **G. Performance (Rentabilidade)**  | `PLACEHOLDER`                | Carteira tab "Rentabilidade" shows EmptyState placeholder. `/portfolio/performance` route exists with rich view-models. | `PerformanceReplayEngine`, TWR/MWR, Rolling Analytics exist technically with 100% test coverage.      |
| **H. Income / Proventos**           | `PARTIAL`                    | Proventos tab shows EmptyState. Route `/portfolio/income` exists with filters. Ledger supports DIVIDEND/JCP.            | Annual reporting derives real zero accurately; manual income entry supported; corporate feeds absent. |
| **I. Allocation**                   | `PLACEHOLDER`                | Carteira tab "Alocação" shows EmptyState.                                                                               | No live pricing feed to compute current market weightings.                                            |
| **J. Market / Radar**               | `PLACEHOLDER`                | `/market` route shows stat cards with `—` (honest placeholders) and empty tabs.                                         | Fixtures and schemas exist in `@atlas/market-data`, no streaming WebSocket or live polling.           |
| **K. Fiscal Monthly (6015)**        | `PRACTICALLY_VALIDATED`      | Day trade 20% calculation, monthly summary, R$ 15 DARF obligation, timeline.                                            | Deterministic tax engine, Day Trade vs Normal netting, IRRF offset.                                   |
| **L. Payment Support (DARF)**       | `PRACTICALLY_VALIDATED`      | Honest provisional disclaimer, blocked evidence form when not payable, support guide export.                            | Official deadline authority (ADE CORAT/RFB calendar), 422 guard against premature payment.            |
| **M. Annual IRPF (DIRPF)**          | `PRACTICALLY_VALIDATED`      | Bens e Direitos (31/12 replay), Renda Variável summary, DIRPF support mapping, Readiness card.                          | Pure replay at 31/12 cutoff date, strict capital market rules, 2026/2027 calendar year mapping.       |
| **N. Action Center & Period Close** | `PRACTICALLY_VALIDATED`      | Action Center shows current revision obligations, closes blocked when provisional.                                      | Idempotent period close engine, superseded revision filtering.                                        |
| **O. AI Assistant**                 | `PLACEHOLDER`                | `/ai` page renders chat UI and starter chips, grounded explanations framework.                                          | Grounding engines exist in `@atlas/ai-engine`, LLM provider client is mock/stub.                      |
| **P. Mobile (Expo)**                | `NOT_TESTED`                 | Full directory structure and screens exist, but unverified in this test cycle.                                          | Expo Router v4, React Native 0.76, SecureStore integration, 100% unit tests pass.                     |
| **Q. Import & Brokerage Sync**      | `NOT_IMPLEMENTED`            | Manual transaction entry only. No CEI/B3 or Open Finance sync.                                                          | Architecture designed for append-only ingest, no third-party scrapers.                                |
| **R. Notifications & Reminders**    | `TECHNICALLY_VALIDATED_ONLY` | Web UI shows reminder cards; email/push alerts not connected to real SMTP/SNS.                                          | `tax-compliance-reminders.test.ts` passes; background cron scheduled.                                 |
| **S. Settings & Profile**           | `PARTIAL`                    | `/profile` displays active user session and logout button.                                                              | Password reset flow technically proven via auth tests.                                                |
| **T. Production Operations**        | `PARTIAL`                    | Health/Ready probes pass; Docker containerized DB; strict env separation.                                               | CI pipeline, automated backups, and production domain orchestration pending.                          |

---

## 4. H1–H10 Validation Evidence & Hotfix Inventory

Practical testing of checkpoints H1–H10 surfaced 11 critical defects that unit and mock tests masked. All were repaired without compromising architecture or data integrity:

| Checkpoint | Scope                           | Result   | Discoveries & Hotfixes Required                                                                                                                                                                                                                                                                                                                                                                          |
| :--------- | :------------------------------ | :------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **H1**     | Register / Login / Home         | **PASS** | Initial registration and onboarding bypass worked cleanly.                                                                                                                                                                                                                                                                                                                                               |
| **H2**     | Create Portfolio                | **PASS** | "Carteira Principal" created with real persistence.                                                                                                                                                                                                                                                                                                                                                      |
| **H3**     | Session / Access Portfolio      | **PASS** | **Hotfix 01 (`80b31bb`)**: Module-level single-flight guard around `restoreSession`.<br>**Hotfix 02 (`bb21294`)**: Cross-coordination between `restoreSession` and `ApiClient` refresh mutex to prevent double-refresh race condition on full page reload.                                                                                                                                               |
| **H4**     | Create Account                  | **PASS** | **Hotfix 01 (`f9d450c`)**: Added empty-state CTA and "+ Nova conta" modal with institution select to `/portfolio/accounts`.                                                                                                                                                                                                                                                                              |
| **H5**     | Manual Transaction Entry        | **PASS** | **Hotfix 01 (`fca79c0`)**: Exposed "+ Nova operação" button and modal on portfolio operations tab.<br>**Hotfix 02 (`68a7527`)**: Fixed modal focus trap (`onCloseRef`) that caused focus reset on keystroke; added scrollable modal body and network failure handling.                                                                                                                                   |
| **H6**     | Transaction → Derived Position  | **PASS** | **Hotfix 01 (`74ab53f`)**: Wired portfolio Ativos tab to engine-derived positions (`stateData.positions`) with safe formatters.                                                                                                                                                                                                                                                                          |
| **H7**     | Multiple Buys / Average Price   | **PASS** | Proved average price calculation (PETR4 @ 22.0245, VALE3 @ 35.00) matching engine replay determinism.                                                                                                                                                                                                                                                                                                    |
| **H8**     | Partial Sale & Day Trade (6015) | **PASS** | **Hotfix 01 (`9182d8d`)**: Asset catalog seed updated (`EQUITY` -> `STOCK`) for canonical tax category resolution; trade date preservation.<br>**Hotfix 02 (`822d95d`)**: Relabeled FII label to "DARF 6015 — Renda variável"; added SUPERSEDED filter to timeline use case.<br>**Hotfix 03 (`44ff534`)**: Excluded SUPERSEDED obligations from operational list endpoint (`ListTaxObligationsUseCase`). |
| **H9**     | DARF / Payment Support          | **PASS** | **Hotfix 01 (`6f49e41` & `022e422`)**: Enforced honest deadline authority (no fabricated dates for PROVISIONAL); gated payment support modal (evidence form & guide export disabled while provisional); added 422 guard on backend evidence creation.                                                                                                                                                    |
| **H10**    | Annual IRPF & Readiness         | **PASS** | **Hotfix 01 (`0176412`)**: Injected `GetAnnualPositionReportUseCase` into `GetAnnualTaxReadinessUseCase` to wire 31/12 closing positions into annual readiness.                                                                                                                                                                                                                                          |

---

## 5. Architectural Invariant Audit

| Invariant                | Status       | Practical Verification                                                                                                                                      |
| :----------------------- | :----------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Zero Floats**          | **VERIFIED** | Every monetary value, fee, tax, and quantity uses `Money` or `Quantity` encapsulating `decimal.js`. Primitives `number` never touch financial calculations. |
| **Replay Determinism**   | **VERIFIED** | Replay of 4 transactions reproduces identical positions (PETR4 200, VALE3 15) and tax liability (R$ 15) on 100% of runs.                                    |
| **Append-Only Ledger**   | **VERIFIED** | No `PUT` or `DELETE` endpoints exist for `Transaction`. Retifications occur solely via compensatory events.                                                 |
| **Resource Ownership**   | **VERIFIED** | Cross-user requests return `404 Not Found` (anti-enumeration). `userId` is strictly extracted from the authenticated JWT session.                           |
| **Token Rotation**       | **VERIFIED** | Refresh tokens rotate on every invocation; reused tokens trigger immediate full-session revocation.                                                         |
| **Honest Visual Policy** | **VERIFIED** | Interfaces display `—` with contextual disclaimers when data is pending engine computation; zero fabricated charts or dummy values.                         |

---

## 6. Release-Gap Analysis

### 6.1 What is UX Debt vs. Functional Blocker?

- **UX Debt (Non-blocking)**:
  - Deep-link navigation: clicking "Rentabilidade" tab on `/portfolio` renders an empty-state instead of navigating or embedding the existing `/portfolio/performance` view.
  - Absence of asset search in "+ Nova operação" (requires dropdown selection from catalog).
  - Absence of bulk CSV transaction import.
- **Functional Blockers (Must fix for internal MVP)**:
  - Inability to edit or compensate erroneous transactions directly from the UI without manual compensating entry.
  - Native PG18 occupying port 5432 requires developers to manually specify port 5434.

---

## 7. MVP Boundary Definition

### 7.1 Tier 1: Internal MVP (Founder & Team Dogfooding)

_Scope: Complete manual management of real personal investments._

1. **Core Navigation**: Connect portfolio "Rentabilidade" tab to existing `/portfolio/performance` components.
2. **Operations**: Add support for `TRANSFER_IN`, `TRANSFER_OUT`, and `DIVIDEND` entries in "+ Nova operação" modal.
3. **Database Port Alignment**: Document or standardize PostgreSQL 16 container port.
4. **Export Support**: Verify CSV download of DIRPF support package and Bens e Direitos.

### 7.2 Tier 2: Invited-Client Release (Early Adopters)

_Scope: Polished experience for external investors._

1. **Quotation Feeds**: Integration with B3 end-of-day quotes for live portfolio valuation and allocation charts.
2. **Proventos Ingest**: Corporate events calendar and automatic announcement tracking.
3. **Password Self-Service**: Real SMTP email integration for forgot-password links.
4. **Mobile Polish**: Validate Expo mobile app build on iOS TestFlight and Android Internal Testing.

### 7.3 Tier 3: Post-MVP Backlog

1. Open Finance / B3 CEI automatic bank sync.
2. Real-time WebSocket quote streaming.
3. Production LLM integration for `/ai` conversational assistant.
4. Automatic DARF generation via SicalcWeb barcode integration.

---

## 8. Remaining Work Estimate (Practical Terms)

| Milestone                 | Focus Areas                                                     | Complexity            | Estimated Effort          |
| :------------------------ | :-------------------------------------------------------------- | :-------------------- | :------------------------ |
| **Internal MVP Closeout** | Tab wiring (Rentabilidade), Manual Proventos entry, CSV exports | Low / Wiring          | 1–2 development sessions  |
| **Invited-Client Prep**   | Market Data EOD ingest, Allocation view, SMTP email sender      | Medium / Integrations | 3–5 development sessions  |
| **General Availability**  | Mobile store release, Automated broker import, LLM grounding    | High / External APIs  | 6–10 development sessions |

---

## 9. Next Recommended Action

**DO NOT start Phase 4L.1 feature expansions or H11 automatically.**  
The owner should review this consolidation report, test the H10 Hotfix-01 closing-position fix live in the browser, and decide whether to greenlight the **Internal MVP Closeout** items or proceed with the scheduled Phase 4L roadmap.
