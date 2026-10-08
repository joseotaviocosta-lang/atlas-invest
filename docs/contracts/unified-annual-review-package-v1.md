# Contrato do Pacote Anual de Revisão/Apoio Unificado do IRPF — v1

**Fase:** 4J.2 — Unified Annual Review Package, Cross-Module Filing Support & Export
**Versão do pacote:** `unified-annual-review-package-v1`
**Status:** Congelado (consome o estado canônico de 4J.1, que consome os contratos congelados de 4H/4I)

---

## 1. Visão Geral e Propósito

Este contrato define a especificação canônica do **Pacote Anual de Revisão/Apoio Unificado do IRPF** (`UnifiedAnnualReviewPackage`), referente a um ano-calendário e seu exercício (`calendarYear`/`calendarYear + 1`).

O pacote é uma camada **determinística, pura e derivada** que organiza, rotula, fingerprinta e serializa o estado unificado já apurado de 4J.1 (`UnifiedAnnualIrpfState`). Ele ajuda o investidor e seu contador a:

1. identificar o ano-calendário e o exercício;
2. ler a prontidão global anual;
3. revisar o resumo por módulo (4H.2–4H.5, 4I);
4. ver pendências de ação agregadas com orientação de apoio;
5. inspecionar inconsistências entre regimes sem correção automática;
6. entender onde cada módulo pode importar para a declaração (apoio geral);
7. exportar um documento de apoio para revisão humana;
8. verificar proveniência/fingerprints;
9. detectar pacotes desatualizados (stale);
10. reproduzir o mesmo pacote a partir do mesmo estado de origem.

Isto é **APOIO À DECLARAÇÃO**. **NÃO É**: arquivo oficial da Receita, transmissão de DIRPF, envio de declaração, validação pela Receita, instrumento de pagamento, DARF, restituição nem confirmação de entrega.

---

## 2. Invariantes Rígidos e Limites de Escopo

1. **PACOTE É DERIVADO E NÃO-AUTORITATIVO:**
   - O pacote é derivado sob demanda a partir de **exatamente um** `UnifiedAnnualIrpfState` carregado uma vez via `UnifiedAnnualIrpfService`. **NÃO** é persistido como estado tributário autoritativo. Nenhuma migration foi introduzida na Fase 4J.2; `prisma migrate status` permanece limpo/sem-pendências/sem-drift.
2. **CONSOME APENAS O ESTADO 4J.1, CARREGADO UMA VEZ:**
   - O serviço de aplicação chama `UnifiedAnnualIrpfService.execute({ taxSubjectId, calendarYear })` **exatamente uma vez** por requisição. O pacote corresponde a exatamente um `annualFingerprint`; corpo e fingerprint nunca divergem. Não re-consulta ledger, portfolio engine, 4H ou 4I de forma independente.
3. **ZERO MATEMÁTICA TRIBUTÁRIA / SEM SEGUNDO MOTOR:**
   - O montador (`buildUnifiedAnnualReviewPackage`) **não** executa aritmética tributária. Ele copia cada campo do estado 4J.1 verbatim para a seção correta e aplica apenas rótulos de apoio de mapas fechados. Não há duplicação de fórmulas de 4H/4I/4J.1.
4. **STATUS DO PACOTE É O STATUS 4J.1 VERBATIM:**
   - `package.status === state.identity.status` sempre. Um estado anual `BLOCKED` nunca produz pacote `READY_FOR_REVIEW`. O pacote nunca é mais otimista que 4J.1.
5. **ZERO FLOAT / DECIMAIS PURAS:**
   - Valores que existam no pacote (fingerprints, contagens inteiras) usam strings ou inteiros. Nenhum `parseFloat`/`Number()`/`+` em regra financeira. (O pacote não carrega valores monetários: resume módulos por status e fingerprints.)
6. **DISCLAIMER E BANNER COMPULSÓRIOS:**
   - Todo pacote carrega `disclaimer === buildUnifiedAnnualReviewDisclaimer(calendarYear, declarationExercise)`. Todo artefato humano exportado carrega verbatim o banner `UNIFIED_ANNUAL_REVIEW_BANNER`:

     > `DOCUMENTO DE APOIO — NÃO É ARQUIVO OFICIAL DA RECEITA FEDERAL`

7. **SEM IDENTIFICADORES INTERNOS:**
   - `taxSubjectId`, UUIDs de banco, CPF, tokens, sessionIds e stacks **nunca** são serializados. Referências de requisito usam apenas a chave semântica e a referência normalizada de 4J.1.
8. **PROPRIEDADE DERIVADA DO SERVIDOR + ANTI-ENUMERAÇÃO 404:**
   - `taxSubjectId` é derivado unicamente do principal autenticado (`@CurrentPrincipal().userId`); nunca é fornecido pelo cliente. Recursos de outro contribuinte ou ausentes retornam `404 Not Found` (nunca `403`).
9. **READY_FOR_REVIEW ≠ DECLARADO/ENVIADO/PAGO:**
   - O status significa apenas que o estado anual está coerente e pronto para conferência humana.

---

## 3. As 8 Seções Canônicas

| #   | Seção                   | Conteúdo                                                                                                                                                                                                                           |
| :-- | :---------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | `sectionAIdentity`      | `calendarYear`, `declarationExercise`, `packageVersion`, `generatedAt` (ecoa o top-level, EXCLUÍDO do fingerprint). Sem `taxSubjectId`.                                                                                            |
| B   | `sectionBReadiness`     | `globalStatus` (cópia verbatim 4J.1), contagens do `summary` 4J.1, `blockingIssueCount`, `requirementCount` (tamanho da lista deduplicada).                                                                                        |
| C   | `sectionCModules`       | Uma linha por módulo 4J.1 em ordem canônica: `module`, `source`, `status`, `authoritative`, `blockingReasons` (ordenadas), `requirementsCount`, `sourceFingerprint`, `calculationFingerprint`, `deepLink` (rota UI ou null).       |
| D   | `sectionDRequirements`  | Requisitos 4J.1 ordenados por chave: `key`, `module`, `category`, `subjectDisplay`, `status`, `blocking` (não `SATISFIED`/`WAIVED`), `blockingReason`, `recommendedAction` (mapa fechado), `deepLink`. Nenhum requisito inventado. |
| E   | `sectionEConsistency`   | Issues 4J.1 ordenadas: `code`, `severity`, `modules` (ordem canônica de módulos), `blocking`, `explanation` e `recommendedAction` (mapa fechado por código). Sem auto-correção.                                                    |
| F   | `sectionFFilingSupport` | `notes[]` do registro (5 `GENERAL_SUPPORT` + 1 `NO_OFFICIAL_MAPPING`, 0 `VERIFIED_OFFICIAL_MAPPING`) + `exerciseLabel` (`"Exercício <ex> (ano-calendário <year>)"`).                                                               |
| G   | `sectionGProvenance`    | `annualFingerprint`, `sourceFingerprint`, `moduleFingerprints[]`, `packageFingerprint` (eco), `packageVersion`, `ruleVersions`.                                                                                                    |
| H   | `sectionHDisclaimer`    | `text` (igual ao `disclaimer` top-level).                                                                                                                                                                                          |

---

## 4. Modelo de Status do Pacote

Cópia verbatim do status global 4J.1 (`UnifiedAnnualStatus`):

`READY_FOR_REVIEW | REQUIRES_ACTION | PARTIAL | BLOCKED | NO_ACTIVITY | UNSUPPORTED`

- Estado anual `BLOCKED` (qualquer módulo material bloqueado ou issue bloqueante) → pacote `BLOCKED`, com issues e pendências incluídas; nenhuma afirmação de prontidão para declaração.
- `HIGH_INCOME` `NOT_APPLICABLE` não bloqueia: pacote geral pronto permanece `READY_FOR_REVIEW`.
- Todos os módulos `NO_ACTIVITY` → pacote `NO_ACTIVITY` (sem alegação falsa de obrigação de declarar).

---

## 5. Taxonomia de Mapeamento de Apoio (`FilingMappingStatus`)

(Reutiliza o vocabulário de 4I.6.)

| Status                      | Significado                                                                                            |
| :-------------------------- | :----------------------------------------------------------------------------------------------------- |
| `VERIFIED_OFFICIAL_MAPPING` | Mapeamento campo-a-campo oficial verificado da DIRPF. **O registro envia 0 entradas com este status.** |
| `GENERAL_SUPPORT`           | Nota de apoio geral de conferência por módulo (padrão).                                                |
| `NO_OFFICIAL_MAPPING`       | Mapeamento campo-a-campo da DIRPF não afirmado (leiaute do Exercício 2027 não publicado).              |
| `UNSUPPORTED`               | Fora de escopo/não suportado (reservado; o registro 4J.2 atual não o emite).                           |

**Invariante de zero mapeamentos oficiais não comprovados:** nenhuma nota afirma ficha/campo específico da DIRPF como `VERIFIED_OFFICIAL_MAPPING`. Ver `docs/research/unified-annual-filing-support-mapping-2026.md`.

**Mapa fechado de ações de pendência** (`module::categoria → ação`, com padrão genérico): rotula 9 seções de prontidão 4H.5 e 3 códigos de evidência 4I; combinações desconhecidas caem no padrão (nunca inventa pendência nem dá conselho fiscal).

---

## 6. Fingerprint

- `packageFingerprint = SHA-256(stableStringify(UnifiedAnnualReviewFingerprintInput))` via `node:crypto` `createHash('sha256')` (reutiliza o `stableStringify` canônico).
- O input **INCLUI**: `packageVersion`, `calendarYear`, `declarationExercise`, `annualFingerprint`, `ruleVersions`, resumos canônicos de módulos, requisitos, issues e notas de apoio.
- O input **EXCLUI**: `generatedAt`, `sectionAIdentity`, `sectionGProvenance`, `disclaimer`/`sectionHDisclaimer`.
- **Determinístico e shuffle-invariante:** módulos em `UNIFIED_MODULE_ORDER`, requisitos por chave, issues por `(code, severity, modules)`, membros de issue em ordem de módulos; mesmo estado → mesmo fingerprint; `generatedAt` diferente → mesmo fingerprint; qualquer revisão de fonte/evidência (via `annualFingerprint`) → fingerprint diferente; `packageVersion` diferente → diferente. Verificado por fuzz determinístico de 20.000 casos (seed fixa) + diferencial de 20.000 casos.

---

## 7. Endpoints da API

Ambos sob `@ApiBearerAuth` + `JwtAuthGuard`; `taxSubjectId = @CurrentPrincipal().userId` (nunca fornecido pelo cliente); `calendarYear` validado por `UnifiedAnnualReviewPackageParamSchema`. Declarados **após** as rotas `high-income/*` e **antes** da rota nua `annual/:calendarYear`, que permanece por último.

### `GET /api/v1/fiscal/annual/:calendarYear/review-package`

- **Resposta 200:** `{ data: UnifiedAnnualReviewPackage }`.
- Erros: `400 VALIDATION.INVALID_INPUT` (parâmetro), `400 FISCAL.INVALID_YEAR` (fora de faixa), `401`, `404` (anti-enumeração), `422 FISCAL.UNIFIED_ANNUAL_INCONSISTENT` (cerca externa), `500`.
- `Cache-Control: private, no-store` em **todas** as respostas (sucesso e erro) via `UnifiedAnnualNoStoreMiddleware` estendido às rotas do pacote.

### `GET /api/v1/fiscal/annual/:calendarYear/review-package/export?format=json|csv`

- `format` opcional validado por `UnifiedAnnualReviewPackageExportQuerySchema` (`z.enum(['json','csv']).optional()`); **padrão `csv`**; inválido → `400 VALIDATION.INVALID_INPUT`.
- Resposta via `@Res({ passthrough: true })` como anexo para download:
  - **Content-Type:** `text/csv; charset=utf-8` (csv) ou `application/json; charset=utf-8` (json).
  - **Content-Disposition:** `attachment; filename="atlas-irpf-<year>-relatorio-apoio.<ext>"` — **apenas o ano** (sem PII), construído a partir do inteiro validado.
  - **Cache-Control:** `private, no-store`; **Pragma:** `no-cache` (em sucesso via handler e em erro via middleware).
- **JSON:** `JSON.stringify` do pacote (preserva `null`, fingerprints, identidades, códigos).
- **CSV:** delimitado por ponto-e-vírgula (`;`), terminações CRLF, OWASP-safe via `escapeCsvCell` compartilhado (prefixo `/^[=+\-@\t\r]/` → aspa inicial; quote-wrap em `;`/`"`/quebra de linha; aspas internas duplicadas). Booleanos como `SIM/NAO`, `null` → `''`. Cabeçalho carrega banner + disclaimer + fingerprints + `Gerado em`.

---

## 8. Web

- Ação de exportação na página anual unificada (`/tax/annual/[year]`): seletor de formato (padrão `csv`), CTA `Exportar relatório anual de apoio` (alvo ≥44px), download via blob com nome do `Content-Disposition` (fallback `atlas-irpf-<year>-relatorio-apoio.<ext>`), foco gerenciado, erro com `role=alert`.
- Aviso de pacote desatualizado (stale) quando o fingerprint em mãos difere do atual — somente estado local de sessão, sem persistência de histórico de pacotes.
- Resumo do pacote (status, módulos, pendências, issues) + deep links existentes; sem duplicar telas 4H/4I; sem matemática fiscal no cliente.

---

## 9. Consultas, Concorrência e Escala

- O serviço chama `UnifiedAnnualIrpfService.execute` **exatamente uma vez** por requisição; a montagem é pura (sem queries). Overhead do pacote sobre o GET unificado: apenas serialização (limitado). Sem loop por módulo/requisito/issue (sem N+1).
- 10 exportações concorrentes do mesmo estado → mesmo `packageFingerprint`.
- Revisão de fonte/evidência durante a geração → pacote coerente (via cerca 4J.1) ou `422` determinístico; nunca pacote cujo corpo divirja do `annualFingerprint`.
- Montagem 10k requisitos/issues/pagadores em milissegundos (sem padrão O(n²)); verificado em harness de escala.
