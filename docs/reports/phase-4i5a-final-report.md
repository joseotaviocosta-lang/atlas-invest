# PROJECT ATLAS — PHASE 4I.5A — FINAL REPORT

## MIGRATION INTEGRITY + DATABASE GATE CLOSURE

---

## GIT

- **base (4I.5 tip):** `79ec66c` (docs(fiscal): record phase 4i5 final report)
- **branch:** `feature/phase-4i5a-migration-database-closure`
- **phase commits:**
  - `11a2def` (fix(database): repair empty taxpayer_confirmations migration)
  - `9f9b3fc` (fix(database): deterministic P2003 cross-portfolio mapping + enforce migrate-deploy DB-suite setup)
- **HEAD:** report commit on top of `9f9b3fc`
- **worktree:** clean at commit time (only untracked `.agents/` task scratch, intentionally not staged)

## REVIEW VERDICT

Convergence loop reached **APPROVED**. Both recorded findings are `info` severity
(a documented plan-assumption deviation on Prisma constraint metadata, and a
deliberate P2003 classification trade-off); neither is blocking and neither
required a code change.

## SCOPE

Phase 4I.5A closes the two pre-existing, out-of-scope defects that the 4I.5
report flagged against a fresh test cluster. Out of scope (unchanged): tax
semantics, web UX, tax math.

### (1) Migration repair — empty `taxpayer_confirmations` migration

The historical `20261002000000_add_taxpayer_confirmations/migration.sql` was empty
(0 bytes), so a fresh `migrate deploy` never created the table. Repaired with a new
**additive** migration
`packages/database/prisma/migrations/20261006120000_repair_taxpayer_confirmations/migration.sql`
containing plain deterministic SQL (no `IF NOT EXISTS`) that CREATEs
`taxpayer_confirmations` to EXACTLY match model `TaxpayerConfirmationRecord`:

- columns, types, and nullability per the model;
- the two `@@index` maps `taxpayer_conf_lookup_idx` and `taxpayer_conf_year_idx`;
- unique index `taxpayer_conf_rev_uniq`;
- primary key `taxpayer_confirmations_pkey`;
- FK `taxpayer_confirmations_tax_subject_id_fkey` → `users(id)`
  `ON DELETE CASCADE ON UPDATE CASCADE`.

The historical empty `20261002000000` migration remains byte-unchanged (still
0 bytes) and `schema.prisma` is byte-unchanged; the fix is purely a new forward
migration.

### (2) Cross-portfolio mapping fix — `transaction.repository.ts`

Prisma 6.19.3 surfaced P2003 on the composite FK path in a version-dependent way,
breaking the brittle constraint-name string match that previously classified
cross-portfolio inserts. `handlePrismaError` now performs a **deterministic
server-side ownership check** on P2003 — looking up the composite unique
`accounts(id, portfolio_id)` and reading only `{ id: true }` — instead of parsing
`meta.constraint`. Cross-portfolio inserts map to `CrossPortfolioIntegrityError`
regardless of the Prisma version's surfaced metadata.

- Does not over-catch: an asset/portfolio FK failure with a valid
  account→portfolio pairing falls through to `PersistenceError` (`PRISMA.P2003`).
- `P2002` `DuplicateExternalTransactionError` branch preserved verbatim.
- Handler made async; `create()` now awaits it and preserves the trailing throw;
  `createMany` inherits via `create`.
- Repository stays append-only (no update/delete); no new dependency added;
  no sensitive/financial fields logged.
- `tests/database/cross-portfolio.test.ts` is unchanged (empty diff) and still
  asserts the stable `rejects.toThrow(CrossPortfolioIntegrityError)` contract.

### (3) Test-DB schema-prep change — enforce `migrate deploy`

A new `tests/database/global-setup.ts` is wired via `vitest.database.config.ts`
(`globalSetup: ['tests/database/global-setup.ts']`). It provisions the schema
EXCLUSIVELY by shelling out to the pinned CLI `prisma migrate deploy` and fails
fast if `taxpayer_confirmations` is absent. It never uses `db push` and never
references `.test_pgdata` or `:5439` except in comments noting they are forbidden.
`tests/database/setup.ts` was updated to include `taxpayer_confirmations` in the
`cleanDatabase()` TRUNCATE list.

## DB PROOFS (canonical compose container; never db-push, never :5439/.test_pgdata)

- **fresh:** `prisma migrate deploy` on a clean cluster provisions all tables
  including `taxpayer_confirmations` (previously missing); global-setup presence
  guard passes.
- **upgrade:** deploy applies the new `20261006120000_repair_taxpayer_confirmations`
  row additively on top of existing history without touching prior migrations.
- **repeatability:** `test:database` recorded at 17/17 (90/90), run twice
  back-to-back with identical results.
- **no-db-push:** schema prep goes through `migrate deploy` only; `db push` is not
  invoked anywhere in the DB-suite setup path.
- **drift:** `prisma migrate status` reports no drift with the repair row present
  in `_prisma_migrations`.

## STATIC GATES (final confirmation sweep, this branch)

- `pnpm typecheck`: PASS (21/21 turbo tasks)
- `pnpm lint`: PASS (eslint exit 0)
- `pnpm build`: PASS (2/2 turbo tasks)
- `npx prettier --check "**/*.{ts,tsx,js,jsx,json,md}" "!.agents/**"`: PASS
  (all matched files use Prettier code style)

## FINAL

- MIGRATION INTEGRITY: READY · CROSS-PORTFOLIO MAPPING: READY ·
  DB SUITES (17/17, repeatable): READY · STATIC GATES: READY

REGRESSIONS INTRODUCED BY 4I.5A: none. The two 4I.5-documented pre-existing
defects (empty migration, P2003 mapping) are now closed.

FINAL CHECKPOINT: `9f9b3fc`

**PHASE 4I.5A: APROVADA**
