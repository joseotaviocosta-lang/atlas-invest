# ADR-074: Prohibition of Market Value and Performance Claims Prior to Market Data

## Status

Accepted

## Context

Em aplicativos financeiros convencionais, frequentemente confunde-se "Custo de Aquisição" com "Patrimônio Atual" ou "Valor de Mercado", induzindo o investidor a acreditar que seu saldo investido reflete a cotação a mercado presente. No Project Atlas, a arquitetura do Portfolio Engine foca em contabilidade analítica e deterministic replay. O módulo de **Market Data** (cotações de mercado) será construído em fase futura.

## Decision

1. **Proibição Explícita de Rótulos de Mercado:**
   - É estritamente vedado rotular o custo total de aquisição como "Patrimônio Atual", "Valor da Carteira", "Patrimônio a Mercado" ou equivalentes.
   - A terminologia aprovada é **"Custo total investido"** ou **"Custo total conhecido"** (quando houver incompletude).
2. **Proibição de Métricas de Performance Falsas:**
   - O resultado de vendas (`realizedGainLoss`) e os proventos recebidos **não** podem ser chamados de "Rentabilidade da Carteira" ou "Performance Geral".
   - Métricas de rentabilidade ponderada (TWR, MWR, XIRR) só serão exibidas após a introdução do Performance Engine.
3. **Segregação Estrita de Moedas:**
   - Valores em `BRL` e `USD` jamais são consolidados ou convertidos sem suporte formal a cotações FX.

## Consequences

- O Project Atlas mantém integridade conceitual e conformidade com as melhores práticas de auditoria e transparência patrimonial.
