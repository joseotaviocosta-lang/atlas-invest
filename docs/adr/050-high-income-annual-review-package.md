# ADR-050: Pacote Anual de Revisão/Apoio da Tributação Mínima de Alta Renda (IRPFM)

## Status

Aceito (Fase 4I.6)

## Contexto

As Fases 4I.1–4I.5 congelaram a fundação legal/dados (4I.1), o núcleo de cálculo (4I.2), o redutor societário por fonte pagadora (4I.3), a integração anual (4I.4) e a experiência de revisão do usuário na web (4I.5) da tributação mínima da pessoa física de alta renda (IRPFM, Lei 15.270/2025, efeitos a partir de 01/01/2026, primeira aplicação ao ano-calendário 2026 / exercício 2027).

Para encerrar a Fase 4I é necessário um **pacote anual determinístico de revisão/apoio** que ajude o investidor e o contador a entender a aplicabilidade, revisar renda/base/alíquota/bruto/créditos/redutor/líquido, inspecionar evidência e proveniência, detectar pacotes desatualizados, exportar um documento de apoio e reproduzir o mesmo pacote a partir do mesmo estado de origem.

Isto é **apoio à declaração** — não é arquivo oficial da Receita, transmissão de DIRPF, envio de declaração, validação pela Receita, instrumento de pagamento nem gerador de DARF. A verificação de frescor legal desta fase concluiu `MATERIAL DRIFT: NO`, de modo que nenhuma semântica congelada de 4I.1–4I.3 foi reaberta.

## Decisões

1. **Pacote derivado e não-persistido (sem migration):**
   - `HighIncomeReviewPackage` é derivado sob demanda e **nunca** persistido como estado tributário autoritativo. A Fase 4I.6 não introduz nenhuma migration; `prisma migrate status` permanece limpo/sem-pendências/sem-drift (18 migrations). Metadados opcionais de histórico de exportação poderiam, no futuro, ser persistidos apenas se a arquitetura existente suportasse auditoria/download e fossem claramente não-autoritativos — o padrão é **nenhuma persistência**.

2. **Pureza do tax-engine com relógio `generatedAt` injetado:**
   - O montador `buildHighIncomeAnnualReviewPackage` é puro e determinístico e **nunca** chama `Date.now()`/`new Date()`. O `generatedAt` (ISO) é injetado pela camada de aplicação via o token `FISCAL_CLOCK`. Esta é uma divergência intencional do padrão 4H (`AnnualTaxReportingEngine`, que usava `new Date()` internamente): injetar o relógio torna o pacote 100% reproduzível e testável sem relógio real.

3. **Fingerprint SHA-256 que exclui `generatedAt` e é shuffle-invariante:**
   - `packageFingerprint = SHA-256(stableStringify(input))` sobre um input canônico que **exclui** `generatedAt`, `section1Identity` e `section8Provenance`. `stableStringify` ordena chaves lexicograficamente; arrays já são canonicamente ordenados pelo montador. Dois `generatedAt` diferentes sobre o mesmo estado produzem o mesmo fingerprint; qualquer mudança em fonte/cálculo/revisão de evidência o altera. Verificado por fuzz determinístico de ≥ 10.000 casos (seed fixa).

4. **`escapeCsvCell` OWASP compartilhado (extraído):**
   - O escaper CSV privado de `annual-tax-reporting-export.ts` foi extraído para `annual-irpf/csv-escape.ts` (comportamento byte-a-byte idêntico) e reutilizado pelo exportador do pacote de alta renda. O CSV é delimitado por `;`, com CRLF, e carrega o banner + disclaimer compulsórios.

5. **Tipo-mirror de UI sem aresta `@atlas/ui → @atlas/tax-engine`:**
   - `@atlas/ui` declara `RawHighIncomeReviewPackage` como um mirror estrutural mantido à mão (precedente de `RawAnnualHighIncomeAssessment`), sem importar `@atlas/tax-engine`. Um teste de assignability anti-drift garante que o tipo do motor e o mirror da UI não divirjam silenciosamente.

6. **Ano `UNSUPPORTED` de responsabilidade do ruleset do motor (sem janela na API):**
   - A camada da API não impõe janela de anos suportados; ela chama o use-case 4I.4 uma única vez e o motor decide o status. Anos fora da janela resolvem em `200` com `status: UNSUPPORTED` e figuras `null` (sem figuras fabricadas), em vez de um erro.

7. **Exportação CSV + JSON (sem PDF):**
   - Dois formatos de download: CSV (padrão) e JSON. Nenhum gerador de PDF é introduzido. O nome do arquivo é apenas-ano (`atlas-alta-renda-<year>-relatorio-apoio.<ext>`, sem PII); as respostas carregam `Cache-Control: private, no-store` e `Pragma: no-cache`.

8. **Mapeamento de declaração padrão `GENERAL_SUPPORT` com 0 mapeamentos oficiais não comprovados:**
   - O registro `HighIncomeReviewFilingRegistry` envia notas com `FilingMappingStatus` padrão `GENERAL_SUPPORT` e **nenhuma** entrada `VERIFIED_OFFICIAL_MAPPING`, porque o leiaute dos campos da DIRPF para o IRPFM Exercício 2027 não está publicado. Documentado em `docs/research/high-income-filing-support-mapping-2026.md`.

9. **Propriedade derivada do servidor + anti-enumeração 404:**
   - `taxSubjectId` vem exclusivamente do principal autenticado (`@CurrentPrincipal().userId`), nunca do cliente. Recursos de outro contribuinte ou ausentes retornam `404` (nunca `403`). Os UUIDs de PK de evidência do banco (`id`/`supersedesId`) são usados apenas como desempate de ordenação em memória e nunca são serializados; respostas não vazam CPF/token/sessionId/UUID interno/stack.

## Consequências

- O investidor e o contador têm um pacote auditável, reproduzível e fingerprintado para conferência da tributação mínima de alta renda, sem qualquer alegação de transmissão, DARF ou pagamento.
- A pureza do motor e o relógio injetado garantem reprodutibilidade determinística e testabilidade sem banco.
- Conformidade total com o `AGENTS.md`: zero float, zero matemática fiscal no cliente, append-only preservado, isolamento por servidor com 404 anti-enumeração, sem nova migration e sem segundo motor tributário.
- Fiscalizado por `pnpm test:tax-engine`, `test:fiscal-api`, `test:architecture` e `test:web`/`test:web:e2e`.
