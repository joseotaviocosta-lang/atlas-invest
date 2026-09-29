# ADR-280: Isolamento por Código de Receita

## Status

Aceito (Fase 4E)

## Contexto

O texto legal é explícito: o valor abaixo do mínimo deve ser adicionado ao
imposto **"de mesmo código"**. Permitir agregação entre códigos de receita
distintos seria inventar compensação não prevista e produzir um total enganoso.

## Decisão

1. **Mesmo Código Obrigatório:** a agregação só combina parcelas com o mesmo
   `revenueCode`. 6015 só combina com 6015.

2. **Cross-Code Bloqueado:** qualquer entrada de origem com código divergente
   torna a elegibilidade `BLOCKED` (`CROSS_REVENUE_CODE_NOT_ALLOWED`); o total
   não é calculado.

3. **Sem Compensação Entre Categorias:** não combinar tributos federais
   distintos apenas por serem federais.

4. **Moeda Segregada:** parcelas de moedas distintas não são somadas
   (`CURRENCY_MISMATCH`, falha fechada); sem conversão cambial implícita.

5. **Decomposição Preservada:** o `sourceBreakdown` expõe cada competência de
   origem e seu valor; nenhuma fusão silenciosa.

## Consequências

- Nenhum total consolidado enganoso é produzido.
- Novos códigos de receita exigem nova regra verificada por código.
