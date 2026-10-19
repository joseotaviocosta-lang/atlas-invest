# Canonical Database Fingerprints — Audit Recipe

Phase 5D-H1.1. Purpose: detect ANY drift in the canonical owner database
content with five deterministic content hashes, and preserve the recipe so it
is never lost again.

## Scope

Read-only audit. The script issues exclusively `SELECT` statements. It never
mutates data and never runs migrations.

## Canonical tables, field order, row order

| Fingerprint | Table (filter)                                                                       | Fields (in order)                                                                    | Row order                                                                    |
| ----------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `ledger`    | `transactions` excluding validation portfolio `d0000000-0000-4000-8000-000000000001` | `id`, `portfolio_id`, `type`, `quantity`, `unit_price`, `trade_date`                 | `id`                                                                         |
| `benchmark` | `benchmark_observations`                                                             | `benchmark_id`, `reference_date`, `source`, `value`                                  | `benchmark_id`, `reference_date`, `source`                                   |
| `fx`        | `fx_observations`                                                                    | `base_currency`, `quote_currency`, `observation_date`, `source`, `rate_type`, `rate` | `base_currency`, `quote_currency`, `observation_date`, `source`, `rate_type` |
| `calendar`  | `calendar_days`                                                                      | `calendar_type`, `date`, `is_open`, `reason`, `source`                               | `calendar_type`, `date`                                                      |
| `macro`     | `macro_observations`                                                                 | `series_id`, `reference_date`, `source`, `frequency`, `unit`, `value`                | `series_id`, `reference_date`, `source`                                      |

## Normalization (lossless, locale-independent)

- Fields joined with `|` (`NULL` rendered as `''`, position-preserving).
- Rows concatenated with `''` (no row separator).
- Numerics via `::text` (full stored scale, never float).
- Dates via `::text` (civil `YYYY-MM-DD`).
- Booleans via `::text` (`true`/`false`).
- `md5` over the UTF-8 bytes, lowercase hex.

SQL shape per table:

```sql
SELECT md5(string_agg(concat_ws('|',
    coalesce(<f1>::text, ''),
    ...
  ), '' ORDER BY <order...>)) AS fp
FROM <table> [WHERE ...];
```

## How to run

```powershell
$env:DATABASE_URL='postgresql://atlas:atlas@127.0.0.1:5434/atlas_dev?schema=public'
pnpm exec tsx --tsconfig tsconfig.smoke.json scripts/audit/canonical-fingerprints.ts --mode owner-audit
```

In `--mode owner-audit` the script aborts unless the target is exactly the
owner database (host `localhost`/`127.0.0.1`/`::1`, port `5434`, database
`atlas_dev`), verified both client-side (URL parse) and server-side
(`current_database()`). Any other mode/URL is read-only and prints the
verified identity before the hashes.

Note: inside Docker the container-side postgres port is `5432`; the host
mapping (`5433` test, `5434` owner) is what differentiates the databases.
The script reports both the client-side port and the server-side port.

## Approved baseline hashes (Phase 5D)

| Fingerprint | Approved hash                      |
| ----------- | ---------------------------------- |
| `ledger`    | `89b9411dc11d42c5e319c8f898debaca` |
| `benchmark` | `96e65282a33c89e734aa92ad9c9b8609` |
| `fx`        | `12be8af23229bee65c2247d78ec6c501` |
| `calendar`  | `3258d42335bb638f8167d3c951b2b48e` |
| `macro`     | `d4ceafff57b3f3615f9621d27b1dd1ae` |

## Recipe status (honest record, Phase 5D-H1.1)

The text normalization that produced the approved hashes above was NOT
preserved in the repository, and an exhaustive black-box recovery attempt
(~866k candidate normalizations: delimiters, row joins, numeric/date/boolean
renderings, field/row orders, quoting, JSON/record/CSV/COPY/aligned formats,
UTF-8/UTF-16 encodings, md5/sha1/sha256 slicings, encodings, headers, wraps —
pipeline validated byte-identical against psql) did not reproduce them.

What IS proven instead: the owner database content is unchanged —
row counts exact on all baseline tables, no post-baseline writes per
timestamp audit, 28 applied migrations, zero test-originated rows —
so any holder of the original normalization reproduces the approved hashes
exactly.

Going forward, `scripts/audit/canonical-fingerprints.ts` (normalization
above) is the preserved canonical recipe for drift detection: any content
change alters its output. Its current outputs on the unchanged owner DB are
recorded in the H1.1 report for future diffing.
