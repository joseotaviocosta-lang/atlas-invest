# ADR-034: Estratégia de Onboarding e Criação Inicial de Carteira

## Status

Aprovado

## Contexto

Um novo investidor que se cadastra no Project Atlas necessita de um fluxo guiado para criar sua primeira carteira e compreender o funcionamento do produto, sem que esse fluxo se torne um obstáculo intransponível ou cause inconsistências para usuários existentes que já possuem carteiras.

## Decisão

1. **Onboarding Não-Bloqueante em 3 Etapas:**
   - **Passo 1 (Boas-vindas):** Apresentação dos pilares do Atlas (clareza patrimonial, consolidação e inteligência contextual).
   - **Passo 2 (Primeira Carteira):** Coleta do nome da carteira (com default "Principal"), descrição opcional e moeda base (BRL).
   - **Passo 3 (Escolha do Método de Início):** Oferece caminhos honestos: Adicionar ativos manualmente, importação por nota/extrato (em breve) ou explorar a plataforma primeiro.
   - Permite pular ou concluir a qualquer momento, direcionando o investidor para a área Hoje (`/today`).

2. **Bypass Automático para Usuários Existentes:**
   - A middleware web e os guards inspecionam o estado de carteiras do investidor. Caso o investidor já possua ao menos uma carteira ativa, acessos diretos a `/onboarding` são automaticamente redirecionados para `/today`.
   - Novos registros bem-sucedidos são direcionados para `/onboarding` antes de `/today`.

3. **Persistência Real via API BFF:**
   - A criação da carteira no Onboarding utiliza o endpoint oficial `POST /api/portfolios` conectado ao repositório PostgreSQL, sem mocks temporários no banco nem dados sintéticos pré-populados.

## Consequências

- **Positivas:**
  - Primeira impressão profissional, fluida e clara para novos investidores.
  - Zero atrito para usuários antigos, com redirecionamento transparente.
- **Negativas / Limitações:**
  - O método de importação automático permanece sinalizado como "em breve" até as fases de conexão bancária e notas de corretagem.
