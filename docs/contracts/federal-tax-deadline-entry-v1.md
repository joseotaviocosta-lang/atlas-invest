# Contrato: FederalTaxDeadlineEntry v1 (Fase 4C.2)

Entrada imutável e versionada do registro oficial de vencimentos tributários
federais. Autoridade primária de prazo da Fase 4C (ADR-262).

## Estrutura

```
{
  id, revenueCode, taxBucket, competence, dueDate,
  status: VERIFIED | SUPERSEDED | REVOKED,
  sourceAuthority, sourceDocument, sourceReference,
  sourcePublishedAt, verifiedAt, version, supersedesEntryId?, metadata?
}
```

## Identidade

`(revenueCode, competence, version)`. No máximo **uma** entrada `VERIFIED`
ativa por `(revenueCode, competence)` — garantida por índice único parcial no
banco.

## Regras

1. **Imutabilidade:** uma versão publicada nunca é mutada; correção da Receita
   cria nova versão e marca a anterior `SUPERSEDED` (ADR-263).
2. **Resolução determinística:** apenas `VERIFIED` resolve; `SUPERSEDED`/
   `REVOKED` são ignoradas.
3. **Falha fechada:** zero `VERIFIED` → `MISSING_OFFICIAL_DEADLINE`; mais de uma
   → `AMBIGUOUS_OFFICIAL_DEADLINE`.
4. **Sem calendário genérico:** o vencimento é a data oficial já resolvida, não
   uma reconstrução de "dia útil" (ADR-268).
5. **Datas civis** `YYYY-MM-DD`; sem fuso horário.

## Estado atual

Entradas de produção (`6015`): competência `2026-08` → `2026-09-30`
(ADE CORAT nº 63/2026); `2026-09` → `2026-10-30` (ADE CORAT nº 78/2026);
`2025-07` → `2025-08-29` (Agenda Tributária ago/2025).
