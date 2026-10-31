# ADR-311: Contextual Tax Intelligence as a Read-Only Layer Above Canonical Tax State

## Contexto

O Atlas possui motores fiscais maduros e fail-closed (4A–4J), avaliações de
prontidão ricas (readiness anual de 9 seções, apuração mensal com reason codes,
15 códigos canônicos de qualidade com rótulos PT-BR) e uma camada de IA
conversacional madura (3Q–3Z, 5U) — mas toda pergunta fiscal aberta é
recusada por lei interna (`UNSUPPORTED_TAX`, provedor 0, AGENTS.md §§48–80).
A página Fiscal mostra O QUÊ (status, números, bloqueios), porém não entrega,
num só lugar, o PORQUÊ priorizado em linguagem simples com próximos passos
ordenados. Existe apenas uma faixa estática ("Entenda a apuração") de
template fixo.

## Decisão

1. Criar uma camada de inteligência tributária **puramente determinística e
   somente-leitura** (sem LLM na v1): fatos canônicos → projeção de explicação
   via templates e regras de prioridade. Nenhum cálculo, nenhuma inferência.
2. A camada consome exclusivamente назначенные fontes: readiness anual/mensal,
   `reasonCode`s, `AnnualEvidenceRequirement[]`, cost assessment documental,
   estado de reminders, status de reconciliação — todos verbatim, com
   `ruleVersions` e fingerprints preservados.
3. **NO_LLM_V1**: nenhuma chamada a provedor. A taxonomia de intenções,
   `extractTaxFacts` e o escopo TAX já escafaldados no `@atlas/ai-engine`
   permanecem desligados do HTTP até ADR própria que emende os invariantes
   congelados (qualquer fiação futura exige reabrir AGENTS.md §§48–80).
4. Saída estruturada `TaxIntelligenceResponse` com blocos tipados
   `FACT / EXPLANATION / RECOMMENDED_NEXT_ACTION / LIMITATION`; confiança
   determinística (`CONFIRMED/PARTIAL/BLOCKED/UNKNOWN`), nunca percentuais.
5. Prioridade determinística por escore (bloqueia cálculo? afeta competência
   atual? acionável pelo titular? depende de documento externo? espalhamento?).
6. Ações apenas allowlisted para rotas existentes. Primeira superfície: extensão
   determinística da faixa "Entenda a apuração" no `TaxDashboardSummaryCard`
   (`/tax`); sem chat genérico primeiro.
7. Falha segura: `INSUFFICIENT_CANONICAL_CONTEXT` + fallback fixo; nunca alucinar.

## Alternativas

- **B (híbrida fatos + redação LLM)**: rejeitada na v1 — exigiria emendar lei
  congelada, novo modelo de ameaças (prompt injection em contexto fiscal,
  vazamento via telemetria, custo/latência) sem valor provado sobre templates.
- **C (chat genérico sobre estado fiscal)**: rejeitada — sem controle de
  prioridade determinística, sem auditabilidade de afirmações, contradiz a
  política fiscal narrow já homologada.

## Consequências

- **Positivas:** 80%+ do valor (explicar bloqueios, priorizar, rotear) sem novo
  risco; testabilidade total (golden/adversarial determinísticos); zero
  persistência (48→48); reutiliza códigos e rótulos canônicos — nada duplicado.
- **Negativas:** redação menos fluida que LLM; casos ambíguos caem no fallback
  em vez de "tentar ajudar"; reabrir LLM depois custa uma ADR de emenda.

## Invariantes de segurança (I1–I10)

I1 não altera resultado fiscal; I2 não converte PARTIAL/BLOCKED em COMPLETE;
I3 não fabrica custo; I4 não infere tipo de operação; I5 não infere data de
evento; I6 não cria instrução de DARF/pagamento sem resultado canônico que a
suporte; I7 ações só para rotas seguras existentes; I8 preserva limitações;
I9 redação nunca sobrescreve códigos de bloqueio canônicos; I10 portfólio
somente-leitura durante a geração.

## Estratégia de provedor e grounding

Provedor: nenhum na v1 (`providerCallCount = 0` por construção — não há chamada
a implementar). Se um dia houver: apenas fatos agregados (tickers, quantidades
estritas, status, códigos), nunca PII/CPF/documentos brutos/histórico completo;
orçamento de contexto e telemetria mínima seguem o padrão 3V/44; grounding
somente em fatos selecionados com citações valid fail-closed (padrão 3T).

## Extensões futuras

CTI-1 (contexto + API determinísticos) → CTI-2 (superfície no Fiscal) →
CTI-3 (deep-links dos reminders) → CTI-4 (redação LLM somente se justificada,
com ADR de emenda).
