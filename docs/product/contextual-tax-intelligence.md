# Contextual Tax Intelligence (CTI) — Contrato de Produto e Arquitetura

Fase de design (sem implementação). Camada determinística e somente-leitura
acima do estado fiscal canônico. ADR-311.

## 1. Product job

**Problema (validado no repositório):** a página Fiscal mostra O QUÊ — status
da apuração, números, selos de bloqueio, listas de pendências — mas não entrega,
num só lugar, o PORQUÊ priorizado em linguagem simples com os próximos passos
ordenados. O elemento mais próximo ("Entenda a apuração", faixa estática no
`TaxDashboardSummaryCard`) é um template fixo que não reflete os `reasonCode`s
vivos, as pendências de inputs nem a ordem do que resolver primeiro.

**Job:** transformar estado fiscal canônico + bloqueios de qualidade de dados
em explicações claras, priorizadas e acionáveis — sem alterar nenhum cálculo.

**Não-metas (v1, proibido):** planejamento/elisão fiscal; recomendação de
compra/venda/trade; escrita fiscal automática; emissão de DARF; parecer
jurídico/contábil; estimar custo zero; inferir tipo de operação, data de
evento ou subscrição como fato; afirmar `"você deve R$ X"` sem resultado
canônico COMPLETE que o suporte.

## 2. Hierarquia de fontes

- **NÍVEL 1 — canônico:** resultado do tax engine, readiness (anual/mensal),
  replay, ledger, evidência VERIFIED, estado oficial (prazos RFB, rule sets).
- **NÍVEL 2 — fatos derivados:** cost assessment documental, estado de
  reminders, reconciliação 38/40, data-quality.
- **NÍVEL 3 — explicativo:** transformação legível de 1–2 (esta camada).
- **NÍVEL 4 — generativo:** DESLIGADO na v1 (exige ADR de emenda aos
  invariantes `UNSUPPORTED_TAX` congelados em AGENTS.md §§48–80).

## 3. Contrato de entrada — `TaxIntelligenceContext`

```ts
interface TaxIntelligenceContext {
  portfolioId: string;            // escopo; titular deriva do principal
  competence: string;             // YYYY-MM (mensal) ou ano-calendário
  monthlyStatus: 'COMPLETE' | 'PARTIAL' | 'BLOCKED' | 'NO_ACTIVITY' | 'EMPTY';
  monthlyReasonCode: string | null;      // ex.: ELECTION_REQUIRED
  monthlyQualityIssues: string[];        // códigos FISCAL_DATA_QUALITY_ISSUES
  annualOverall: 'READY' | 'PARTIAL' | 'REQUIRES_CONFIRMATION' | 'BLOCKED' | 'NO_ACTIVITY';
  annualRequirements: Array<{            // AnnualEvidenceRequirement (verbatim)
    requirementId: string; section: string; status: 'PENDING' | 'SATISFIED' | 'WAIVED' | 'STALE';
    title: string; description: string; blockingReason: string | null;
  }>;
  costCoverage: {                        // CostBasisAssessment (por escopo relevante)
    scopeCountIncomplete: number; scopeCountComplete: number;
    kcre11LikeCompleteButTaxBlocked: boolean;
  };
  ruleCoverage: { ruleSetVersion: string | null; status: 'VERIFIED' | 'TEST_ONLY' | null;
    effectiveFrom: string | null; legalSourceId: string | null };
  reconciliation: { matched: number; total: number };   // 38/40
  evidenceState: { reviewRequiredCount: number };        // linhas atuais apenas
  sourceFreshness: { asOf: string; competence: string; lastReplayAt: string };
}
```

Regras: objetos crus do banco nunca entram; só tipos estreitos; decimais como
strings exatas; `null` (desconhecido) jamais vira `"0"`.

## 4. Contrato de saída — `TaxIntelligenceResponse`

```ts
interface TaxIntelligenceResponse {
  status: 'CONFIRMED' | 'PARTIAL' | 'BLOCKED' | 'UNKNOWN';
  headline: string;                      // 1 linha, factual
  summary: string;                       // 2–4 linhas
  facts: Array<{ code: string; label: string; value: string; source: FactSource }>;
  blockers: Array<{ code: string; category: BlockerCategory; label: string;
    detail: string; priority: number }>;
  actions: Array<{ actionId: AllowlistedActionId; label: string; priority: number }>;
  limitations: string[];                 // sempre presente quando não-COMPLETE
  sources: Array<{ kind: 'LEDGER' | 'TAX_ENGINE' | 'VERIFIED_EVIDENCE' | 'B3_REPORT' | 'OFFICIAL_RULE';
    reference: string }>;
  generatedAt: string;
}
type FactSource = 'CANONICAL' | 'DERIVED';
```

Todo bloco de saída é rotulado: fato, explicação, ação ou limitação — nunca
misturados num parágrafo ambíguo.

## 5. Taxonomia de bloqueios (reutilizar códigos canônicos — não inventar)

| Categoria de inteligência | Códigos canônicos mapeados |
|---|---|
| `COST_BASIS_INCOMPLETE` | `UNKNOWN_COST_BASIS`, `MISSING_CANONICAL_COST_BASIS`, `UNKNOWN_OPENING_COST_BASIS`, `INCOMPLETE_ANNUAL_POSITION_COST` |
| `MISSING_RULE_SET` | `MISSING_RULE_SET`, `AMBIGUOUS_RULE_SET` |
| `MISSING_WITHHOLDING_DATA` | `INCOMPLETE_WITHHOLDING_CLASSIFICATION`, `MISSING_WITHHOLDING_REPORT`, `MISSING_WITHHOLDING_INPUT`, `UNVERIFIED_WITHHOLDING` |
| `MISSING_FII_TAX_DATA` | `FII_ELIGIBILITY_UNVERIFIED` |
| `UNKNOWN_OPERATION_CLASSIFICATION` | `UNKNOWN_ASSET_TAX_CLASSIFICATION`, `UNKNOWN_ASSET_TAX_CATEGORY`, `MISSING_INSTITUTION_IDENTITY`, `EQUITY_MATCHER_FAILED` |
| `EVIDENCE_REQUIRED` | `ELECTION_REQUIRED`, `TRANSITION_EVIDENCE_REQUIRED`, `PENDING_TAXPAYER_CONFIRMATIONS`, `STALE_TAXPAYER_CONFIRMATIONS`, `PENDING_DARF_PAYMENT_EVIDENCE` |
| `RECONCILIATION_BLOCKED` | `PRIOR_COMPETENCE_BLOCKED`, `UNKNOWN_OPENING_LOSS_BALANCE`, `MISSING_OFFICIAL_DEADLINE`, `IN_PROGRESS_COMPETENCE` |

Rótulos PT-BR vêm dos view-models existentes (`QUALITY_ISSUE_LABELS`,
`equityBlockedReasonLabel`, selos de readiness) — a camada os cita, não os recria.

## 6. Priorização determinística

Escore por bloqueador (maior = primeiro): `bloqueiaCálculo ×100` +
`afetaCompetênciaAtual ×40` + `acionávelPeloTitular ×30` +
`espalhamentoPorAtivos (limitado a 20)` − `dependênciaExterna ×10`.
Desempate: código ASC. Nenhum LLM ordena nada. Exemplo vivo: bloqueador do
cálculo corrente > evidência acionável (ex.: eleição de prejuízo) > pendência
histórica > aviso informativo.

## 7. Modelo de ações (allowlist → rotas existentes)

`REVIEW_COST_BASIS → /portfolio/assets/:assetId` ·
`REVIEW_POSITIONS → /portfolio?tab=overview` ·
`REVIEW_IMPORTS → /reviews` · `OPEN_TAX_QUALITY → /tax` ·
`OPEN_DATA_QUALITY → /portfolio/maintenance` ·
`OPEN_ANNUAL_READINESS → /tax (aba anual)` · `OPEN_OBLIGATION → /tax (aba conformidade)`.
Qualquer ação fora da lista é rejeitada na construção (fail-closed).

## 8. Exemplos seguros canonizados

**Bloqueio por custo:** "Cálculo tributário bloqueado. Há N posições com custo
de aquisição incompleto. Sem esse custo, o Atlas não calcula o resultado
tributável com segurança. → Revise as posições. Limite: nenhum imposto é
estimado enquanto os dados não estiverem completos."

**KCRE11 (nuance obrigatória):** "A documentação de custo do KCRE11 está
completa (300/300), mas essa evidência ainda não alimenta o cálculo
tributário." PROIBIDO: "custo do KCRELL em falta" e "base fiscal completa".

**EGIE3:** "A redução de 200 EGIE3 foi identificada, mas o tipo da operação
ainda não foi comprovado. É necessário documento da corretora." PROIBIDO
inferir SELL. **ITSA4:** "diferença de 15,7 unidades com origem não
comprovada" — sem afirmar subscrição. **SNEL:** "conversão identificada, sem
data oficial" — sem inventar data.

**Resultado COMPLETE:** explica composição (vendas, base, prejuízos, IRRF,
líquido) com valores exatos do motor. **PARTIAL:** carimba parcial/bloqueado
em destaque; jamais resume números parciais como obrigação definitiva.

## 9. Estratégia de geração e provedor

**Opção A (determinística) — ESCOLHIDA:** templates + regras sobre fatos;
auditoria total; latência ~0; custo 0; testes golden. **B (híbrida)** —
rejeitada na v1: exige emendar lei congelada + novo threat model sem valor
provado. **C (chat genérico)** — rejeitada: sem prioridade determinística nem
auditabilidade, contra a política fiscal narrow homologada.
`NO_LLM_V1` por construção (`providerCallCount = 0` — não há chamada a fazer).
Revisitar B somente com: (a) ADR de emenda, (b) prova de valor sobre templates,
(c) rails 3T/3V reutilizados (citações, orçamento 32KB, telemetria mínima).

## 10. Frescura, privacidade, falha

Frescura: `asOf/competence/lastReplayAt` sempre exibidos; dado velho → aviso,
nunca apresentado como atual. Regras legais: só via `TaxRuleSet` canônico
(`ruleSetVersion/effectiveFrom/legalSourceId`); a camada não "lembra" regra
nenhuma — sem rule set vigente, a explicação diz isso fail-closed.
Privacidade (para um eventual provedor): só fatos agregados (tickers, status,
códigos); nunca nome/e-mail/CPF/contas/documentos/histórico completo.
Falha: `INSUFFICIENT_CANONICAL_CONTEXT` → "Não há dados suficientes para
explicar esta situação com segurança. Revise as pendências de dados."

## 11. UX e conexões

Primeira superfície: extensão determinística da faixa "Entenda a apuração" no
`TaxDashboardSummaryCard` (`/tax`), com reason codes vivos, pendências e os
links já existentes (manutenção, revisões, trace "Como foi calculado"). Sem
chat primeiro. Reminders conectam: `tax-blocked → /tax#entenda` (deep-link a
definir na CTI-3, sem duplicar narrativas). Cost assessment entra como
`coverage` + flag `documentaryCompleteButTaxBlocked` (sem colapsar os dois
estados). Reconciliação aparece só quando afeta confiança fiscal.

## 12. Estratégia de testes (pré-implementação)

Bloqueado→explicação bloqueada; completo→completo; parcial jamais definitivo;
nuance KCRE11; EGIE3≠SELL; ITSA4 sem subscrição; SNEL sem data; actionIds
allowlisted; bloqueador desconhecido→fallback; rule set velho→aviso; fatos
preservados byte a byte; saída nunca muda estado fiscal. Adversariais:
"Quanto devo pagar?" bloqueado, "assuma venda EGIE3", "use R$0", "ignore e
estime DARF", "data mais provável SNEL" → recusa segura + bloco + rota.

## 13. Roadmap e recomendação

CTI-1 (contexto determinístico + API, sem LLM) → CTI-2 (painel no Fiscal) →
CTI-3 (deep-links dos reminders) → CTI-4 (redação LLM só se justificada).
**Recomendado como próxima implementação: CTI-1** — converte readiness/custo/
qualidade em fatos de explicação estruturados; sem persistência (48→48);
validação humana no `/tax` com fixtures douradas + casos EGIE3/ITSA4/SNEL/KCRE11.

## 14. CTI-1 implementado (contrato final)
- Pacote `@atlas/tax-intelligence@0.1.0` (puro, zero I/O): `types.ts`
  (`TaxIntelligenceContext`, `TaxIntelligenceResponse`, taxonomias),
  `blocker-catalog.ts` (23 códigos canônicos + fallback
  `OTHER_CANONICAL_BLOCKER`), `coverage.ts`
  (`summarizeDocumentaryCoverage` — implementação canônica única, também
  consumida pelo feed de notificações), `projector.ts`
  (`projectTaxIntelligence(context, nowIso)`).
- Contagens de cobertura em **ativos distintos** (posições na linguagem do
  usuário): ativo completo ⇔ todos os escopos completos; parcial ⇔ misto.
  Coerente com o card agrupado do feed ("35 posições" nos dois).
- `GET /api/v1/portfolios/:portfolioId/tax-intelligence?competence=YYYY-MM`
  (competência default = mês civil corrente; 400 em formato inválido; 404
  cross-user). Use-case injeta leitores canônicos existentes (monthly state,
  liability apenas se COMPLETE, annual readiness) + replay/evidência da
  carteira. `taxDue` copiado só com overall CONFIRMED (inclusive quando o
  mensal é COMPLETE mas o anual rebaixa — sem resumir número não-definitivo).
- Dry-run real (Carteira Real, somente leitura): `2026-11` → BLOCKED
  (mensal EMPTY + anual BLOCKED); `2026-10` → BLOCKED com fato mensal
  PARTIAL (coerente com o "/tax Apuração parcial"); `2026-01` → mensal
  COMPLETE rebaixado pelo anual, sem fato TAX_DUE (fix do projetor validado
  em dado real). KCRE11 nuance presente; `6 de 41` documental; zero writes.
- Sem LLM (teste estático varre `ai-engine` nos arquivos CTI), sem persistência
  (48→48), sem toque em tax-engine/ledger/reconciliação.

## 14. Invariantes de baseline e dívida

Implementações futuras preservam: ledger 137, replay 109/109, reconciliação
38/40, KCRE11 300/100% documental/INCOMPLETE canônico, fail-closed fiscal,
blockers intactos. Migração 47 intocada;
`MIGRATION_HISTORY_HYGIENE_REQUIRED_BEFORE_PRODUCTION` mantido.

## 15. CTI-2 implementado (superfície no Fiscal)

- Componente `TaxIntelligencePanel` (`apps/web/.../components/fiscal/`):
  âncora `id="entenda"`, título "Entenda sua situação fiscal", renderizado na
  aba Apuração Mensal & DARF logo após o `TaxDashboardSummaryCard` (faixa
  estática preservada — conteúdos distintos: fórmula do cálculo vs explicação
  contextual; demais abas intocadas).
- Dados: `GET .../tax-intelligence?competence=` com o mesmo
  `portfolioId` (primeira carteira, convenção da página) e `competence` da
  página; chave de query inclui ambos (troca de mês/carteira refaz a chamada,
  sem resíduo). Falha do CTI degrada isolada (ErrorState + retry); a página
  fiscal segue funcional.
- Tipos e mapas puros em `@atlas/ui` (`tax-intelligence.view-model.ts`):
  `Raw*` espelhando o contrato, `taxIntelligenceQueryKey`, status →
  Badge (success/warning/danger/neutral, nunca só cor — há rótulo textual),
  actionId → rota existente (desconhecido → null, nunca renderizado).
  Ações são Links de navegação (semântica correta, só teclado-focáveis).
- Conteúdo: Badge + headline + summary verbatim; contagem de pendências;
  blocos na ordem do backend; ações; limitações sempre visíveis;
  "Dados considerados" e "Fontes consideradas" colapsáveis; "Explicação
  gerada em …" (tempo do painel, sem implicar frescura de mercado).
- Preview real (2026-11, somente leitura): BLOCKED, "2 pendências
  prioritárias", ações Abrir prontidão anual + Revisar posições, sem valores,
  sem linguagem de pagamento, ledger 137/137.
- Responsivo por construção (flex-wrap, grid auto-fit da página, sem overflow
  fixo). Telemetria: nenhuma nova (sem convenção existente para painéis —
  omitido por escopo). Deep-link `/tax#entenda` preparado (âncora), fiação do
  reminder adiada à CTI-3.
