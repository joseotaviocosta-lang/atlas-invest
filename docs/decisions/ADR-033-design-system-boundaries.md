# ADR-033: Fronteiras do Design System e Contratos de Componentes

## Status

Aprovado

## Contexto

Um dos riscos em monorepos que atendem Web (DOM/HTML/CSS/Next.js) e Mobile (React Native/Yoga/Expo) é o acoplamento prematuro em bibliotecas de componentes "universais" complexas ou a dispersão descontrolada de tokens e estilos divergentes em cada plataforma.

## Decisão

1. **Tokens Compartilhados Agnósticos de Runtime:**
   - O pacote `packages/ui` é a autoridade máxima e central para tokens de design (`colors`, `typography`, `spacing`, `borderRadius`, `shadows`, `breakpoints`), formatação monetária/datas (`formatCurrency`, `formatPercentage`, `formatDate`) e constantes de navegação.
   - O pacote não introduz dependências pesadas de runtime DOM ou React Native nativo, permitindo consumo direto tanto em Next.js quanto em React Native.

2. **Contratos Estritos de Componentes (`contracts.ts`):**
   - O pacote define contratos TypeScript formais para todos os componentes do sistema: `ButtonProps`, `InputProps`, `CardProps`, `StatCardProps`, `BadgeProps`, `ModalProps`, `TabsProps`, etc.
   - Cada plataforma (Web e Mobile) implementa seus componentes respeitando essas variantes (`primary`, `secondary`, `outline`, `ghost`, `danger`), tamanhos (`sm`, `md`, `lg`) e acessibilidade (`aria-*`, roles, focus traps, touch targets mínimos de 44x44px).

3. **Proibição de Cores Raw em Regras de Negócio e Telas:**
   - Telas e componentes não devem usar valores literais de cores (como `green500` ou `#10b981`). Devem consumir exclusivamente tokens semânticos (`positive`, `negative`, `accent`, `surface`, `border`, `textPrimary`, etc.).

## Consequências

- **Positivas:**
  - Consistência visual absoluta entre Web e Mobile sem os problemas de performance e compatibilidade de pontes universais artificiais.
  - Testabilidade unitária facilitada dos tokens e contratos via Vitest.
- **Negativas / Limitações:**
  - Exige implementação dos componentes nas duas plataformas, porém ambas guiadas pelos mesmos contratos e tokens tipados.
