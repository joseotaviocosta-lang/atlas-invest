# ADR-305: Tributação Mínima de Alta Renda como Camada Fiscal Anual Derivada

## Contexto

A Lei nº 15.270/2025 (arts. 16-A e 16-B da Lei nº 9.250/1995) instituiu, a partir do ano-calendário
de 2026 (exercício de 2027), uma tributação mínima do Imposto sobre a Renda das Pessoas Físicas
(IRPFM) para contribuintes com rendimentos anuais superiores a R$ 600.000,00. A regra amplia a base
para incluir rendimentos isentos, exclusivos/definitivos e sujeitos à alíquota zero/reduzida, com
exclusões expressas, alíquota de 0% a 10% na faixa de transição e um redutor vinculado à carga
efetiva da pessoa jurídica distribuidora (art. 16-B).

O Project Atlas já produziu, na Fase 4H, fatos anuais autoritativos (posições, resumo de renda
variável, rendimentos de investimento, prontidão, confirmações e pacote de reporte). Esses fatos são
a base confiável para qualquer apuração anual adicional, sem necessidade de reabrir ou duplicar a
semântica já congelada.

## Decisão

1. A tributação mínima de alta renda é uma **camada fiscal anual derivada** (`@atlas/tax-engine`,
   módulo `annual-irpf/high-income`), que **consome** os fatos autoritativos da Fase 4H e **nunca**
   os reinterpreta, recalcula ou muta (Fase 4H permanece baseline imutável).
2. A fundação da Fase 4I.1 realiza exclusivamente **classificação, elegibilidade, seleção de regra,
   avaliação de requisitos de dados e completude**. É terminantemente proibido calcular o valor final
   da tributação mínima, o ajuste anual global, restituição ou obrigação de pagamento nesta fase.
3. Toda regra material deriva de um `HighIncomeMinimumTaxRuleSet` versionado, com `calendarYear`,
   `declarationExercise`, `ruleVersion`, `effectiveFrom`, `effectiveTo` e `officialSourceReferences`
   de **fontes primárias oficiais**. Nenhuma alíquota, limiar ou exclusão legal é hardcoded fora do
   registro de regras.
4. **Ano-calendário ≠ exercício de declaração**: são conceitos tipados distintos e nunca colapsados.
5. **Desconhecido nunca é zero**: fatos não resolvidos produzem `minimumTaxBase = null`, nunca `"0"`.
   Categoria não suportada nunca é silenciosamente incluída ou excluída (`UNSUPPORTED`).
6. **Ausência de evidência falha fechado**: comprovação de transição, elegibilidade de FII e
   evidência da carga efetiva corporativa ausentes rebaixam a aplicabilidade para
   `REQUIRES_CONFIRMATION` (nunca presumem inclusão/exclusão ou zero).
7. A identidade canônica da fonte pagadora (`payerId`) é usada; o nome de exibição nunca é
   identidade.
8. O snapshot de entrada é puro e imutável, com fingerprint SHA-256 determinístico sobre
   serialização canônica; a Fase 4I.1 **não persiste** resultado derivado como fonte da verdade.
9. A IA fiscal permanece `UNSUPPORTED_TAX` com **zero** chamadas a provedores.
10. **LIMIAR DE APLICABILIDADE = RENDA ANUAL TOTAL (OQ-1 resolvido na 4I.1A):** o limiar de
    R$ 600.000,00 mede a **soma de todos os rendimentos recebidos no ano-calendário** (art. 16-A,
    _caput_), e não a base reduzida após as exclusões do § 1º (que rege apenas a alíquota do § 2º).
    A conclusão é suportada pelo texto legal, pelo parecer da comissão do Senado, pela
    “Perguntas e Respostas” da RFB e pelo FAQ oficial do Ministério da Fazenda. O motor expõe
    `eligibilityThresholdMetric = TOTAL_ANNUAL_INCOME`, `minimumTaxBase` e sinaliza divergência
    (`thresholdDivergenceDetected`) sem ocultá-la.

## Consequências

- **Positivas:** determinismo absoluto e auditabilidade; separação estrita entre fatos anuais (4H) e
  camada derivada (4I); conformidade documentada com fontes primárias; base segura para o futuro
  núcleo de cálculo determinístico (4I.2).
- **Negativas:** o valor final da tributação mínima permanece indisponível até a Fase 4I.2; detalhes
  operacionais do regime anual ainda pendentes de regulamentação oficial (registrados como questões
  abertas).
