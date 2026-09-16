# Especificação Técnica do Product Shell — Project Atlas

## 1. Visão Geral

O **Product Shell** estabelece a estrutura de interface visual, navegação, hierarquia de telas e estados de interação padronizados entre as aplicações Web (`apps/web`) e Mobile (`apps/mobile`) do Project Atlas.

O shell foi projetado com foco em:

- **Clareza Patrimonial:** Foco absoluto nas decisões do investidor.
- **Honestidade Visual:** Zero gráficos de demonstração ou valores fictícios gerados aleatoriamente; uso obrigatório de travessão (`—`) quando métricas dependem de motores ainda não calculados.
- **Acessibilidade:** Padrões WAI-ARIA, touch targets mínimos de 44x44px, navegação por teclado e contraste compatível com WCAG AA.
- **Resiliência:** Tratamento sistemático de loading, erro, estado vazio e modo offline.

---

## 2. As 5 Áreas Canônicas de Navegação

A navegação primária do produto é composta por 5 áreas canônicas, complementadas pela área de suporte do investidor:

### 2.1. Hoje (`/today`)

- **Propósito:** Ponto de entrada diário do investidor após login ou onboarding.
- **Componentes:**
  - Saudação personalizada com base no horário (`Bom dia`, `Boa tarde`, `Boa noite`).
  - StatCards de alto nível: Patrimônio Total (`—`), Rentabilidade do Mês (`—`), Proventos Provisionados (`—`), Status Fiscal (`Em dia`).
  - Alerta contextual para novos usuários incentivando a adição do primeiro ativo.
  - Seções de Acesso Rápido para carteiras e novidades do mercado.

### 2.2. Carteira (`/portfolio`)

- **Propósito:** Gestão aprofundada dos ativos e consolidação patrimonial.
- **Componentes:**
  - `PortfolioSwitcher`: Seleção rápida da carteira ativa ou visualização consolidada, além do botão para criar nova carteira (Modal acessível).
  - Navegação em Abas (Tabs):
    1. **Visão Geral:** Cards patrimoniais consolidados e resumo de alocação.
    2. **Ativos:** Listagem tabular de posições com estado honesto de espera pelo Portfolio Engine.
    3. **Rentabilidade:** Métricas TWR e XIRR (com aviso honesto de cálculo em background).
    4. **Histórico:** Timeline de aportes, resgates e eventos corporativos.
    5. **Alocação:** Metas de balanceamento por classe de ativo.
    6. **Operações:** Histórico de ordens de compra e venda cadastradas no Ledger.

### 2.3. Mercado (`/market`)

- **Propósito:** Visão ampla do mercado de capitais sem ruído especulativo.
- **Componentes:**
  - Abas:
    1. **Radar de Oportunidades:** Indicadores fundamentalistas e triagem.
    2. **Watchlist:** Ativos acompanhados pelo investidor.
    3. **Calendário Econômico:** Divulgação de balanços, dividendos e taxas de juros (Copom/Fed).
    4. **Notícias Curadas:** Feed de notícias macroeconômicas com filtros de relevância.

### 2.4. Fiscal (`/tax`)

- **Propósito:** Apuração tributária rigorosa e suporte à declaração de imposto de renda.
- **Componentes:**
  - Abas:
    1. **Resumo:** Alertas fiscais do ano-calendário.
    2. **Mês Atual:** Vendas realizadas no mês e apuração do limite de isenção de R$ 20.000 (Ações).
    3. **DARF:** Guias pendentes ou pagas com códigos oficiais da Receita Federal (ex: 6015).
    4. **Prejuízos a Compensar:** Saldo acumulado por classe de ativo (Ações, FIIs, Cripto).
    5. **IRPF Anual:** Relatório consolidado para a Declaração de Ajuste Anual da Receita Federal.

### 2.5. IA Contextual (`/ai`)

- **Propósito:** Copiloto de inteligência financeira conectado à carteira do usuário.
- **Componentes:**
  - Layout conversacional com histórico de mensagens.
  - Chips de sugestão pré-configurados: "Como está minha diversificação?", "Qual meu saldo de prejuízos a compensar?", "Tenho DARF a pagar este mês?".
  - Campo de entrada com indicação clara de disponibilidade ("Disponível na Fase de Inteligência").

### 2.6. Perfil e Segurança (`/profile`)

- **Propósito:** Configurações da conta, preferências globais e auditoria de segurança.
- **Componentes:**
  - Dados cadastrais (Nome, E-mail, ID único de usuário).
  - Preferências do Sistema: Moeda Base (BRL / USD), Idioma, Tema (Dark Mode padrão).
  - Status de Segurança da Sessão: Validação de isolamento do TanStack Query, armazenamento de token volátil em memória e expiração.
  - Ação de Logout com destruição completa de cookies e expurgo do cache do cliente.

---

## 3. Fluxo de Onboarding (`/onboarding`)

1. **Gatilho de Entrada:** Redirecionamento automático após conclusão do cadastro (`/register`).
2. **Passo 1 — Boas-vindas:**
   - Mensagem introdutória sobre a metodologia do Atlas (Ledger contábil, precisão decimal sem float).
3. **Passo 2 — Primeira Carteira:**
   - Formulário com nome da carteira (padrão: "Carteira Principal"), descrição e moeda base.
   - Chamada direta a `POST /api/portfolios`.
4. **Passo 3 — Método de Início:**
   - Três opções disponíveis:
     - _Adicionar ativos manualmente:_ Redireciona para `/portfolio`.
     - _Importar notas / Extratos:_ Marcado como "Em breve".
     - _Explorar o Atlas primeiro:_ Redireciona para `/today`.
5. **Regra de Bypass:** Caso um investidor com carteiras já existentes acerte a rota `/onboarding`, o middleware web redireciona-o imediatamente para `/today`.

---

## 4. Padrões de Estados de Interface

| Estado            | Comportamento no Web                                                                   | Comportamento no Mobile                                            |
| :---------------- | :------------------------------------------------------------------------------------- | :----------------------------------------------------------------- |
| **Loading**       | Esqueletos pulsantes (Skeletons) com altura e largura fiéis ao conteúdo real           | Componente `ActivityIndicator` nativo ou skeletons dedicados       |
| **Empty State**   | Ícone temático, título descritivo, mensagem clara e botão de ação primária             | Card centralizado com ilustração sem ruído e botão de ação touch   |
| **Error State**   | Mensagem de erro amigável (sem expor stack traces técnicos) e botão "Tentar novamente" | Toast ou banner de aviso com botão de reload                       |
| **Offline State** | Banner fixo no topo do layout avisando que a rede está indisponível                    | Banner persistente no topo da tela com sincronização ao reconectar |

---

## 5. Política de Honestidade de Dados Financeiros

O Project Atlas estabelece como regra inegociável de engenharia e produto:

1. **Nenhum Dado Fictício:** Nunca inventar saldos patrimoniais, rentabilidades ou tickers não cadastrados.
2. **Placeholder Universal:** Quando um indicador depender de um motor que ainda está sendo implementado, o valor numérico é estritamente substituído pelo travessão `—`.
3. **Subtítulos Contextuais:** Junto ao placeholder `—`, exibe-se texto explicativo como _"Disponível com Portfolio Engine"_ ou _"Aguardando histórico de cotações"_.
