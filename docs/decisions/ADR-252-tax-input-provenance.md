# ADR-252: Proveniência de Inputs Tributários

## Status

Aceito (Fase 4B.2)

## Contexto

Inputs fiscais sem proveniência não são auditáveis e podem ser confundidos com
valores oficiais.

## Decisão

1. Todo input tributário (classificação, retenção, metadado FII) carrega
   proveniência: `source`, `sourceReference?`, timestamps e competência efetiva
   quando aplicável.
2. A prontidão (`TaxInputReadiness`) agrega as referências de proveniência para auditoria.
3. A camada de input representa fatos; não decide tratamento legal.
4. A prontidão é exposta server-side e nunca calcula imposto.
5. Manual exige confirmação explícita e não sobrescreve importado sem tratamento de conflito.

## Consequências

- Rastreabilidade ponta a ponta.
- Prontidão auditável e honesta.
