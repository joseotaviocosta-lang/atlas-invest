# Atlas Design System

O **Atlas Design System** reside no pacote `@atlas/ui` (`packages/ui`) e fornece a fonte única da verdade para tokens visuais, contratos de componentes, regras de acessibilidade e formatadores para todas as plataformas do monorepo Project Atlas.

---

## 1. Arquitetura do Pacote `@atlas/ui`

```
packages/ui/src/
├── tokens/
│   ├── colors.ts        # Paleta semântica completa (background, surface, borders, text, accents)
│   ├── typography.ts    # Escala tipográfica (display, heading1..3, body, label, caption)
│   ├── spacing.ts       # Escala de espaçamento em múltiplos de 4 (0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64)
│   ├── radius.ts        # Raios de borda padronizados (sm, md, lg, xl, pill)
│   ├── shadows.ts       # Sombras com elevação semântica (sm, md, lg, modal)
│   └── breakpoints.ts   # Breakpoints de responsividade (mobile, tablet, desktop)
├── navigation.ts        # Definição canônica das 5 áreas (Hoje, Carteira, Mercado, Fiscal, IA) + Perfil
├── formatters.ts        # Funções puras de formatação (moeda BRL/USD, percentual e datas ISO/BR)
├── contracts.ts         # Contratos e tipos TypeScript para todos os componentes
└── index.ts             # Exportações públicas centralizadas
```

---

## 2. Tokens de Design

### 2.1. Cores Semânticas (`colors`)
Todas as cores são semânticas para permitir temas futuros e evitar uso de hexadecimais arbitrariamente:
- **Backgrounds:** `background` (`#0D1117`), `surface` (`#161B22`), `surfaceElevated` (`#21262D`)
- **Bordas:** `border` (`#30363D`), `borderFocus` (`#58A6FF`)
- **Texto:** `textPrimary` (`#F0F6FC`), `textSecondary` (`#8B949E`), `textMuted` (`#484F58`)
- **Ações e Destaque:** `accent` (`#238636`), `accentHover` (`#2EA043`), `accentSubtle` (`rgba(35, 134, 54, 0.15)`)
- **Feedback:**
  - `positive` (`#3FB950`), `positiveSubtle` (`rgba(63, 185, 80, 0.15)`)
  - `negative` (`#F85149`), `negativeSubtle` (`rgba(248, 81, 73, 0.15)`)
  - `warning` (`#D29922`), `warningSubtle` (`rgba(210, 153, 34, 0.15)`)
  - `info` (`#58A6FF`), `infoSubtle` (`rgba(88, 166, 255, 0.15)`)

### 2.2. Tipografia (`typography`)
- **`display`:** 32px / line-height 40px / weight 700
- **`heading1`:** 24px / line-height 32px / weight 700
- **`heading2`:** 20px / line-height 28px / weight 600
- **`heading3`:** 16px / line-height 24px / weight 600
- **`body`:** 14px / line-height 20px / weight 400
- **`bodySmall`:** 12px / line-height 16px / weight 400
- **`label`:** 12px / line-height 16px / weight 600
- **`caption`:** 11px / line-height 14px / weight 400

### 2.3. Espaçamento (`spacing`)
Segue a escala padrão: `0`, `2px` (xxs), `4px` (xs), `8px` (sm), `12px` (md), `16px` (base), `20px` (lg), `24px` (xl), `32px` (2xl), `40px` (3xl), `48px` (4xl), `64px` (5xl).

### 2.4. Breakpoints de Responsividade (`breakpoints`)
- **`mobile`:** `< 768px` (Navegação inferior mobile, colunas empilhadas)
- **`tablet`:** `768px .. 1279px` (Sidebar colapsada ou visível, grid 2 colunas)
- **`desktop`:** `>= 1280px` (Sidebar completa fixa, container max-width 1280px)

---

## 3. Formatadores Oficiais (`formatters.ts`)

| Função | Assinatura | Exemplo de Entrada | Saída Formatada |
| :--- | :--- | :--- | :--- |
| `formatCurrency` | `(value: number \| null \| undefined, currency = 'BRL') => string` | `12345.67` | `R$ 12.345,67` |
| `formatPercentage` | `(value: number \| null \| undefined, decimals = 2) => string` | `15.89` | `+15,89%` |
| `formatDate` | `(date: string \| Date \| null \| undefined, format = 'short') => string` | `'2026-03-31'` | `31/03/2026` |

*Nota:* Valores nulos ou indefinidos retornam automaticamente o travessão honesto `—`.

---

## 4. Contratos de Componentes (`contracts.ts`)

Todos os componentes implementados no Web (`apps/web/src/components/ui`) e Mobile (`apps/mobile/src/components/ui`) devem aderir estritamente aos contratos:
- `ButtonProps`: variantes `primary`, `secondary`, `outline`, `ghost`, `danger`; tamanhos `sm`, `md`, `lg`; estados `isLoading`, `disabled`.
- `InputProps` & `PasswordInputProps`: labels acessíveis, mensagens de erro, indicação de obrigatoriedade.
- `StatCardProps`: título, valor numérico ou placeholder `—`, variação contextual e variação percentual.
- `TabsProps`: abas com suporte completo a WAI-ARIA (`role="tab"`, `aria-selected`, atalhos de teclado de setas direcionais).
- `ModalProps`: foco retido (focus trap), tecla Escape para fechamento, acessibilidade de título `aria-labelledby`.
- `ToastProps`: notificações temporárias para feedback de ações (`success`, `error`, `info`, `warning`).

---

## 5. Diretrizes de Acessibilidade

1. **Alvos de Toque (Touch Targets):** Mínimo de 44x44px para botões, chips e itens clicáveis.
2. **Navegação por Teclado:** Suporte total a `Tab`, `Shift+Tab`, `Enter`, `Space` e `Escape`.
3. **Alto Contraste:** Relação de contraste mínima de 4.5:1 para texto normal e 3:1 para texto grande em relação aos backgrounds.
4. **Sem Dependência de Cor Única:** Indicadores visuais de erro ou sucesso sempre acompanham ícones ou texto descritivo.
