# Contrato: OfficialLateFeeSnapshot v1 (Fase 4D.2)

Snapshot imutável e versionado do resultado oficial de multa do Sicalc/RFB.
Autoridade para o cálculo sensível ao dia útil de início (ADR-271).

## Estrutura

```
{
  id, municipalityCode, dueDate, paymentDate,
  principalAmount, lateFeeAmount, lateFeePercent, startBusinessDate?,
  sourceSystem: "SICALC", sourceReference,
  sourceRetrievedAt, verifiedAt, version, fingerprint
}
```

## Identidade

`(municipalityCode, dueDate, paymentDate, principalAmount, version)`.

## Regras

1. Imutável; novo resultado oficial → nova versão.
2. O motor local recalcula a multa a partir do percentual oficial e exige
   **paridade** com `lateFeeAmount`; divergência → `AUTHORITY_PARITY_MISMATCH`
   (falha fechada).
3. Ausência de snapshot → `MISSING_LATE_FEE_AUTHORITY` (falha fechada).
4. Nenhum calendário de feriados é implementado no Atlas.
