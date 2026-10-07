# Contrato do Pacote Anual de Revisão/Apoio de Alta Renda (IRPFM) — v1

**Fase:** 4I.6 — Annual High-Income Filing Support, Review Package & Final 4I Hardening
**Versão do pacote:** `high-income-annual-review-package-v1`
**Status:** Congelado (consome os contratos congelados de 4I.1–4I.5)

---

## 1. Visão Geral e Propósito

Este contrato define a especificação canônica do **Pacote Anual de Revisão/Apoio da Tributação Mínima de Alta Renda** (`HighIncomeReviewPackage`, IRPFM — Lei 15.270/2025), referente ao **Exercício 2027 (ano-calendário 2026)**.

O pacote é uma camada **determinística, pura e derivada** que organiza, rotula, fingerprinta e serializa o resultado já apurado da apuração anual 4I.4 (`AnnualHighIncomeAssessmentReadModel`). Ele ajuda o investidor e seu contador a:

1. entender a aplicabilidade;
2. revisar a renda anual total;
3. revisar a base da tributação mínima;
4. revisar a alíquota aplicável;
5. revisar o tributo mínimo bruto;
6. revisar créditos;
7. revisar o redutor societário;
8. revisar o tributo mínimo líquido quando autoritativo;
9. ver evidência incompleta/bloqueante;
10. inspecionar a evidência do redutor fonte-a-fonte (payer-by-payer);
11. entender o que pode ser relevante para a declaração anual;
12. exportar um documento de apoio para revisão humana;
13. verificar proveniência/fingerprints;
14. detectar pacotes desatualizados (stale);
15. reproduzir o mesmo pacote a partir do mesmo estado de origem.

Isto é **APOIO À DECLARAÇÃO**. **NÃO É**: arquivo oficial da Receita, transmissão de DIRPF, envio de declaração, validação pela Receita, instrumento de pagamento nem gerador de DARF.

---

## 2. Invariantes Rígidos e Limites de Escopo

1. **PACOTE É DERIVADO E NÃO-AUTORITATIVO:**
   - O pacote é derivado sob demanda. **NÃO** é persistido como estado tributário autoritativo. Nenhuma migration foi introduzida na Fase 4I.6; `prisma migrate status` permanece limpo/sem-pendências/sem-drift (18 migrations).
2. **CONSOME APENAS O MODELO DE LEITURA 4I.4, CARREGADO UMA VEZ:**
   - O serviço de aplicação chama `GetAnnualHighIncomeAssessmentUseCase.execute({ taxSubjectId, calendarYear })` **exatamente uma vez** por requisição (shape de queries invariante à contagem de pagadores/fatos; sem N+1). Não re-consulta nem recomputa cada categoria de domínio independentemente.
3. **ZERO MATEMÁTICA TRIBUTÁRIA / SEM SEGUNDO MOTOR:**
   - O montador (`buildHighIncomeAnnualReviewPackage`) **não** executa aritmética tributária. Ele copia cada campo do modelo de leitura verbatim para a seção correta. Não há duplicação de fórmulas de 4I.1–4I.5.
4. **ZERO FLOAT / DECIMAIS PURAS:**
   - Todos os valores monetários, quantidades e percentuais são strings decimais canônicas ou `null`. `number` é usado **exclusivamente** em contadores inteiros (ex.: `itemCount`, contagens da Seção 7, `calendarYear`, `declarationExercise`, `revision`). Nenhum `parseFloat`/`Number()`/`+` em regra financeira.
5. **DISCLAIMER E BANNER COMPULSÓRIOS:**
   - Todo pacote carrega `disclaimer === HIGH_INCOME_REVIEW_DISCLAIMER`. Todo artefato humano exportado carrega verbatim o banner `HIGH_INCOME_REVIEW_BANNER`:

     > `DOCUMENTO DE APOIO — NÃO É ARQUIVO OFICIAL DA RECEITA FEDERAL`

     O disclaimer completo:

     > `DOCUMENTO DE APOIO — NÃO É ARQUIVO OFICIAL DA RECEITA FEDERAL. Pacote de revisão e conferência da tributação mínima de alta renda (IRPFM, Lei 15.270/2025), referente ao Exercício 2027 (ano-calendário 2026). Não constitui transmissão, validação ou aceitação pela Receita Federal, não é DIRPF, DARF, pagamento, restituição nem declaração enviada.`
6. **UUIDs DE EVIDÊNCIA DO BANCO NUNCA VAZAM:**
   - `evidence[].id` e `evidence[].supersedesId` (UUIDs de PK do banco) são usados **apenas** como desempate de ordenação em memória e **nunca** são serializados. As linhas da Seção 7 expõem apenas `rowKey = ${evidenceType}:${payerId ?? '_ANNUAL_'}:${revision}` — sem `id`/`supersedesId`.
7. **PROPRIEDADE DERIVADA DO SERVIDOR + ANTI-ENUMERAÇÃO 404:**
   - `taxSubjectId` é derivado unicamente do principal autenticado (`@CurrentPrincipal().userId`); nunca é fornecido pelo cliente. Recursos de outro contribuinte ou ausentes retornam `404 Not Found` (nunca `403`). Respostas não vazam CPF, token, sessionId, UUID interno nem stack trace.
8. **READY_FOR_REVIEW ≠ DECLARADO/ENVIADO/PAGO:**
   - O status `READY_FOR_REVIEW` significa apenas que o líquido é autoritativo e pronto para conferência humana. Não implica declaração transmitida, submetida ou paga.

---

## 3. As 9 Seções Canônicas

| #   | Seção                             | Conteúdo                                                                                                                                                                                                                                           |
| :-- | :-------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `section1Identity`                | `calendarYear`, `declarationExercise` (verbatim do modelo, nunca re-derivado), `ruleVersion`, `generatedAt` (ecoa o top-level, EXCLUÍDO do fingerprint), `packageVersion`.                                                                         |
| 2   | `section2Applicability`           | `status` (enum congelado), `totalAnnualIncome` (`null` quando desconhecido), `eligibilityThreshold`, `thresholdMetric === HIGH_INCOME_MINIMUM_TAX_THRESHOLD_METRIC`, `applicable` (switch fechado + null-override fail-closed), `blockingReasons`. |
| 3   | `section3IncomeComposition`       | `rows[]` verbatim do `incomeBreakdown`; **nenhuma soma cross-row/cross-category**; não expõe total de renda além do `totalAnnualIncome` verbatim (que vive na Seção 2).                                                                            |
| 4   | `section4Calculation`             | base, faixa, alíquota mínima, bruto, totais de créditos/reduções suportados, `corporateRedutorSupportedTotal`, `netMinimumTax` (**`null` salvo `READY_FOR_REVIEW`**), `creditExcess`, `netIsAuthoritative`.                                        |
| 5   | `section5Credits`                 | linhas de `credits[]` e `reductions[]` verbatim + totais suportados.                                                                                                                                                                               |
| 6   | `section6CorporateRedutorByPayer` | regra de dois ramos presente/ausente; quando `corporateRedutor === null` → `present: false` com defaults nulos/vazios; senão copia verbatim (nunca transforma um total `null` em `'0'`), com uma linha por pagador ordenada por `payerId ASC`.     |
| 7   | `section7Readiness`               | `counts` (partição `total === ready + missing + stale + conflicting + unsupported`), `requirements[]` e `evidence[]` (sem `id`/`supersedesId`).                                                                                                    |
| 8   | `section8Provenance`              | fingerprints upstream (mercado 4H, renda 4H), status da renda, fonte/cálculo 4I, fingerprints do redutor societário e `packageFingerprint` (eco do top-level).                                                                                     |
| 9   | `section9FilingSupportNotes`      | `notes[]` do registro de mapeamento + `exerciseLabel` (`"Exercício 2027 (ano-calendário 2026)"`).                                                                                                                                                  |

---

## 4. Modelo de Status do Pacote (`ReviewPackageStatus`)

Precedência top-down (closed switch sobre o enum de aplicabilidade congelado):

1. `UNSUPPORTED` — `applicability === 'UNSUPPORTED_YEAR'` (ano fora da janela suportada; sem figuras fabricadas).
2. `BLOCKED` — `status === 'BLOCKED'` **ou** `applicability === 'BLOCKED'` **ou** `upstreamIncomeStatus === 'BLOCKED'` **ou** `blockingReasons.length > 0`.
3. `NOT_APPLICABLE` — `applicability === 'NOT_APPLICABLE'` (abaixo do limiar).
4. `READY_FOR_REVIEW` — `applicability === 'APPLICABLE'` **e** `netMinimumTax !== null`.
5. `INCOMPLETE` — caso contrário (aplicável/calculável mas líquido não autoritativo).

`netMinimumTax` só é exposto na Seção 4 quando `status === 'READY_FOR_REVIEW'`; `netIsAuthoritative` espelha isso. A **janela de anos suportados é de responsabilidade exclusiva do ruleset do motor** — não há janela na camada da API.

---

## 5. Taxonomia de Mapeamento de Declaração (`FilingMappingStatus`)

| Status                      | Significado                                                                                            |
| :-------------------------- | :----------------------------------------------------------------------------------------------------- |
| `VERIFIED_OFFICIAL_MAPPING` | Mapeamento campo-a-campo oficial verificado da DIRPF. **O registro envia 0 entradas com este status.** |
| `GENERAL_SUPPORT`           | Nota de apoio geral de conferência (padrão).                                                           |
| `NO_OFFICIAL_MAPPING`       | Leiaute oficial dos campos da DIRPF para o IRPFM Exercício 2027 ainda não publicado pela Receita.      |
| `UNSUPPORTED`               | Fora de escopo/não suportado.                                                                          |

**Invariante de zero mapeamentos oficiais não comprovados:** nenhuma nota afirma um campo específico da DIRPF como `VERIFIED_OFFICIAL_MAPPING`, pois o leiaute do IRPFM do Exercício 2027 não está publicado na data de recuperação. Ver `docs/research/high-income-filing-support-mapping-2026.md`.

---

## 6. Fingerprint

- `packageFingerprint = SHA-256(stableStringify(HighIncomeReviewFingerprintInput))` via `node:crypto` `createHash('sha256')`.
- O input do fingerprint **EXCLUI** `generatedAt`, `section1Identity` e `section8Provenance`.
- `stableStringify` ordena chaves de objeto lexicograficamente; arrays mantêm a ordem já canonicamente ordenada pelo montador (pagadores por `payerId ASC`; breakdown por `category`+`classification`; evidência por `(evidenceType, payerKey, revision)` com `id` de banco apenas como desempate em memória).
- **Determinístico e shuffle-invariante:** o mesmo estado de origem produz o mesmo fingerprint independentemente da ordem dos arrays de entrada; dois `generatedAt` diferentes produzem o mesmo fingerprint; qualquer mudança em fonte/cálculo/revisão de evidência muda o fingerprint. Verificado por fuzz determinístico de ≥ 10.000 casos (seed fixa).

---

## 7. Endpoints da API

Ambos sob `@ApiBearerAuth` + `JwtAuthGuard`; `taxSubjectId = @CurrentPrincipal().userId` (nunca fornecido pelo cliente); `calendarYear` validado por `AnnualHighIncomeParamSchema`.

### `GET /api/v1/fiscal/annual/:calendarYear/high-income/review`

- **Resposta 200:** `{ data: HighIncomeReviewPackage }`.

### `GET /api/v1/fiscal/annual/:calendarYear/high-income/export?format=json|csv`

- `format` opcional validado por `HighIncomeExportQuerySchema` (`z.enum(['json','csv']).optional()`); **padrão `csv`**.
- Resposta via `@Res({ passthrough: true })` como anexo para download:
  - **Content-Type:** `text/csv; charset=utf-8` (csv) ou `application/json; charset=utf-8` (json).
  - **Content-Disposition:** `attachment; filename="atlas-alta-renda-<year>-relatorio-apoio.<ext>"` — **apenas o ano** (sem PII), construído a partir do inteiro validado.
  - **Cache-Control:** `private, no-store`; **Pragma:** `no-cache` (em ambas as respostas de exportação).
- **CSV:** delimitado por ponto-e-vírgula (`;`), terminações de linha CRLF, OWASP-safe via `escapeCsvCell` compartilhado (prefixo `/^[=+\-@\t\r]/` → aspa inicial; quote-wrap em `;`/`"`/quebra de linha; aspas internas duplicadas). Cabeçalho carrega o banner + disclaimer completos.

### Mapeamento de erros (reutiliza o `GlobalExceptionFilter` fiscal)

| Condição                                    | HTTP  | code                                              |
| :------------------------------------------ | :---- | :------------------------------------------------ |
| Ano inválido                                | `400` | `FISCAL.INVALID_YEAR`                             |
| Formato inválido                            | `400` | `VALIDATION.INVALID_INPUT`                        |
| Corrida de origem/evidência durante o build | `400` | `FISCAL.SNAPSHOT_INCONSISTENT`                    |
| Não autenticado                             | `401` | `AUTH.*`                                          |
| Recurso de outro contribuinte/ausente       | `404` | anti-enumeração (nunca `403`)                     |
| Ano não suportado (ex.: 2028+/pré-2026)     | `200` | pacote com `status: UNSUPPORTED` e figuras `null` |

---

## 8. Tabela Null vs Zero vs N/A vs Unsupported vs Blocked

| Situação                                                     | Serialização                                                  | Rótulo na UI           |
| :----------------------------------------------------------- | :------------------------------------------------------------ | :--------------------- |
| Valor desconhecido/indeterminado                             | `null`                                                        | `—` / `Não disponível` |
| Zero autoritativo (ex.: redutor zero com evidência completa) | `"0.00"`                                                      | `R$ 0,00`              |
| Não aplicável (abaixo do limiar)                             | `status: NOT_APPLICABLE`; figuras `null`                      | `Não aplicável`        |
| Ano não suportado                                            | `status: UNSUPPORTED`; figuras `null`                         | `Não suportado`        |
| Bloqueado (upstream/ledger)                                  | `status: BLOCKED`; `netMinimumTax: null`; `blockingReasons[]` | `Bloqueado` + motivos  |
| Líquido não autoritativo                                     | `netMinimumTax: null`, `netIsAuthoritative: false`            | `—`                    |

Desconhecido **nunca** é renderizado como `0`/`R$ 0,00`. Zero autoritativo **nunca** é confundido com desconhecido.

---

## 9. Símbolos Públicos (`@atlas/tax-engine`)

- `HIGH_INCOME_REVIEW_PACKAGE_VERSION`, `HIGH_INCOME_REVIEW_DISCLAIMER`, `HIGH_INCOME_REVIEW_BANNER`
- `buildHighIncomeAnnualReviewPackage(readModel, { generatedAt })`, `computeHighIncomeReviewPackageFingerprint`, `stableStringify`
- `exportHighIncomeReviewPackageToCsv(pkg)`, `serializeHighIncomeReviewPackageToJson(pkg)`
- `HighIncomeReviewFilingRegistry`, `exerciseLabel()`
- `escapeCsvCell(val)` (escaper OWASP compartilhado, extraído de `annual-tax-reporting-export.ts`)
- Tipos: `ReviewPackageStatus`, `FilingMappingStatus`, `FilingSupportNote`, `HighIncomeReviewPackage`, `Section1Identity`…`Section9FilingSupportNotes`, e os tipos de input `HighIncomeReviewAssessmentInput` et al.

Mirror desacoplado em `@atlas/ui` (`RawHighIncomeReviewPackage` + `formatHighIncomeReviewPackageViewModel` + `highIncomeReviewPackageQueryKey`): `@atlas/ui` **não** importa `@atlas/tax-engine`; a compatibilidade estrutural é fiscalizada por um teste de assignability anti-drift.
