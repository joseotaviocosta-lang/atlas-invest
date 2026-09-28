# ADR-259: Adaptadores de Fonte de Input Tributário

## Status

Aceito (Fase 4B.4)

## Contexto

Fontes externas canônicas (corretora, dados oficiais de fundos) podem fornecer
inputs tributários no futuro. É preciso uma fronteira provider-neutral.

## Decisão

1. Contratos `TaxTradeClassificationSourceAdapter`, `TaxWithholdingSourceAdapter`, `FiiTaxEligibilitySourceAdapter`.
2. Payloads canônicos; tipos de provedor nunca cruzam a fronteira.
3. Registro `TaxInputAdapterRegistry`; sem fonte real → **vazio**.
4. Nenhum provedor fictício é introduzido.
5. Importação reusa idempotência/conflito do repositório.
6. Prioridade de fonte não é hardcoded; conflito permanece não resolvido.

## Consequências

- Fundação pronta para ingestão real, sem fabricar integrações.
- Sem vazamento de tipos de provedor.
