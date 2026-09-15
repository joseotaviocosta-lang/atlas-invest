# ADR-005: Utilização de Precisão Decimal Arbitrária para Valores Monetários

## Status

Accepted

## Context

O padrão IEEE 754 de ponto flutuante em JavaScript (`number`) introduz erros inerentes de representação binária para frações decimais (exemplo clássico: `0.1 + 0.2 === 0.30000000000000004`).
Em finanças e investimentos, acumulações de frações de centavos ao longo de centenas de compras fracionárias, emolumentos B3, taxas de corretagem e DARFs geram discrepâncias graves e violações tributárias.

## Decision

Determinar como regra inegociável de desenvolvimento no Project Atlas:

- **PROIBIDO** o uso de ponto flutuante (`number`) para valores monetários, preços médios, cotações com muitas casas decimais, alíquotas fiscais e saldos.
- Todos os cálculos futuros em motores (`portfolio-engine`, `tax-engine`, `performance-engine`) devem utilizar tipos de precisão arbitrária (como `decimal.js` ou inteiros em centavos/micros).
- No banco de dados futuro (PostgreSQL), colunas financeiras devem ser mapeadas como `NUMERIC` / `DECIMAL` com precisão e escala definidas, nunca `FLOAT` ou `REAL`.

## Consequences

- **Positivas:**
  - Exatidão matemática rigorosa, essencial para conformidade fiscal (DARF e IRPF) e relatórios de rentabilidade.
  - Eliminação de anomalias de arredondamento em comparações de igualdade contábil.
- **Negativas:**
  - Pequeno overhead computacional em comparação com aritmética nativa de hardware, perfeitamente aceitável e imperceptível no volume de transações de investimentos.
