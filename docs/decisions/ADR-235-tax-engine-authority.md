# ADR-235: Autoridade Exclusiva do Tax Engine

## Status

Aceito (Fase 4A)

## Contexto

O Atlas possui autoridade financeira bem definida: o Portfolio Engine é a fonte da
verdade patrimonial derivada do livro-razão imutável. Regras fiscais brasileiras são
notoriamente sensíveis: alíquotas, isenções, retenções e compensação de prejuízos são
definidas por lei e mudam ao longo do tempo. Espalhar lógica fiscal por UI, API ou IA
criaria múltiplas "verdades" tributárias divergentes e inauditáveis.

## Decisão

1.  **Autoridade Única:** Todo cálculo fiscal pertence exclusivamente a `@atlas/tax-engine`.
    Nenhum outro pacote, app, controller, view-model ou prompt de IA pode calcular impostos.

2.  **Derivação Canônica:** O Tax Engine deriva fatos fiscais exclusivamente do livro-razão
    imutável de transações e de conjuntos de regras versionados e efetivos por data.

3.  **Proibições:** É terminantemente proibido derivar verdade fiscal de estado de UI,
    posições atuais, saída de IA, notícias, market intelligence ou totais cacheados.

4.  **Escopo da Fase 4A:** A Fase 4A estabelece apenas a fundação: eventos fiscais derivados,
    classificação de ativos, conjuntos de regras versionados, estado fiscal mensal e
    qualidade de dados. **Não** calcula imposto a pagar, DARF ou IRPF.

5.  **Ausência de Autoridade na IA:** A IA permanece estritamente proibida de calcular
    tributos (`UNSUPPORTED_TAX`, zero chamadas de provedor para perguntas fiscais).

## Consequências

- Existe exatamente uma implementação fiscal auditável e determinística.
- A camada de aplicação apenas orquestra: carrega transações canônicas e retorna read models.
- A Fase 4B poderá calcular responsabilidade tributária real sem duplicar autoridade.
