# ADR-004: Transaction Ledger como Source of Truth

## Status

Accepted

## Context

Em sistemas de controle patrimonial convencionais, muitas vezes o saldo da conta ou a quantidade em custódia de um ativo é armazenado como uma coluna mutável que sofre operações destrutivas (`UPDATE balance = balance + X`). Em caso de falha de concorrência, reprocessamento de notas de corretagem ou necessidade de auditoria histórica, torna-se impossível determinar o estado exato da carteira em datas anteriores ou auditar discrepâncias.

Por outro lado, impor formalmente contabilidade bancária por partidas dobradas (débitos e créditos estritos com plano de contas completo) agregaria sobrecarga e atrito desnecessários para a modelagem de eventos de investimentos brasileiros (splits, bonificações, proventos, subscrições e transferências).

## Decision

Adotar o **Transaction Ledger (Livro de Transações Imutável e Append-Only)** como a **Fonte Única da Verdade (Source of Truth)** para o Project Atlas:

- O histórico canônico da plataforma é formado exclusivamente por operações e eventos financeiros imutáveis.
- Todo o estado patrimonial da carteira — incluindo Posições em custódia (`Position`), preço médio (`average cost`), custo total (`total cost`), ganho de capital realizado (`realized gain`) e fotos patrimoniais (`portfolio snapshots`) — é **estritamente derivado e recalculável** a partir do histórico de transações.
- O fluxo arquitetural canônico é:
  ```text
  Transactions / Events (Ledger)
            ↓
     Portfolio Engine
            ↓
      Derived State
  ```
- O Atlas **NÃO** adota contabilidade formal de partidas dobradas.
- Estornos, correções ou cancelamentos devem ser expressos por eventos compensatórios ou mecanismos controlados de auditoria do ledger, preservando a imutabilidade do registro original.

## Consequences

- **Positivas:**
  - Auditabilidade e rastreabilidade total: qualquer posição ou preço médio em qualquer data passada pode ser reconstruído deterministicamente a partir dos eventos.
  - Modelo conceitual alinhado às operações reais de mercado de capitais (B3, custódias e corretoras).
  - Prevenção contra inconsistências de dados e estados corrompidos por escritas parciais ou concorrentes.
- **Negativas:**
  - Exige que o cálculo de posições e preço médio seja processado pelo `Portfolio Engine` através da reconstituição dos eventos, demandando estratégias de snapshots materiais e caching em fases futuras.
