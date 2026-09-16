# ADR-029: Fronteira Servidor/Cliente e Arquitetura Next.js 15 App Router

## Status

Aprovado

## Contexto

O Project Atlas adota Next.js 15 com App Router e React 19. É imperativo estabelecer diretrizes claras sobre a fronteira entre React Server Components (RSC), Client Components (`'use client'`), Middleware de borda e Route Handlers, garantindo segurança de tokens, performance de carregamento e ausência de erros de hidratação.

## Decisão

1. **Next.js Edge Middleware (`apps/web/src/middleware.ts`):**
   - Atua na camada perimetral antes de qualquer renderização de página.
   - Analisa a presença dos cookies de sessão (`atlas_refresh` ou `atlas_logged_in`).
   - Redireciona usuários não-autenticados que tentam acessar o grupo protegido `(app)` (`/today`, `/portfolio`, etc.) para `/login?redirect=...`.
   - Redireciona usuários já autenticados que tentam acessar o grupo público `(auth)` (`/login`, `/register`, etc.) para `/today`.
2. **Client Components e Suspense Boundaries:**
   - Telas interativas com formulários, estados dinâmicos e consumo de search params são declaradas com `'use client'` e envelopadas obrigatoriamente em `<Suspense fallback={...}>`, impedindo interrupções no build estático do Next.js 15.
3. **App Shell Responsivo Unificado (`apps/web/src/app/(app)/layout.tsx`):**
   - Implementa uma casca visual responsiva contendo:
     - Sidebar lateral no Desktop com 5 seções centrais (`Hoje`, `Carteira`, `Mercado`, `Fiscal`, `IA`);
     - Header superior com navegação, informações de perfil e atalho de logout;
     - Bottom Navigation Bar no Mobile com os 5 ícones fundamentais;
     - Banner de conectividade offline (`OfflineBanner`) visível reativamente.

## Consequências

- **Positivas:**
  - Carregamento instantâneo via pré-renderização estática com hidratação resiliente.
  - Segurança de rotas garantida antes do envio de qualquer componente cliente ao navegador.
- **Negativas / Mitigações:**
  - Requer envelopamento explícito com `<Suspense>` para componentes que utilizam `useSearchParams()`.
