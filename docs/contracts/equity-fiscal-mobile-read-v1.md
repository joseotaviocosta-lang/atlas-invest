# Contract: `equity-fiscal-mobile-read-v1`

Fase 4G.2A.1c — superfície mobile somente-leitura da apuração mensal de ações.

## Escopo

Somente leitura. Nenhuma mutação de eleição no mobile nesta fase.

## Superfície

Cards aditivos na tela Fiscal real (`app/(app)/(tabs)/tax.tsx`), alimentados pelo
campo `equity` do read model mensal de imposto.

- **Ações — Operações comuns**: situação da isenção, vendas no mês, resultado do
  mês, prejuízo inicial, prejuízo final e base tributável antes de IRRF.
- **Ações — Day trade**: os mesmos campos, mais quantidade casada.

## Estado da eleição (leitura)

Renderiza exatamente um de:

- `Decisão necessária` (`ELECTION_REQUIRED`)
- `Prejuízo reconhecido` (`DECLARED`)
- `Prejuízo não reconhecido` (`NOT_DECLARED`)
- `Não aplicável` (`NOT_REQUIRED`)

Quando `required`, exibe a orientação: "Finalize esta decisão na versão web."
Nenhum botão de mutação é renderizado.

## Estados

- **BLOCKED**: mensagem por `reasonCode`; sem valores zero e sem inferência local.
- **Vazio**: estado estável de "sem operações".
- Sem polling adicional; reutiliza o padrão de fetch fiscal existente.

## Invariantes

- Zero matemática fiscal no cliente.
- Tokens do design system; alvos de toque ≥ 44px.
- Valores formatados por `@atlas/ui` a partir de strings decimais exatas.

## Fora de escopo

Mutação de eleição, IRRF, 6015, DARF, IRPF anual, IA fiscal.
