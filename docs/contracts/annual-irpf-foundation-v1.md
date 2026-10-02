# Contract: `annual-irpf-foundation-v1`

Fase 4H.1 — invariantes arquiteturais e de dados para o suporte futuro ao IRPF
anual. **Este contrato congela apenas invariantes suficientemente conhecidos.**
Semântica legal ainda PARTIAL/UNRESOLVED **não** é congelada aqui (ver
`docs/research/annual-irpf-legal-foundation-2026.md`).

## 1. Camada derivada (não é motor de transações)

```
Transactions / Events
  → Portfolio Engine (derived positions / cost)
  → Fiscal (monthly liability, equity, 6015)
  → Annual IRPF (reporting / organization)
```

O IRPF anual é uma camada de leitura derivada. Ele:

- **não** recalcula classificação normal/day-trade;
- **não** recalcula prejuízos, IRRF mensal ou composição 6015;
- **não** mantém posições editáveis como segunda fonte da verdade;
- reproduz o estado anual a partir do ledger imutável + estado fiscal mensal +
  inputs confirmados (replay determinístico).

## 2. Modelo temporal

`CalendarYear`, `DeclarationExercise` e `AnnualTaxPeriod` são conceitos tipados e
distintos. Nenhuma regra resolve por "regra atual"; a resolução é **year-aware**
(`effectiveFrom`/`effectiveTo` + ano-calendário + exercício).

## 3. Desconhecido ≠ zero

Estados distintos e não intercambiáveis: `zero`, `unknown`, `not_applicable`,
`missing`. Nenhum valor anual autoritativo é emitido quando incompleto.

## 4. Completude e falha fechada

Estados: `COMPLETE` | `PARTIAL` | `BLOCKED` | `REQUIRES_CONFIRMATION`.

Bloqueiam o resultado anual (no mínimo): custo desconhecido
(`costBasisStatus = INCOMPLETE`), ausência de histórico pré-Atlas, classificação de
ativo desconhecida, evento corporativo ausente que afete quantidade/custo,
quantidade inconsistente, conversão cambial ausente, classe de ativo não
suportada, evento de rendimento ausente quando legalmente exigido.

## 5. Proveniência

Todo fato anual material deve ser rastreável a: transação do ledger, input
fiscal, evidência de retenção, evento corporativo, input manual confirmado, ou
versão de regra oficial.

## 6. Versionamento de regras anuais

`ruleId`, `ruleVersion`, `effectiveFrom`, `effectiveTo?`, aplicabilidade por ano
calendário e por exercício, com proveniência oficial. Regras PARTIAL/UNRESOLVED
não entram em produção.

## 7. Identidade e moeda

- Identidade de ativo é `AssetId`; ticker nunca é identidade.
- Multi-moeda permanece segregada até conversão explícita; nenhuma conversão BRL
  é presumida.

## 8. Segurança e privacidade

- CPF nunca em log; sujeito passivo derivado do principal autenticado; identidade
  mascarada/HMAC.
- Isolamento cross-user obrigatório.
- Nenhuma submissão à Receita, automação, captcha ou certificado.

## 9. Fora de escopo (congelado)

Geração/envio de declaração, automação Receita/GCAP/ReVar/PGD, Tax AI
(`UNSUPPORTED_TAX`, 0 chamadas), IRPF de ETF/BDR/opções/futuros/cripto e regimes
de ativos no exterior.

## 10. Retenção e Preservação Probatória

Atlas must preserve tax evidence according to the applicable legal, regulatory and audit-retention requirements for each artifact type. Five-year tax decadence/prescription periods are relevant legal context but are not treated as a universal storage-retention rule. Exact retention requirements remain source-specific and must be confirmed before enforcing automatic deletion.

## 11. Rendimentos e Proventos de Investimento (Fase 4H.4)

A agregação anual de rendimentos (Dividendos, JCP e Rendimentos de FII) obedece aos seguintes invariantes:

- **Segregação Rigorosa**: Proventos nunca entram no cálculo de ganho líquido ou abatimento de prejuízos de renda variável.
- **Tributação Exclusiva na Fonte**: O IRRF retido na fonte sobre JCP (15%) é definitivo e não compensável contra DARF mensal 6015.
- **Fail-Closed em FII**: Rendimentos de FII exigem preenchimento dos 3 requisitos legais cumulativos (Lei 11.033/04, Art. 3º, III c/c Lei 14.754/23) para isenção; caso contrário, falham para `REQUIRES_CONFIRMATION` ou retenção exclusiva na fonte.
