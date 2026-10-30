# SNEL13 → SNEL11 Conversion Date Evidence — Investigation (CASE B)

Decision: `SNEL_DATE_EVIDENCE_NOT_FOUND`. The event stays `REVIEW_REQUIRED`.
No date fabricated, no ledger writes (134 → 134), no migration (46 → 46).

## 1. Frozen facts

- Source: SNEL13 200 recibo (2024 annual report, ISIN BRSNELR06M11, same fund
  CNPJ 43.741.171/0001-84, admin Singulare). Target effect: SNEL11 +200
  (2025 report: 900 = 400 + 200 receipt + 100 + 200 dated BUYs). Ratio 1:1.
- Window: (2024-12-31, 2025-12-31]. In-window SNEL11 BUYs: 12/09/2025 200 @
  8.59 and 29/10/2025 100 @ 8.48 → ordering material (PART X proven).
- Fund identity verified against reports before any external search:
  SUNO ENERGIAS LIMPAS FII, SNEL11, CNPJ 43.741.171/0001-84, Suno Asset
  manager, Singulare administrator. No homonym risk.

## 2. Local source search (exhaustive, read-only)

- Movement (range 2025-10-28…2026-10-28): ZERO SNEL13 rows → explicit
  `MOVEMENT_SOURCE_COVERAGE_GAP` for the window. Only SNEL12 2026
  rights/cessions (different event, post-window) and SNEL11 settlement
  shadows/ rendimentos.
- Eventos file: single sheet "Proventos a Receber" — income-only, no custody
  events, no SNEL refs. Documented as such.
- Annual 2024/2025: position snapshots only (no event/acquisition dates, no
  corporate-action notes). 2024: SNEL11 400 cotas + SNEL13 200 recibo;
  2025: SNEL11 900, receipt gone, SNEL13 income 50.08 (pre-conversion yield).
- Negotiations: 0 SNEL13 trades; SNEL11 2025 trades confirmed above.

## 3. External official search (priority B3 > CVM > admin > escriturador)

- B3/CVM/admin comunicado with a conversion date: NOT FOUND after targeted
  searches (ISIN, receipt tickers, 3ª emissão homologation, fnet, Itaú
  fileserver pattern, Suno Asset docs).
- Best available (SECONDARY, not qualifying): fiis.com.br (Grupo Suno media,
  22/04/2025) — 3ª-emission receipts tradeable as SNEL11 from Tuesday
  22/04/2025; proportional income paid 25/04 (R$ 0.02708–0.06201); offer
  R$ 8.55 = R$ 8.30 + R$ 0.25 taxa; ~R$ 166M raised.
- Why it does not qualify (STEP 12): news portal, not fund/administrator
  disclosure; states trading liberation, not the book-entry conversion date
  (conversion vs liberation are distinct dates per market mechanics).
- Leading candidate if an official source ever confirms: 2025-04-22
  (Tuesday; consistent with Thursday-17 close reference and Friday-25
  proportional payout). Recorded as candidate, NEVER booked.

## 4. Secondary cost evidence (STEP 15, informational only)

- Offer economics R$ 8.30 + R$ 0.25 taxa (secondary); 2024 report ref 8.53
  (position statement, not cost proof). No per-holder exercise record →
  source cost stays INCOMPLETE regardless. Nothing booked, nothing inferred.

## 5. Ordering + projections (conditional, not executed)

- The 22/04/2025 candidate precedes both in-window BUYs; a confirmed date
  there would make replay order: opening → conversion → Sep/Oct BUYs.
- Replay/dedupe dry-runs with a real date are WITHHELD (would require
  pinning an unproven day). Projection stands: 36/40 → 37/40 (92.5%) only
  on official-date confirmation. Targeted path once available: exact-date
  CSV import → READY → owner preview → confirm → SNEL13 closes, SNEL11 +200.

## 6. Standing debt (untouched)

Migration-count hardcodes (18/19/41/43 vs 46), package version drift,
operations-section wording, fiscal throttle flakes — pre-existing, out of
scope, verified failing identically on baseline where sampled.
