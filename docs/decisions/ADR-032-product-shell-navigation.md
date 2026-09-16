# ADR-032: Navegação Canônica e Arquitetura do Product Shell

## Status

Aprovado

## Contexto

Com as fundações de domínio, banco, API, autenticação, mobile e web consolidadas (Fases 0A a 0G), o Atlas necessita de uma estrutura de navegação estável, consistente e unificada entre Web e Mobile, evitando dispersão arquitetural ou duplicação de conceitos entre plataformas.

## Decisão

1. **5 Áreas Canônicas de Navegação:**
   O produto adota exatamente 5 seções principais de primeiro nível:
   - **Hoje (`today`):** Visão diária, resumo patrimonial contextual, novidades e alertas relevantes.
   - **Carteira (`portfolio`):** Gestão de patrimônio, visualização por tabs (Visão Geral, Ativos, Rentabilidade, Histórico, Alocação, Operações) e alternador de carteiras.
   - **Mercado (`market`):** Painel do mercado de capitais (Radar, Watchlist, Calendário, Notícias).
   - **Fiscal (`tax`):** Controle tributário do investidor (Resumo, Mês Atual, DARF, Prejuízos, IRPF Anual).
   - **IA (`ai`):** Assistente contextual do investidor (conversação assistida e sugestões contextualizadas).

2. **Área de Suporte e Identidade (`profile`):**
   - Configurações do investidor, preferências de privacidade/moeda/tema, auditoria de segurança da sessão e logout explícito.
   - Acessível no cabeçalho universal no Web e na barra lateral / perfil no Mobile, sem poluir a navegação canônica primária.

3. **Consistência Cross-Platform:**
   - Na Web: Sidebar fixa em desktop (>= 768px), barra de navegação inferior sticky no mobile (< 768px).
   - No Mobile: Tab Bar nativa inferior com os mesmos 5 destinos e ícones equivalentes.

## Consequências

- **Positivas:**
  - Modelo mental uniforme e previsível para o investidor independente do dispositivo de acesso.
  - Alinhamento total com os futuros motores de cálculo e inteligência financeira.
- **Negativas / Limitações:**
  - Requer que todas as novas telas e submódulos sejam categorizados estritamente dentro de uma dessas 5 áreas canônicas.
