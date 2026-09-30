# Contract: `equity-fiscal-web-ux-v1`

Fase 4G.2A.1c — UX web da apuração mensal de ações e da eleição de compensação.

## Superfície

Seção aditiva "Ações" na página Fiscal real (`/tax`), alimentada pelo campo
`equity` do read model de `GET /api/v1/fiscal/monthly/:competence/liability`.
A seção de FII existente permanece inalterada.

## Dados exibidos (servidor)

- **Operações comuns**: situação da isenção, vendas no mês, limite, resultado do
  mês, prejuízo inicial, reconhecido no mês, compensado, final e base tributável
  antes de IRRF.
- **Day trade**: os mesmos campos, mais quantidade casada.
- Todos os valores são strings decimais exatas formatadas por `@atlas/ui`.

## Ações de eleição (somente web)

- Exibidas quando `equityCompensationElection.required` é `true`, ou para alterar
  uma decisão existente (`DECLARED` / `NOT_DECLARED`).
- Opções explícitas, sem pré-seleção:
  - `Reconhecer prejuízo` → `DECLARE_FOR_CARRYFORWARD`
  - `Não reconhecer` → `DO_NOT_DECLARE`
- Confirmação explícita em modal ("Confirmar opção fiscal") com competência,
  opção e consequência.

## Mutação

- `PUT /api/v1/fiscal/monthly/:competence/elections/equity-exempt-loss`
- Corpo **apenas** `{ "value": ... }`; nunca `taxSubjectId`.
- Após sucesso: refetch do read model mensal no servidor (sem mutação otimista
  de saldos). Mesmo valor → `created: false`, UI estável.

## Estados

- **BLOCKED**: mensagem humana por `reasonCode`, sem valores zero fabricados e
  sem controles de eleição.
- **Vazio** (sem atividade): empty state; sem controles de eleição.
- **Erro**: `ErrorState` com retentativa; nunca converte falha em dados zerados.
- **Loading**: skeleton do design system.

## Invariantes

- Zero matemática fiscal no cliente (sem limiar, alíquota, prejuízo ou base).
- Apenas tokens e componentes do design system.
- Status nunca comunicado apenas por cor.
- Alvos de toque ≥ 44px; modal com gestão de foco e teclado.

## Fora de escopo

IRRF, 6015, DARF, IRPF anual, IA fiscal.

## Cobertura de browser (Fase 4G.2A.1c.1)

A suíte de browser real (`pnpm test:equity-fiscal-web:e2e`, Playwright) cobre, nos
viewports Desktop (1440x900), Tablet (768x1024) e Mobile (390x844):

- A–K: isenção, mês tributável, decisão obrigatória, declarar, recusar, revisão,
  bloqueio por ativo desconhecido, bloqueio por custo ausente, erro de servidor,
  mês vazio e coexistência com FII;
- L: **sem overflow horizontal** no viewport estreito e modal de confirmação
  totalmente visível/utilizável;
- o corpo do `PUT` contém apenas `{ value }` (nunca `taxSubjectId`);
- após a mutação, ocorre refetch do read model no servidor.
