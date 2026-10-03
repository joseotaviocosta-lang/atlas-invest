# Project Atlas — Annual Tax Reporting Support Legal Foundation & Primary Source Research

**Date of Retrieval / Research:** October 3, 2026  
**Applicable Calendar Years:** 2025, 2026+  
**Applicable Declaration Exercises:** 2026, 2027+  
**Authority:** Receita Federal do Brasil (RFB), Instruções Normativas RFB, Perguntas e Respostas IRPF, Leis Federais (Lei 7.713/1988, Lei 9.249/1995, Lei 11.033/2004, Lei 14.754/2023, Lei 15.270/2025).

---

## 1. Executive Summary & Purpose

This research document establishes the authoritative mapping rules for Project Atlas Phase 4H.6 (**Annual Tax Reporting Support & Declaration Preparation**). It specifies how authoritative, replay-derived fiscal data from upstream engines (Phase 4H.2 Annual Positions, Phase 4H.3 Annual Capital-Market Fiscal Summary, Phase 4H.4 Annual Investment Income, Phase 4H.5 Annual Tax Readiness) maps to the official Brazilian Annual Individual Income Tax Declaration (**DIRPF**) structure.

---

## 2. Official Primary Sources & Regulatory Basis

| Source / Regulation                       | Official Reference / URL                            | Retrieval Date | Applicable Scope                                                                        |
| :---------------------------------------- | :-------------------------------------------------- | :------------- | :-------------------------------------------------------------------------------------- |
| **RFB Perguntas e Respostas IRPF**        | Receita Federal do Brasil (`gov.br/receitafederal`) | 2026-10-03     | Bens e Direitos, Renda Variável, Rendimentos Isentos e Tributação Exclusiva             |
| **Lei nº 7.713/1988 & Lei nº 9.249/1995** | Presidência da República / Casa Civil               | 2026-10-03     | Tributação de dividendos, JCP e ganho de capital                                        |
| **Lei nº 11.033/2004 (Art. 2º)**          | Presidência da República / Casa Civil               | 2026-10-03     | IRRF sobre operações em bolsa (0,005% normal, 1% day trade)                             |
| **Lei nº 14.754/2023**                    | Presidência da República / Casa Civil               | 2026-10-03     | Isenção de rendimentos de FII (requisitos cumulativos) e tributação de fundos           |
| **Lei nº 15.270/2025**                    | Presidência da República / Casa Civil               | 2026-10-03     | Tributação de dividendos distribuídos a partir de 2026 e regras de transição societária |
| **Manual do PGD IRPF**                    | Receita Federal do Brasil                           | 2026-10-03     | Layout e códigos de preenchimento das fichas da declaração anual                        |

---

## 3. Official Declaration Mapping Matrix

### 3.1 Ficha: Bens e Direitos (Assets & Custody on 31/12)

| Asset Class                      |              Group               |                      Code                       | Description & Requirements                                                                                                                                                                  | Atlas Support Status |
| :------------------------------- | :------------------------------: | :---------------------------------------------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :------------------- |
| **Ações (Brazilian Equities)**   | `03` (Participações Societárias) |                  `01` (Ações)                   | Informar CNPJ da emissora, código de negociação (ticker), quantidade de ações custodiadas e custo histórico total de aquisição em reais em 31/12/(Ano-1) e 31/12/(Ano).                     | **OFFICIAL**         |
| **Fundos Imobiliários (FII)**    |          `07` (Fundos)           | `03` (Fundos de Investimento Imobiliário - FII) | Informar CNPJ do fundo/administrador, código do FII, quantidade de cotas e custo histórico total de aquisição em 31/12/(Ano-1) e 31/12/(Ano).                                               | **OFFICIAL**         |
| **Posições Zeradas / Alienadas** |           `03` ou `07`           |                  `01` ou `03`                   | Quando o ativo foi totalmente alienado no ano: informar situação em 31/12/(Ano-1) com valor de custo e situação em 31/12/(Ano) como `0,00`, registrando na discriminação a alienação total. | **OFFICIAL**         |

### 3.2 Ficha: Rendimentos Isentos e Não Tributáveis

| Income Type                                       |        Code        | Regulatory Basis                 | Description & Requirements                                                                             | Atlas Support Status                               |
| :------------------------------------------------ | :----------------: | :------------------------------- | :----------------------------------------------------------------------------------------------------- | :------------------------------------------------- |
| **Dividendos Ordinários (Ações)**                 |        `09`        | Lei 9.249/1995, Art. 10          | Lucros e dividendos recebidos pelo titular. Informar por CNPJ da fonte pagadora e valor bruto/líquido. | **OFFICIAL** (2025) / **PROVISIONAL** (2026+)      |
| **Dividendos Transição (Pré-2026)**               |        `09`        | Lei 15.270/2025                  | Dividendos referentes a lucros apurados até 31/12/2025 com deliberação comprovada.                     | **PROVISIONAL** (Sujeito a comprovação probatória) |
| **Ganhos Isentos em Ações (Vendas $\le$ R$ 20k)** |        `20`        | Lei 7.713/1988, Art. 22          | Ganhos líquidos em operações no mercado à vista de ações quando alienações mensais $\le$ R$ 20.000,00. | **OFFICIAL**                                       |
| **Rendimentos de FII Isentos**                    | `26` ou ficha Bens | Lei 8.668/1993 & Lei 14.754/2023 | Rendimentos distribuídos por FII que cumpre os requisitos cumulativos legais.                          | **OFFICIAL**                                       |

### 3.3 Ficha: Rendimentos Sujeitos à Tributação Exclusiva/Definitiva

| Income Type                                |         Code          | Regulatory Basis        | Description & Requirements                                                                                                                         | Atlas Support Status                       |
| :----------------------------------------- | :-------------------: | :---------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------- |
| **Juros sobre Capital Próprio (JCP)**      |         `10`          | Lei 9.249/1995, Art. 9º | Juros sobre capital próprio recebidos. Informar por CNPJ da fonte pagadora, valor líquido e imposto retido na fonte (15% em 2025, 17.5% em 2026+). | **OFFICIAL**                               |
| **Dividendos Tributados 2026+ (IRRF 10%)** | `Outros` / Específico | Lei 15.270/2025         | Dividendos sujeitos à tributação na fonte sobre o total quando montante mensal $> R\$ 50.000,00$.                                                  | **PROVISIONAL** (Aguardando PGD IRPF 2027) |

### 3.4 Demonstrativo de Apuração de Renda Variável (Ganhos Líquidos)

| Section / Subsection                              | Scope & Rules                                                                      | Offsets & Loss Carry                                                                          | Atlas Support Status |
| :------------------------------------------------ | :--------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------- | :------------------- |
| **Operações Comuns (Mercado à Vista)**            | Apuração mensal de ganhos/perdas em ações, ETFs e opções. Alíquota de 15%.         | Prejuízos compensáveis exclusivamente com lucros em operações comuns de meses subsequentes.   | **OFFICIAL**         |
| **Day Trade (Mercado à Vista / Derivativos)**     | Apuração mensal de operações iniciadas e encerradas no mesmo dia. Alíquota de 20%. | Prejuízos compensáveis exclusivamente com lucros de day trade de meses subsequentes.          | **OFFICIAL**         |
| **Fundos Imobiliários (FII - Ganhos de Capital)** | Apuração mensal de alienação de cotas de FII. Alíquota de 20%.                     | Prejuízos compensáveis exclusivamente com ganhos na alienação de cotas de FII.                | **OFFICIAL**         |
| **IRRF Lei 11.033/2004 (Dedo-Duro)**              | Retenção na fonte de 0,005% (comum) e 1% (day trade).                              | Compensável com o imposto apurado no mês ou transportado para meses seguintes / ajuste anual. | **OFFICIAL**         |
| **Imposto Pago (DARF Código 6015)**               | Recolhimento mensal efetuado até o último dia útil do mês subsequente.             | Comprovado por código de barras / autenticação bancária de DARF 6015.                         | **OFFICIAL**         |

---

## 4. Invariants & Architecture Boundaries

1. **PROIBIÇÃO DE RECOMPUTAÇÃO FISCAL:** O módulo de suporte declaratório não calcula imposto devido, não calcula rentabilidade e não altera preços médios.
2. **GATE DE PRONTIDÃO (PHASE 4H.5):** Seções com status `BLOCKED` ou `REQUIRES_CONFIRMATION` não emitem valores declaratórios definitivos/autoritativos.
3. **INVARIANTE NÃO-ZERO:** Valores desconhecidos (`UNKNOWN`), pendentes de confirmação ou bloqueados jamais são convertidos para zero (`0,00`).
4. **MAPEAMENTO PROVISÓRIO:** Códigos e fichas afetados por reformas tributárias recentes (ex.: Lei 15.270/2025 para o ano-calendário 2026) são categorizados como `PROVISIONAL` até publicação formal das instruções do PGD IRPF do exercício correspondente.
5. **NATUREZA DO DOCUMENTO DE SUPORTE:** Todo relatório, tela ou export gerado pelo Atlas é estritamente um **Documento de Suporte e Conferência**, não constituindo arquivo oficial de transmissão da Receita Federal.
