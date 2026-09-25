# ADR-190: Conversation Evidence Snapshots

## Status

Approved (Fase 3S)

## Contexto

Quando um investidor visualiza o histórico de uma conversa antiga, ele precisa entender com base em quais dados a IA gerou aquela resposta no passado ("qual era o TWR reportado na resposta de 3 meses atrás?"). Por outro lado, salvar o contexto de grounding inteiro (30 a 60 fatos completos) para cada mensagem causaria inchaço desnecessário do banco de dados e duplicação indevida de dados analíticos.

## Decisão

1. Para cada resposta de assistente persistida com status `ANSWERED`, salvar um **snapshot minimalista de auditoria** contendo estritamente os fatos que foram efetivamente citados pela IA naquela resposta (`evidenceSnapshot`).
2. Se a IA citou 2 fatos, o snapshot contém exatamente 2 registros de evidência.
3. Os valores do snapshot são copiados diretamente dos fatos canônicos de grounding validados pelo servidor, nunca do texto gerado pelo modelo.
4. Ao exibir mensagens históricas, a interface renderiza o snapshot original persistido. Respostas antigas nunca sofrem remapeamento silencioso para os valores do dia atual.

## Consequências

- Auditoria precisa e perene das respostas do assistente.
- Armazenamento no banco de dados proporcional apenas aos fatos citados (poucos bytes por mensagem).
