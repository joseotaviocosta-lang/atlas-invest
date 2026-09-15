# ADR-004: Livro-Razão Contábil (Ledger) como Fonte Única da Verdade

## Status

Accepted

## Context

Em sistemas de controle patrimonial convencionais, muitas vezes o saldo da conta ou a quantidade em custódia de um ativo é armazenado como uma coluna mutável que sofre operações destrutivas (`UPDATE balance = balance + X`). Em caso de falha de concorrência, reprocessamento de notas de corretagem ou necessidade de auditoria fiscal histórica, torna-se impossível determinar o estado exato da carteira em datas anteriores ou auditar discrepâncias.

## Decision

Adotar o modelo de **Ledger Imutável baseado no princípio das partidas dobradas (Double-Entry Bookkeeping)** como a fonte única da verdade para todas as posições patrimoniais e saldos futuros:

- Nenhuma transação pode alterar saldos diretamente sem o registro de eventos contábeis imutáveis correspondentes (débito e crédito balanceados).
- Posições patrimoniais atuais ou em datas passadas são derivadas da soma dos lançamentos do ledger ou mantidas em snapshots materiais calculados a partir dele.
- Estornos ou correções são expressos como novas transações compensatórias, mantendo a trilha de auditoria completa.

## Consequences

- **Positivas:**
  - Rastreabilidade e auditabilidade contábil e fiscal completa (essencial para IRPF e informes de rendimentos).
  - Imutabilidade histórica: qualquer posição em qualquer data do passado pode ser recalculada de forma determinística.
  - Prevenção contra criação ou destruição inadvertida de saldo/patrimônio.
- **Negativas:**
  - Maior volume de registros no banco de dados e necessidade de estratégias eficientes de indexação e snapshots periódicos em fases futuras.
