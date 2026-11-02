# CTE-4 — Owner Activation Record (Local Only)

Activation of verified-evidence tax-cost resolution in the owner's LOCAL
development environment. Not production enablement (no deploy vehicle exists).

- Activation date: 2026-11-02 (America/Sao_Paulo)
- Scope: `C:\Projetos\atlas-invest`, Atlas API dev process only
- Flag: `TAX_COST_EVIDENCE_ENRICHMENT_ENABLED=true` in root `.env`
  (untracked, machine-local). Code default remains `false`; `.env.example`
  documents the commented default. Boot log proves state:
  `Tax cost evidence enrichment: ENABLED`.
- Real current impact: INERT — verified read-only across 6 competences
  (2025-09, 2026-01, 2026-02, 2026-03, 2026-10, 2026-11): liability AND
  equity byte-identical flag OFF vs ON; zero enriched disposals (KCRE11, the
  sole evidence-covered asset, has no SELLs; ITSA4/EGIE3/SNEL untouched).
- What changes when live: (1) KCRE11 asset detail may show the tax-cost
  disclosure block (COMPLETE_WITH_VERIFIED_EVIDENCE, R$ 2.494,96, 180+120
  split, canonical distinction); (2) CTI `DOCUMENTARY_VS_TAX_COST` fact and
  limitation use the enabled wording; (3) any future evidence-backed disposal
  computes with enriched cost + emits the review signal + full trace.
- Canonical states unchanged: ledger INCOMPLETE positions, BLOCKED liabilities,
  tax-blocked reminder, cost reminder counts (KCRE11 still excluded).
- First-disposal requirement: when a `EVIDENCE_TAX_DISPOSAL_REVIEW_REQUIRED`
  signal first appears in API logs, the Owner audits that disposal
  (transactionId/asset/tradeDate/cost/provenance) before trusting downstream
  figures. No per-disposal memory exists by design (no persistence); every
  enriched computation re-logs its signals.
- Rollback: set `TAX_COST_EVIDENCE_ENRICHMENT_ENABLED=false` (or remove the
  line), restart the API dev process, confirm boot line reads DISABLED.
  No data rollback required (nothing is persisted by enrichment).
