# Contrato: TaxWithholdingCredit v1 (Fase 4B)

Crédito de retenção na fonte, sempre canônico e rastreável (ADR-244). Nunca
estimado.

## Estrutura

```
{ category, currency, amount: Money, source: 'FISCAL_EVENT', sourceEventId? }
```

## Regras

1. **Fonte canônica:** a retenção deriva de um `FiscalEvent` ou campo fiscal
   importado canônico; jamais de estimativa.
2. **Categoria preservada:** o crédito mantém a identidade de categoria/moeda;
   não é agrupado globalmente salvo regra verificada.
3. **Aplicação:** `withholdingApplied = min(disponível, imposto antes da retenção)`.
4. **Nunca negativo:** `taxDue = max(0, taxBeforeWithholding - withholdingApplied)`.
5. **Excesso:** não inventa carryforward; tratamento apenas se regra verificada
   o definir.
6. **Ausência obrigatória:** se a regra exige retenção e não há crédito canônico,
   o resultado é `PARTIAL` com `MISSING_REQUIRED_WITHHOLDING`.

## Capacidade 4B

O livro-razão atual não contém campo canônico de retenção de corretora; portanto
`withholdingSupported = false` por padrão e nenhuma retenção é estimada.
