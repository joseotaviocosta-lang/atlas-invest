# Manual Corporate-Action Entry — SPLIT / REVERSE_SPLIT

Status: READY for owner preview (`MANUAL_CORPORATE_ACTION_ENTRY_READY`,
`VIVT3_OWNER_PREVIEW_REQUIRED`). Real confirmation NOT executed
(ledger 135 → 135).

## 1. Flow (PART A–C, V)

New "Evento corporativo" entry point on the portfolio Operações tab opens a
dedicated modal (paired staging, not the single-operation form): whitelist
Desdobramento/Grupamento only (never all 17 types), then per event
Carteira/Conta/Ativo/Data/Fator/Evidência. Staged legs accumulate in an
explicit ordered list with remove support.

## 2. Preview (PART F–I, N–P)

`POST .../corporate-actions/preview` projects staged legs SEQUENTIALLY from
live ledger state in one in-memory replay (never persisted): per-leg
before→after, cost status, fraction warnings (reverse-split remainder),
aggregate cost (INCOMPLETE stays INCOMPLETE, never R$ 0,00), static
canonical tax line, and a ledger fingerprint for stale protection.
Same-date order is deterministic via +1ms staged createdAt (rectification
precedent); canonical replay order equals staged order.

## 3. Confirm (PART J–M, Q–R)

`POST .../corporate-actions/confirm` re-validates EVERYTHING (ownership,
account isolation, asset existence, whitelist, factor/date/notes,
engine dry-run), rejects stale fingerprints (409) and duplicates (409),
then persists ALL legs in ONE database transaction (repository
`$transaction`; single `createMany` call). Either every leg lands or none
does. Provenance: owner evidence notes + `MANUAL` provider + deterministic
`MANUAL-CA|…` externalIds (retry-safe). Backend never trusts the UI
whitelist (PART L).

## 4. VIVT3 real preview (PART U, read-only)

RS 40: 200 → 5 READY, no warning; S 80: 5 → 400 READY; projected 400;
INCOMPLETE preserved; tax line shown; ledger untouched.

## 5. Scope notes

- No migration (46 → 46, PART Y); no engine ordering change (PART I:
  sequencing is request metadata, deterministic post-persist).
- Position-level TWR limitation from the conversion phase applies
  unchanged; consolidated TWR unaffected.
- Mobile has no manual flow; web-only, documented.
