# ADR-049: Arquitetura de Suporte à Declaração de Ajuste Anual e Reporte Fiscal IRPF

## Status
Aceito (Fase 4H.6)

## Contexto
Após o cálculo de posições em 31/12 (4H.1), do resumo anual de mercado de capitais (4H.2), dos rendimentos de investimentos e JCP/dividendos/FII (4H.3/4H.4) e da orquestração de prontidão de evidências (4H.5), é imperativo consolidar todos os dados autoritativos em um pacote estruturado de suporte à declaração anual de IRPF (`AnnualTaxReportingPackage`).

O contribuinte necessita visualizar exatamente em quais fichas do PGD IRPF (Bens e Direitos, Rendimentos Isentos, Rendimentos Exclusivos, Renda Variável, Imposto Pago) cada item deve ser lançado, com redação descritiva padrão, valores de custo anterior e atual, e rastreabilidade da fonte.

## Decisões de Arquitetura

1. **Pure Deterministic Reporting Engine (`AnnualTaxReportingEngine`):**
   - O motor `buildAnnualTaxReportingPackage` é 100% puro e determinístico. Recebe o estado consolidado de posições, resumo de mercado, proventos, pagamentos DARF e prontidão fiscal e emite uma estrutura estritamente imutável com `fingerprint` SHA-256 canônico.
2. **Integração com Registro de Regras (`AnnualTaxReportingRuleRegistry`):**
   - Centraliza os códigos da RFB (03-01, 07-03, 09, 10, 20, 26, etc.), redações descritivas canônicas e critérios de versão para anos futuros (2026+).
3. **Mapeamento de Regras Provisórias (`PROVISIONAL`):**
   - Reformas tributárias sancionadas (como a Lei 15.270/2025 para retenção de dividendos a partir de 2026) cujos programas IRPF oficiais ainda não tiveram layout publicado são explicitamente marcadas com `mappingStatus: 'PROVISIONAL'`.
4. **Tratamento de Posições Alienadas no Ano:**
   - Ativos em custódia em 31/12/(Ano-1) com saldo zero em 31/12/Ano são incluídos em *Bens e Direitos* (`POSICAO_ALIENADA_BENS_E_DIREITOS`), garantindo consistência na evolução patrimonial entre declarações.
5. **Fail-Closed e Bloqueio Explícito (Zero Fake Data):**
   - Se o motor de prontidão (4H.5) indicar `BLOCKED` ou `REQUIRES_CONFIRMATION` para um subsistema, os itens correspondentes são emitidos com `isBlocked: true` e a lista de `blockingReasons`, impedindo a declaração prematura de dados incompletos.
6. **Desacoplamento e Não-Transmissão:**
   - O sistema emite disclaimer explícito em todos os relatórios (`ANNUAL_REPORTING_DISCLAIMER`), informando que o Atlas não substitui comprovantes oficiais nem realiza envio automatizado.

## Consequências
- Os investidores possuem uma visão unificada e auditável para preenchimento de suas declarações de IRPF.
- A separação de responsabilidades mantém o domínio fiscal livre de acoplamentos com navegadores, captchas ou I/O de rede.
- Total conformidade com as diretrizes do `AGENTS.md` (zero floats, append-only, auditoria por fingerprints).

