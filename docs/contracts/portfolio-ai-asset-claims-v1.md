# Portfolio AI Asset Claims Contract (v1)

Contract: `PORTFOLIO_AI_ASSET_CLAIMS_V1`  
Schema Version: `1`  
Package: `@atlas/ai-engine`  
Phase: `3W`  
Status: `APPROVED`

---

## 1. Overview and Invariants

The **Asset Claims Contract** enforces factual citation integrity for generative statements referring to an individual asset.

### Invariants:

1. **Cross-Asset Evidence Prohibition**: When a request is scoped to `targetAssetId`, no claim may cite facts belonging to another asset (`fact.assetId !== targetAssetId` or `ASSET:<otherId>.*`). Any cross-asset citation triggers `CROSS_ASSET_EVIDENCE_PROHIBITED` and fails closed.
2. **Authoritative Value Rendering**: Model text cannot contain raw financial literals for metrics. Metric amounts are strictly server-rendered from canonical grounded facts.
3. **Currency Consistency**: Asset claims citing monetary facts must adhere to the asset's canonical currency. Cross-currency pollution triggers `CURRENCY_MISMATCH`.
4. **Unavailable Fact Rejection**: Facts with status `UNAVAILABLE` or null value cannot be presented as factual numbers in `FACT_VALUE` segments (`UNAVAILABLE_FACT_VALUE`).
