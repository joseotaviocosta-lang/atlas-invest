# ADR-298: Imposto Líquido de Categoria Antes da Agregação Federal

## Status

Aceito (Fase 4G.2B)

## Contexto

A apuração mensal produz imposto bruto e líquido por categoria (normal, day
trade). A obrigação federal de pagamento única (código 6015), com mínimo de DARF
e vencimento, é uma etapa distinta e posterior.

## Decisão

1. O motor expõe `netTaxBefore6015Aggregation` por categoria, nunca o valor final
   do DARF.
2. **Não** se cria `TaxObligationComponent` nem agregação 6015 nesta fase.
3. O mínimo de DARF (R$ 10) e o vencimento não são aplicados aqui.
4. A UI rotula o valor como "Imposto líquido da categoria" e informa que o valor
   final do DARF será consolidado em etapa posterior.

## Consequências

- Separação estrita entre cálculo por categoria e obrigação federal.
- 4G.2C pode consolidar categorias sobre valores já isolados e determinísticos.
