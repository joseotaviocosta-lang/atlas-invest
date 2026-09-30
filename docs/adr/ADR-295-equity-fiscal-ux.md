# ADR-295: UX Fiscal de Ações com Autoridade do Servidor e Mutação de Eleição Somente na Web

## Status

Aceito (Fase 4G.2A.1c)

## Contexto

O núcleo mensal de ações e a eleição de compensação já estão aprovados no
backend. Era necessário expô-los nas interfaces sem duplicar matemática fiscal no
cliente e sem permitir decisões fiscais em superfícies não auditáveis.

## Decisão

1. **Autoridade do servidor**: todos os valores de ações vêm do read model mensal
   (`equity`); o cliente apenas formata e rotula.
2. **Zero matemática no cliente**: proibido comparar limiar, calcular prejuízo,
   base tributável, isenção ou classificar day trade na UI.
3. **Mutação somente na web**: a eleição é alterada exclusivamente na web via
   `PUT` aprovado, com corpo `{ value }` (sem `taxSubjectId`) e confirmação
   explícita.
4. **Refetch autoritativo**: após a mutação, o read model é re-buscado no
   servidor; nenhuma mutação otimista de saldos.
5. **Estados honestos**: `BLOCKED`, vazio e erro nunca viram valores zero; estados
   bloqueados exibem mensagem por `reasonCode`.
6. **Mobile somente-leitura**: exibe valores e o estado da eleição; orienta
   concluir a decisão na web.
7. **FII inalterado**: a seção de FII permanece intacta; ações são aditivas.

## Consequências

- Decisões fiscais auditáveis e consistentes com o backend congelado.
- Nenhuma duplicação de lógica fiscal nas interfaces.
- IRRF, 6015, DARF e IRPF permanecem fora desta fase.
