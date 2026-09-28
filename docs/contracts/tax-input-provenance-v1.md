# Contrato: TaxInputProvenance v1 (Fase 4B.3)

Todo input tributário persistido expõe proveniência (ADR-256).

## Campos

- `sourceType` — origem canônica (enum por entidade).
- `sourceReference` — referência estável da origem (≤ 255 chars).
- `provenance` (JSONB) — `source`, `sourceReference`, `recordedAt`, `manualConfirmedAt?`, `effectiveCompetence?`.
- `createdAt`, `confirmedAt?`.

## Regras

1. Manual: `sourceType = MANUAL*` + `confirmedAt` obrigatório; sem sobrescrever importado sem conflito.
2. Importado: referência a origem/arquivo/documento quando disponível.
3. Fingerprint SHA-256 determinístico (mesma entrada lógica → mesmo fingerprint); sem serialização float.
4. Telemetria/logs: nunca registrar valores financeiros, `assetId`, `transactionId` ou `sourceReference`.
5. Texto de origem tratado como dado simples (sem HTML executável).
