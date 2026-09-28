# Contrato: FiiTaxEligibilityFacts v1 (Fase 4B.2)

Fatos factuais de condição tributária de FII. **Input factual**, não tratamento
tributário (ADR-251). O motor não decide isenção/tributação aqui.

## Estrutura

```
{
  assetId, asOfDate,
  holderCount?, investorOwnershipPercent?, isExchangeTraded?,
  source, status, provenance
}
```

## Status

`KNOWN | PARTIAL | UNKNOWN`

## Fontes

`OFFICIAL_FUND_DATA | BROKER_IMPORT | MANUAL_CONFIRMED | OTHER_CANONICAL`

## Regras

1. `KNOWN` exige `holderCount`, `investorOwnershipPercent` e `isExchangeTraded`.
2. `UNKNOWN` **não** carrega valores (proibido adivinhar).
3. `holderCount` é inteiro ≥ 0; `investorOwnershipPercent` é decimal exato em `[0, 100]`
   (sem float, sem mutação de precisão).
4. `asOfDate` é explícito: metadado atual não é verdade histórica automática.
5. Tratamento sensível à data deve avaliar a condição na data relevante (fase futura).
6. Valores conflitantes (importado vs manual) geram `CONFLICT`; nunca escolha silenciosa.
7. Aquisição de dados externos ocorre **fora** do Tax Engine (offline/puro).

## Estado atual

O modelo de ativo do Atlas não contém contagem de cotistas, percentual de
titularidade nem status de negociação em bolsa. Portanto, na ausência de input
canônico, o metadado permanece `MISSING/UNKNOWN`.
