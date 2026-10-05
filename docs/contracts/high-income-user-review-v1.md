# Contract — High-Income User Review v1

- **Contract ID:** `high-income-user-review-v1`
- **Phase:** 4I.5 (web review + evidence workflow)
- **Status:** FROZEN
- **Upstream (immutable):** `high-income-annual-integration-v1` (4I.4 API),
  4I.1/4I.2/4I.3 domain contracts
- **Route:** `/tax/high-income` (annual review; year selector 2024–2026)

---

## 1. Purpose

Project the authoritative server assessment for human review and evidence completion.
The page answers: am I subject, why, what contributed, what is complete/missing, which payer
needs evidence, whether Atlas can compute the final amount, and exactly what blocks it.

## 2. Status mapping (server → PT-BR label)

`NOT_APPLICABLE` → Não aplicável · `CALCULABLE` → Apurado pelo Atlas ·
`INCOMPLETE_CREDITS` → Créditos pendentes ·
`INCOMPLETE_REDUCTION_DATA` → Evidência corporativa pendente ·
`REQUIRES_CONFIRMATION` → Requer confirmação · `BLOCKED` → Bloqueado ·
`UNSUPPORTED_YEAR` → Ano não suportado · `UNSUPPORTED_INPUT` → Dados não suportados ·
unknown → Status desconhecido. Status is always text + badge, never color-only.

## 3. Null/zero behavior

Known zero renders as `R$ 0,00` (including authoritative zero redutor). Null/unknown renders as
`—` with a contextual hint (`Não disponível`, `Depende de confirmação`, `Bloqueado`). Blocked
or unknown net tax is never rendered as zero or as a final amount. The words "imposto final",
"valor devido definitivo" and "pronto para pagar" never appear unless `netMinimumTax` is
authoritative (`CALCULABLE` with non-null net).

## 4. Base breakdown

One row per server category entry: category label, gross, included, excluded, classification
label. Client never infers inclusion/exclusion; server fields render verbatim. Dividend
transition states (ordinary / eligible / unverified) and JCP / FII eligibility render from
server classifications without collapsing.

## 5. Credits display

Supported credits render with kind, amount and server reason label. `creditExcess`, when present,
renders as informational only and is never called a refund.

## 6. Payer redutor display

Per-payer rows: payer id, type label (34/40/45 caps), dividends, corporate effective rate,
reference rate, redutor, evidence status label, calculation status label. Missing evidence
renders "Evidência tributária da fonte pagadora necessária" (never R$ 0,00); authoritative zero
renders R$ 0,00. Payer identities never merge (keyed by `payerId`). Sorting (payer/status) and
filters (status/evidence) are client-side ordering only. Rendering is capped (100 rows + "show
more"); no virtualization library, no eager 10k DOM.

## 7. Evidence UX

- Requirements grouped with type, status, reason, and current revision info.
- Current revisions table: type, payer, revision (+superseded marker), authority, source,
  stale/conflict flags. History is append-only: the UI never offers in-place edits.
- Submission form fields are limited to the 4I.4 contract: evidence type; payer (select from
  upstream payer ids only); payer type; profit period (year select); mode; book decimals as
  strings; adjustment/total amount; evidence source. No `AUTHORITATIVE` field exists client-side.
- Financial inputs stay strings; no `parseFloat`/`Number`/float math anywhere in web code.
- Double submit is guarded (disabled while pending) and server-idempotent regardless.
- Server validation errors render verbatim; no fiscal validation is replicated in the browser.
- Conflict (409) renders "Há evidências conflitantes para esta fonte pagadora." with
  KEEP_EXISTING / ACCEPT_NEW actions that create new revisions (history preserved).
- Stale rows render "Desatualizada — dados de origem mudaram; revise a confirmação."
- After POST, the high-income query, evidence and requirements refetch (no stale cache; no
  previous-year values leak across year switches since query keys include the year).

## 8. Year/exercise

Ano-calendário and Exercício render as distinct labeled values on every state. Query keys
include the calendar year; switching years never shows another year's values.

## 9. State coverage

Loading skeletons; error state with retry (401/404/400/409/500 mapped to human messages);
empty/invalid-response state without crash; unsupported-year message
("Regras ainda não suportadas para este ano", no calculator); pre-effective and
not-applicable concise explanations without unactionable warnings; blocked state prioritizes
action items ordered BLOCKED > CONFLICTING > MISSING > STALE > REQUIRES_CONFIRMATION >
UNSUPPORTED.

## 10. Disclaimer (mandatory, always visible)

"Este cálculo é um suporte fiscal baseado nos dados disponíveis no Atlas e não representa
transmissão, validação ou aceitação pela Receita Federal. Não constitui DARF, pagamento ou
declaração enviada." No language implies filing, validation, payment or DARF issuance.

## 11. No client math

Web code performs zero tax computation: no threshold/rate/base/credit/redutor/net math, no
reclassification, no aggregation of financial values. Currency/percent display formatting of
exact server strings is allowed (`formatCurrency`/`formatPercentage`). Guarded by
`tests/architecture/no-client-high-income-tax.test.ts` (no `@atlas/tax-engine` imports, no
math patterns in web + view-model sources).

## 12. Accessibility, responsive, performance

Keyboard-navigable controls (native buttons/selects/inputs, 44px targets, labeled fields,
`role="status"`/`role="alert"`, focusable modal form); semantic headings and table headers;
desktop/tablet/mobile layouts via the shared responsive shell. Measured (Desktop Chrome):
10k payers render ~1.1s, filter ~0.1s, sort ~0.07s, heap ~18MB — no O(n²) (capped render,
memoized sort/filter). One API GET per year view; no per-payer requests; no polling.

## 13. Security

No raw CPF, tokens, internal secrets, foreign-user data, or client-controlled authority in UI.
Evidence notes render as text (no HTML injection; no formula evaluation). No financial values in
telemetry payloads; client logs never carry evidence payloads.
