# ADR-226: Proibição de Sumarização de Contexto por LLM

## Status

Aceito (Fase 3Y)

## Contexto

A forma mais óbvia de reduzir contexto seria pedir a um modelo de linguagem que resumisse
os fatos de grounding ou o histórico de conversa antes da chamada principal. Essa
abordagem é terminantemente inaceitável no Atlas: um resumo produzido por modelo
probabilístico introduziria um caminho pelo qual números financeiros poderiam ser
alterados, arredondados, fundidos entre moedas ou simplesmente inventados — exatamente o
risco que toda a arquitetura de grounding existe para eliminar.

## Decisão

1. **Nenhuma Sumarização por Modelo:**
   - É **proibido** introduzir sumarizador, compressor, juiz, modelo de reparo, modelo de
     embeddings ou banco vetorial no caminho de seleção ou compactação de contexto.

2. **Seleção Estritamente Determinística:**
   - Toda redução de contexto ocorre por lógica determinística de servidor: mapa
     intenção → famílias de fatos, isolamento de escopo, deduplicação canônica,
     dicionário de ativos, envelope de eventos e aliases locais à requisição.

3. **Nenhuma Chamada Adicional de Provedor:**
   - A seleção custa exatamente **0** chamadas de provedor.
   - Requisições suportadas fazem no máximo **1** chamada de provedor; requisições não
     suportadas fazem **0**.

4. **Compactação de Histórico Sem Modelo:**
   - A semântica da Fase 3S é preservada: histórico é contexto linguístico, não verdade
     financeira. Opções permitidas de compactação são apenas determinísticas — FIFO
     existente, apenas `role`/`content`, remoção de metadados duplicados e limites de
     caracteres. É proibido resumir histórico por LLM.

5. **Sem RAG e Sem Recuperação Semântica:**
   - Nenhuma recuperação por similaridade decide quais fatos são autoritativos. A
     autoridade vem do mapa determinístico de intenção e escopo.

## Consequências

- O caminho de redução de contexto é auditável, reproduzível e testável offline, sem rede.
- Nenhum número financeiro atravessa um modelo antes de chegar ao provedor.
- A esteira de avaliação permanece 100% determinística e sem chamadas pagas.
