# Contrato: TaxInputImportAdapter v1 (Fase 4B.4)

Contratos provider-neutral para ingestão futura de inputs tributários (ADR-259).

## Contratos

- `TaxTradeClassificationSourceAdapter`
- `TaxWithholdingSourceAdapter`
- `FiiTaxEligibilitySourceAdapter`

Cada um retorna `TaxInputSourceRecord<TPayload>` com payloads canônicos
(`TradeClassificationPayload`, `WithholdingPayload`, `FiiEligibilityPayload`).

## Regras

1. Tipos específicos de provedor **nunca** cruzam a fronteira; apenas o payload canônico.
2. `TaxInputAdapterRegistry` agrega adapters por tipo.
3. Sem fonte real → registro **vazio** (`EMPTY_TAX_INPUT_ADAPTER_REGISTRY`); nada é fabricado.
4. Decimal exato como string; sem float.
5. Idempotência/conflito via repositório (mesma identidade + fingerprint).
6. Import não resolve conflito manual automaticamente; prioridade de fonte **não** é hardcoded.
7. Proveniência: `provider`, `sourceType`, `sourceReference`, `importId?`, `sourceDocumentReference?`.
