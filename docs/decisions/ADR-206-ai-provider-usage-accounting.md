# ADR-206: AI Provider Token Usage Accounting

## Status

Aceito (Fase 3V)

## Contexto

Chamadas a provedores de LLM externos (como a OpenAI) consomem cotas e geram custos de computação baseados no volume de tokens de entrada (prompt) e saída (completion). A contabilidade de uso precisa ser auditável e exata, sem fabricar números fictícios e sem depender de estimativas heurísticas não confiáveis.

## Decisão

1. **Uso Reportado pelo Provedor é Canônico:**
   - Quando o provedor reporta dados de uso (`prompt_tokens`, `completion_tokens`, `total_tokens`), esses números inteiros exatos são adotados na telemetria com `source: 'PROVIDER'`.
2. **Tratamento de Uso Ausente:**
   - Se o provedor não reportar os tokens ou falhar antes da geração, os campos de tokens devem ser gravados como `null` com `source: 'UNAVAILABLE'`.
   - É **proibido** relatar `0` tokens quando a informação não foi fornecida pelo provedor.
3. **Casos Não Aplicáveis:**
   - Para requisições bloqueadas antes do provedor (intenções não suportadas ou orçamentos excedidos), os tokens são gravados como `0` com `source: 'NOT_APPLICABLE'`.
4. **Sem Modelo Monetário na Fase 3V:**
   - A Fase 3V rastreia unicamente quantidades de tokens; tabelas de preços em dólares ou reais e regras de faturamento são diferidas para fases comerciais futuras.

## Consequências

- Auditoria fidedigna de uso de recursos computacionais por requisição.
- Zero distorção estatística por fabricação arbitrária de números.
