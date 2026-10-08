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
   de 4H.3) e **identidade de pagador**. A verificação de pagador é
   **unidirecional**: só dispara `PAYER_IDENTITY_MISMATCH` quando 4I referencia
   um pagador AUSENTE do universo de pagadores de 4H.4 (`orphanInHighIncome`),
   que é o único invariante de procedência válido (4I deriva de fatos de 4H). A
   direção inversa — um pagador de renda de 4H.4 ausente do subconjunto
   redutor/evidência de 4I — é **esperada e benigna** (um investidor
   diversificado tem pagadores de dividendos sem evidência corporativa, ou
   pagadores de JCP/FII) e **nunca** é erro.
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
5. **Evidência obsoleta (stale) é correlacionada ao requisito que ela de fato
   satisfaz, por `evidenceType` + escopo — nunca por id bruto nem por "qualquer
   row stale + qualquer requisito aberto".** O `subjectId` do requisito 4I é o
   tax-subject agregado, namespace distinto do `payerId` da evidência; portanto
   não se comparam ids diretamente. Cada row stale é mapeado (via a ingestão
   congelada de 4I) ao código de requisito que alimenta e `STALE_CONFIRMATION`
   só dispara quando ESSE requisito está não-resolvido (≠ SATISFIED/WAIVED):
   `CORPORATE_TAX → CORPORATE_EFFECTIVE_TAX_EVIDENCE` (escopo pagador, exige
   `payerId`), `ANNUAL_ADJUSTMENT_IRPF → ANNUAL_ADJUSTMENT_TAX_DUE` (anual),
   `ANNUAL_INCOME_TOTAL → ANNUAL_INCOME_TOTAL` (anual). Um row obsoleto não
   relacionado (ex.: `ANNUAL_INCOME_TOTAL` já satisfeito pela renda canônica de
   4H) não transforma mais um pacote `REQUIRES_ACTION` em `BLOCKED` quando o
   item aberto real é outro. `evidenceType` desconhecido falha FECHADO.

## Consequências

- Divergência real (skew de revisão entre 4H e 4I) bloqueia sem recomputar nada.
- Nenhum valor monetário ou id de banco aparece nos textos de inconsistência.
