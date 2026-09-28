# ADR-254: Persistência de Inputs Tributários Canônicos

## Status

Aceito (Fase 4B.3)

## Contexto

Os modelos da 4B.2 existiam apenas em memória (provider vazio). Regras futuras
precisam de inputs persistidos, auditáveis e rastreáveis.

## Decisão

1. Três tabelas aditivas persistem classificação de operação, retenção/IRRF e metadados de FII.
2. Cada registro tem identidade estável, escopo de sujeito, `sourceType`/`sourceReference`, fingerprint e proveniência.
3. As linhas imutáveis de `transactions` **nunca** são alteradas; os inputs apenas referenciam `transactionId`/`assetId`.
4. Valores exatos (`DECIMAL(38,18)`); `amount` nulo quando `UNKNOWN`.
5. A prontidão (`GET /api/v1/fiscal/inputs/:competence`) passa a ler dados persistidos.
6. Nenhuma regra de produção é adicionada; a responsabilidade tributária real permanece desabilitada.

## Consequências

- Inputs reais, auditáveis e idempotentes.
- Base pronta para regras verificadas futuras, sem heurística.
