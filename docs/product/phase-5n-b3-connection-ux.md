# Phase 5N — B3 Connection UX & Consent Product Flow

Status: implemented. No live B3 integration, no secrets, no network, no
migrations (count stays 31), no backend changes.

Related: `docs/product/phase-5m-simulated-b3-sync.md` (the pipeline this UX
describes) and `docs/product/phase-5l-b3-product-integration-foundation.md`.

## Product entry point

`Carteira → Importar / Conectar` (`/portfolio/import?portfolioId=…`, linked
from the portfolio operations tab). The page answers immediately: "Como quero
colocar meus investimentos no Atlas?" No engine vocabulary reaches the user
(no canonical event, fingerprint, reconciliation internals).

## Current availability

```text
CSV    = AVAILABLE  (existing functional importer, untouched logic)
Manual = AVAILABLE  (existing "+ Nova operação" flow on /portfolio?tab=operations)
B3     = PREPARING  (honest preparing state; no live connection exists)
```

Availability (`B3IntegrationAvailability`) is a product-capability concept,
separate from connection runtime state (`SyncState`). `SYNCED` never implies
`AVAILABLE`. Single source of truth:
`packages/ui/src/view-models/b3-connection.view-model.ts`
(`resolveB3IntegrationAvailability`, safe default `PREPARING`; only an
explicit `realConnectionEnabled: true` opt-in yields `AVAILABLE`).

## The three methods

| Method                                        | Badge           | CTA (production)        | Target                                             |
| --------------------------------------------- | --------------- | ----------------------- | -------------------------------------------------- |
| B3 — Sincronização automática                 | `Em preparação` | `Saiba como funcionará` | Explanation dialog                                 |
| Importar arquivo — CSV da corretora           | —               | `Importar arquivo`      | Existing importer section (`#importador-arquivo`)  |
| Adicionar manualmente — Ajustes e lançamentos | —               | `Adicionar operação`    | `/portfolio?tab=operations` (existing manual flow) |

When the explicit simulation opt-in is active (dev/test only, never
production), the B3 CTA reads `Conectar (simulação)` and the dialog carries
the simulation notice. Production/default never shows an active connect
control and never shows the word "simulação".

## Future B3 journey (planned, not built)

```text
Connect → consent → authorize → sync → review → confirm → reconcile
```

## Current simulation boundary

The 5M `SimulatedB3Provider` is test/dev infrastructure, not a product
dependency: web and mobile production sources must not import
`b3-simulated.ts`, `SimulatedB3Provider`, `runSimulatedB3Sync`, or
`@atlas/import-engine` at all (enforced by
`tests/architecture/b3-connection-boundaries.test.ts`). No dev harness
route exists — simulation is exercised through component/unit tests only,
so a mock can never surface as production.

## UX state mapping

### Sync state → presentation

| Technical state            | Label                        | Tone    | CTA                      |
| -------------------------- | ---------------------------- | ------- | ------------------------ |
| `NOT_CONNECTED`            | Não conectado                | neutral | Saiba como funcionará    |
| `AWAITING_AUTHORIZATION`   | Aguardando autorização       | info    | Concluir autorização     |
| `AUTHORIZED`               | Autorizado                   | info    | Sincronizar agora        |
| `SYNCING`                  | Sincronizando                | info    | — (loading announced)    |
| `SYNCED`                   | Sincronizado                 | success | Revisar registros        |
| `PARTIAL`                  | Sincronização parcial        | warning | Ver o que falta          |
| `REQUIRES_REAUTHORIZATION` | Nova autorização necessária  | warning | Autorizar novamente      |
| `ERROR`                    | Não foi possível sincronizar | danger  | Tentar novamente         |
| `REVOKED`                  | Acesso revogado              | neutral | Entender como reconectar |

### Duplicate → presentation

| Verdict              | Label                | Behavior                                       |
| -------------------- | -------------------- | ---------------------------------------------- |
| `EXACT_DUPLICATE`    | Já importado         | Auto-excluded from selection, with explanation |
| `PROBABLE_DUPLICATE` | Possível duplicidade | Requires human review, never auto-merged       |
| `CONFLICT`           | Conflito de dados    | Requires explicit decision                     |

### Reconciliation → presentation

| Verdict          | Label                                       |
| ---------------- | ------------------------------------------- |
| `MATCHED`        | Posição conferida                           |
| `DIVERGENT`      | Diferença encontrada (never auto-corrected) |
| `MISSING_LOCAL`  | Ativo só na fonte                           |
| `MISSING_SOURCE` | Ativo só na carteira                        |
| `UNRESOLVED`     | Não foi possível conciliar                  |

### Sync summary

Counts become lines ("3 novas operações encontradas", "5 registros já
conhecidos", "1 item precisa de revisão", "2 eventos ainda não suportados").
Partial results are never framed as success; unsupported rows are always
surfaced — the UI never suggests everything was imported.

## Data limitation

Dividend/JCP B3 rows are carried but not persisted in this phase; the summary
and explanation copy say so explicitly ("nem todo tipo de evento estará
disponível de imediato", unsupported count always visible, nothing discarded
silently).

## Copy and brand guardrails

Banned in product copy (test-enforced): "Conecte agora sua B3", "Integração
B3 disponível", "Sincronização oficial ativa", "Carteira 100% automática",
"Todos os investimentos serão importados", "Dados em tempo real",
"Conectar agora", any partnership/endorsement wording. No B3 logo: neutral
" B3" text treatment only. Security copy makes no unimplemented technical
claims ("O Atlas não pedirá a senha da sua corretora" — factual).

## Accessibility and responsiveness

- One action catalog drives every viewport; cards stack via responsive grid,
  no hover-dependent information, 44px touch targets on all CTAs.
- Every status carries text + tone (never color-only); the explanation dialog
  reuses the existing accessible `Modal` (focus trap, Escape, labelled
  actions); loading states announced through existing `Button isLoading`.

## Verification

- `pnpm build` — PASS (baseline on 776a486 and closing gate).
- `pnpm typecheck` (all packages) — clean.
- `pnpm test:import-engine` — 73 passed (5M pipeline untouched).
- API import + B3 suites — green (CSV/manual flows unbroken).
- `pnpm test:web` — green, incl. 16 new 5N presentation tests.
- `pnpm test:architecture` — green, incl. 4 new boundary tests.
- `eslint` on touched files — clean; `prettier` applied.
- Migrations: 31 + lockfile, unchanged.
