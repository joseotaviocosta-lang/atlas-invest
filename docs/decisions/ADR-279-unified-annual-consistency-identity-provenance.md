# ADR-279 (4J1-B): Consistency = Identity + Fingerprint Provenance + Payer Identity

## Status

Aceito (Fase 4J.1)

## Contexto

A detecção de divergência entre regimes precisa ser determinística e não pode
recomputar valores nem fabricar erros falsos. Os read models congelados de 4I
expõem apenas agregados por `(categoria, classificação)` e `payerIds[]` planos —
não há bruto por pagador.

## Decisão

1. A consistência compara **identidade** (ano, exercício), **procedência
   econômica bruta** (fingerprints: `upstreamIncomeFingerprint` de 4I vs
   fingerprint de 4H.4; `upstreamCapitalMarketFingerprint` de 4I vs fingerprint
   de 4H.3) e **identidade de pagador** (comparação de conjuntos de `payerId`).
2. Códigos: `YEAR_MISMATCH`, `EXERCISE_MISMATCH`, `SOURCE_FINGERPRINT_MISMATCH`,
   `PAYER_IDENTITY_MISMATCH`, `STALE_CONFIRMATION`, `CONFLICTING_EVIDENCE`,
   `UPSTREAM_NOT_READY`.
3. **A comparação de valores NÃO é feita por pagador** — é incomputável a partir
   dos read models congelados e levaria a recomputação ou a erros BLOCKING
   falsos. `ANNUAL_AMOUNT_MISMATCH` foi **descartado como bloqueante**; o membro
   do tipo existe apenas para uma variante WARNING (por agregado de categoria,
   via igualdade de string decimal `Money`, nunca float, nunca por pagador) e
   **não é emitido por padrão**.
4. Classificação fiscal legítima diferente para o mesmo fato (ex.: isento vs
   incluído) **nunca** é erro.

## Consequências

- Divergência real (skew de revisão entre 4H e 4I) bloqueia sem recomputar nada.
- Nenhum valor monetário ou id de banco aparece nos textos de inconsistência.
