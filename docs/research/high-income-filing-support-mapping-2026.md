# Pesquisa: Mapeamento de Apoio à Declaração — IRPFM Alta Renda (Exercício 2027 / ano-calendário 2026)

**Fase:** 4I.6 — Annual High-Income Filing Support
**Escopo:** registrar cada nota de apoio à declaração enviada pelo registro `HighIncomeReviewFilingRegistry`, seu `FilingMappingStatus` e a referência legal verificada (se houver), demonstrando **0 mapeamentos oficiais de campo da DIRPF não comprovados** e o caveat de rotulagem Exercício 2027 (ano-calendário 2026).

> Nota: o conteúdo oficial consultado foi parafraseado para conformidade com restrições de licenciamento. Os fatos abaixo são resumos, não citações literais.

---

## 1. Freshness Legal e Conclusão de Drift

A verificação de frescor de fontes primárias desta fase está registrada em [`.agents/tasks/phase-4i6-high-income-filing-support/legal-freshness.md`](../../.agents/tasks/phase-4i6-high-income-filing-support/legal-freshness.md).

- **Data de corte/recuperação:** 2025-02-14.
- **Conclusão: `MATERIAL DRIFT: NO`.** Nenhuma regra oficial pós-4I.3 altera materialmente uma semântica congelada de 4I. As fontes primárias **confirmam** (em vez de contradizer) a nomenclatura estatutária, a terminologia de exercício/ano-calendário, o limiar de aplicabilidade e o mapeamento de categorias já congelados em 4I.1–4I.5. Logo, **não há `REAL_4I6_LEGAL_DRIFT`** e nenhuma fórmula congelada foi reaberta.

Fatos confirmados relevantes para a rotulagem de apoio (parafraseados):

- A **Lei nº 15.270/2025** (sancionada em 26/11/2025) altera as Leis nº 9.250/1995 e 9.249/1995, introduzindo a tributação mínima da pessoa física de alta renda (IRPFM) com efeitos a partir de 01/01/2026.
- O **IRPFM** aplica-se pela primeira vez ao **ano-calendário 2026**, declarado no **exercício 2027** (mapeamento ordinário brasileiro ano-calendário Y → exercício Y+1).
- A declaração **IRPF 2026 (ano-calendário 2025)** **não** é afetada pelo regime de tributação mínima.
- O **leiaute oficial dos campos da DIRPF** para o IRPFM do Exercício 2027 **ainda não foi publicado** pela Receita Federal na data de recuperação.

---

## 2. Caveat de Rotulagem (escopo 4I.6, não é drift)

A cópia voltada ao usuário deve apresentar o pacote IRPFM como apoio à declaração do **exercício 2027 (ano-calendário 2026)** e **não** deve implicar que o regime se aplica à declaração IRPF 2026 (ano-calendário 2025). O motor codifica isso via o helper `exerciseLabel()` → `"Exercício 2027 (ano-calendário 2026)"`, carregado na Seção 9 do pacote. Este é um guia de rotulagem consistente com a semântica congelada — não uma mudança nela.

---

## 3. Registro de Notas de Apoio (`HighIncomeReviewFilingRegistry`)

Fonte: `packages/tax-engine/src/annual-irpf/high-income-review-package-registry.ts`. O registro envia **3 notas**; o `FilingMappingStatus` padrão é `GENERAL_SUPPORT`.

| #   | `mappingStatus`       | `legalReference`   | Resumo da nota                                                                                                                                                                     |
| :-- | :-------------------- | :----------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `GENERAL_SUPPORT`     | Lei nº 15.270/2025 | O pacote apoia a revisão da tributação mínima de alta renda (IRPFM) para o Exercício 2027 (ano-calendário 2026); valores são de conferência e não substituem a declaração oficial. |
| 2   | `NO_OFFICIAL_MAPPING` | Lei nº 15.270/2025 | O leiaute oficial dos campos da DIRPF para o IRPFM do Exercício 2027 ainda não foi publicado pela Receita; não há mapeamento campo-a-campo oficial disponível.                     |
| 3   | `GENERAL_SUPPORT`     | Lei nº 9.250/1995  | Conferir rendimentos, créditos e redutor societário por fonte pagadora com o contador antes do preenchimento da declaração anual.                                                  |

---

## 4. Demonstração: Zero Mapeamentos Oficiais Não Comprovados

- Nenhuma das 3 notas possui `mappingStatus === 'VERIFIED_OFFICIAL_MAPPING'`.
- `HighIncomeReviewFilingRegistry.getNotesByStatus('VERIFIED_OFFICIAL_MAPPING')` retorna **0 entradas**.
- A única afirmação sobre o leiaute oficial da DIRPF é explicitamente `NO_OFFICIAL_MAPPING`, refletindo que o leiaute do Exercício 2027 não estava publicado na data de recuperação.
- Portanto o pacote **não** afirma nenhum campo específico da DIRPF como mapeamento oficial verificado, satisfazendo o invariante de "0 mapeamentos oficiais de campo da DIRPF não comprovados". Isto é fiscalizado por teste unitário no `@atlas/tax-engine`.

---

## 5. Fontes Primárias Consultadas

As fontes oficiais e secundárias (RFB — download do PGD IRPF, tabelas 2026, Perguntas & Respostas IRPF 2026, notícia de orientação sobre a redução a partir de 01/01/2026, serviço gov.br de declaração, e análise jurídica da Lei 15.270/2025) estão enumeradas com URLs e datas de recuperação na tabela de `legal-freshness.md` desta tarefa. Esta pesquisa não reabre as fórmulas congeladas de 4I.1–4I.3; serve apenas de base para a rotulagem de apoio da Fase 4I.6.

Conteúdo foi reformulado para conformidade com restrições de licenciamento.
