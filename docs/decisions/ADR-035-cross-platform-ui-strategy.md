# ADR-035: Estratégia de Interface Cross-Platform (Web & Mobile)

## Status

Aprovado

## Contexto

O Project Atlas atende usuários tanto em navegadores web (desktop, tablets e mobile web) quanto em aplicativos móveis nativos (iOS e Android via Expo/React Native). Era necessário definir como garantir paridade de experiência, acessibilidade e design sem comprometer as particularidades e o desempenho de cada plataforma.

## Decisão

1. **Separação de Camadas:**
   - **Shared Core (`packages/ui`):** Fornece tokens imutáveis, funções puras de formatação e tipagem dos contratos de UI.
   - **Web Shell (`apps/web`):** Utiliza HTML5 semântico, Next.js App Router, CSS responsivo com container queries / flexbox / grid e acessibilidade WAI-ARIA (roles `tab`, `tablist`, focus traps em diálogos modais, navegação por teclado).
   - **Mobile Shell (`apps/mobile`):** Utiliza componentes nativos React Native (`View`, `Text`, `Pressable`, `ScrollView`), Expo Router e interações táteis com área de toque mínima de 44x44 pontos.

2. **Paridade Funcional e de Estados:**
   - Ambas as plataformas implementam as 5 áreas canônicas com a mesma hierarquia de abas e seções.
   - Ambas implementam estritamente o princípio de honestidade visual: nenhum dado financeiro falso ou gráfico sintético. Quando dados não estão disponíveis (ex: enquanto o Portfolio Engine não estiver conectado), o placeholder oficial é sempre o travessão (`—`) com nota explicativa clara.
   - Estados de loading (skeletons), erro, empty state e offline banner são simétricos em ambas as aplicações.

## Consequências

- **Positivas:**
  - Desempenho máximo e fidelidade de plataforma em cada ecossistema (web responsiva veloz e app nativo fluido).
  - Previne bugs decorrentes de abstrações universais "leak-prone" (como wrappers CSS-in-JS transpilados entre web e native).
