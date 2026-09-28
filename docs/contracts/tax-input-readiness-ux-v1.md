# Contrato: TaxInputReadinessUx v1 (Fase 4B.4)

A prontidão distingue **três** estados independentes (ADR-261):

1. **Dados disponíveis** — inputs canônicos (`tradeClassificationStatus`, `withholdingStatus`, `fiiMetadataStatus`).
2. **Regras tributárias disponíveis** — `ruleCoverage` (`AVAILABLE | UNAVAILABLE`), `productionVerifiedRuleCount`.
3. **Apuração disponível** — `liabilityStatus` (`AVAILABLE | BLOCKED`).

## Regras

1. Dados completos **não** implicam regras disponíveis nem apuração disponível.
2. `productionTaxLiabilityEnabled` permanece `false` enquanto não houver regra de produção verificada.
3. Copy factual; nunca "Imposto pronto".
4. A seção "Dados necessários para apuração" oferece ações manuais quando o input falta (apenas fluxos suportados).
5. Conflitos aparecem como pendência (`PARTIAL`), nunca `COMPLETE`.
6. UI não calcula imposto.
