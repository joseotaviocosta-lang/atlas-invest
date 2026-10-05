# ADR-309: Experiência Web de Alta Renda como Projeção de Estado Autoritativo do Servidor

## Contexto

A Fase 4I.4 expôs a apuração anual de alta renda via API autenticada com evidências revisionadas.
A Fase 4I.5 precisa tornar esse estado compreensível e acionável no navegador sem jamais deslocar
cálculo tributário para o cliente — onde floats, reclassificações silenciosas e zeros fabricados
corromperiam a confiabilidade fiscal.

## Decisão

1. A UI Web consome exclusivamente a API 4I.4 e projeta seus campos verbatim através de
   view-models puros (`@atlas/ui`): formatação de exibição de strings decimais exatas, rótulos
   PT-BR e ordenação/filtragem de apresentação. Nenhuma matemática tributária no cliente —
   fiscalizado por teste de arquitetura que proíbe imports do motor e padrões de math.
2. Desconhecido nunca é zero na UI: `null` renderiza `—` com contexto; zero autoritativo renderiza
   `R$ 0,00`. Líquido bloqueado/desconhecido nunca aparece como valor final.
3. Evidência é revisional também na UX: sem edição in-place, sem campo de autoridade no cliente,
   com banners de stale/conflito e resolução auditável. Double-submit é inócuo (botão desabilita +
   idempotência do servidor).
4. Listas grandes usam ordenação/filtragem memoizadas e renderização limitada (100 + "mostrar
   mais"); sem O(n²), sem polling, sem request por pagador.
5. Disclaimer de suporte (sem transmissão/aceitação pela RFB, sem DARF/pagamento) é obrigatório e
   sempre visível.

## Consequências

- **Positivas:** paridade total com o servidor por construção; regressões de math no cliente
  viram falha de CI; UX auditável contra o contrato 4I.4.
- **Negativas:** nenhuma agregação client-side mesmo quando conveniente (ex.: totais de pagador
  vêm prontos do servidor); UX de 10k pagadores é funcional mas sem virtualização completa.
