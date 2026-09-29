# ADR-271: Snapshot Oficial de Multa como Autoridade

## Status

Aceito (Fase 4D.2)

## Contexto

O início da multa depende de dias úteis (feriados municipais/estaduais/
nacionais). Reconstruir esse calendário seria fail-open.

## Decisão

1. `OfficialLateFeeSnapshot` é imutável e versionado.
2. Identidade: `(municipalityCode, dueDate, paymentDate, principalAmount, version)`.
3. O motor local recalcula a multa a partir do percentual oficial e exige
   paridade com o valor oficial; divergência → `BLOCKED`
   (`AUTHORITY_PARITY_MISMATCH`).
4. Ausência → `BLOCKED` (`MISSING_LATE_FEE_AUTHORITY`).

## Consequências

- Autoridade oficial para a parte sensível a dia útil.
- Nenhum calendário genérico no Atlas.
