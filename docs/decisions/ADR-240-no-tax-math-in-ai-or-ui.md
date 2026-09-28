# ADR-240: Sem Matemática Fiscal na IA ou na UI

## Status

Aceito (Fase 4A)

## Contexto

A UI (Web/Mobile) e a camada de IA nunca foram autorizadas a calcular finanças (ADR-073,
ADR-119, ADR-121). O mesmo princípio se aplica integralmente a tributos. Um LLM é
probabilístico e não-determinístico; jamais pode ser a fonte de verdade de um valor fiscal.

## Decisão

1.  **Sem Cálculo no Cliente:** Web e Mobile nunca calculam tributos, bases, prejuízos,
    retenções ou responsabilidade tributária. Apenas formatam strings decimais exatas
    recebidas da API.

2.  **Sem Cálculo na IA:** O AI Engine nunca calcula tributos. Perguntas fiscais
    conversacionais permanecem `UNSUPPORTED_TAX` com **zero** chamadas ao provedor.

3.  **Autoridade do Servidor:** Todo valor fiscal exibido vem de `@atlas/tax-engine` via
    API, serializado como strings decimais exatas.

4.  **Sem Float:** É proibido `parseFloat`, `Number()`, aritmética binária IEEE-754 ou
    `Math.round` em caminhos financeiros/fiscais.

5.  **Sem Rounding Intermediário Causal:** Arredondamento visual ocorre apenas na camada de
    exibição.

6.  **Sem Vínculo com AI/Market Intelligence:** O Tax Engine não depende do AI Engine nem de
    market intelligence. Nenhuma dependência Prisma/UI/network/rede.

## Consequências

- A superfície fiscal permanece determinística e auditável de ponta a ponta.
- A IA pode, em fase posterior, **explicar** fatos fiscais já calculados — nunca calculá-los.
- Testes de arquitetura e de cliente garantem a ausência de matemática fiscal fora do motor.
