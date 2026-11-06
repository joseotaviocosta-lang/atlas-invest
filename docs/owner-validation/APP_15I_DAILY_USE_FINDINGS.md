# PROJECT ATLAS — APP-15I: OWNER DAILY USE WITH DOCUMENTARY EXCEPTIONS
# RELATÓRIO DE VALIDAÇÃO E IMPLEMENTAÇÃO DO USO DIÁRIO

**Data:** 06/11/2026  
**Repositório:** `C:\Projetos\atlas-invest`  
**Branch:** `feature/phase-4l1-contextual-tax-intelligence-foundation`  
**Runtime:** `DESKTOP_LOCAL_OWNER`  
**Database:** `atlas_local` (PostgreSQL 18 na porta 5434)  
**API Local:** `http://127.0.0.1:3001` (`x-atlas-client: desktop-local`)  
**Status Declarado:** **`APP_15I_AUTOMATED_DAILY_USE_VALIDATION_COMPLETE_OWNER_USAGE_PENDING`**

---

## 1. Contexto e Objetivo da Fase

Após o encerramento do discovery documental da fase APP-15H, confirmou-se que não há documentos locais disponíveis na máquina do Owner para comprovar os custos de aquisição pré-28/11/2019 de 3 posições específicas (`ITSA4`, `JHSF3` e `SAPR4`).

O objetivo da fase **APP-15I** é transformar o Atlas Desktop em uma ferramenta pronta, confiável e prazerosa para o **uso diário real do Owner**, com as seguintes premissas inegociáveis:
1. **Tratamento elegante de exceções documentais:** Não tratar a carteira como "com erro" ou emitir alertas vermelhos agressivos na tela inicial. A carteira é 100% válida e operante.
2. **Separação nítida entre Carteira e Fiscal:**
   - **Carteira (`/portfolio`, `/today`):** Status `AVAILABLE`, 36 ativos em custódia, cotações atualizadas, patrimônio total de mercado calculado, histórico imutável íntegro.
   - **Fiscal (`/tax`):** Competência 2026-10 em status `BLOCKED` via princípio `Fail-Closed`, protegendo o investidor contra apuração tributária com base em custo zero presumido.
3. **Honestidade visual estrita:** Posições com custo incompleto exibem `Preço Médio: — (Pendente)` e **nunca** `R$ 0,00`.
4. **Linguagem amigável:** Substituição de jargões técnicos internos por mensagens claras e orientadas ao investidor.

---

## 2. Diagnóstico da Carteira Real no Banco Local

A execução do replay determinístico no banco local `atlas_local` consolida o seguinte cenário:

| Métrica | Valor Auditado | Status |
| :--- | :---: | :--- |
| **Total de Posições Ativas** | 36 | 100% reconciliadas com a custódia oficial B3 |
| **Posições com Custo 100% Auditado** | 33 | Base de custo canônica auditada via ledger |
| **Posições com Pendência Documental** | 3 | `ITSA4`, `JHSF3`, `SAPR4` (compras pré-28/11/2019) |
| **Total de Transações no Ledger** | 145 | Imutáveis (append-only), zero SQL manual |
| **Competência Fiscal 2026-10** | `BLOCKED` | Fail-Closed ativo para as 3 alienações afetadas |
| **Competências Anteriores** | Regulares | Sem débitos ou pendências |

---

## 3. Implementação e Componentes de UX Entregues

### 3.1. Banner Não-Invasivo de Exceções Documentais (`DocumentaryExceptionsBanner.tsx`)
- Localizado em `apps/atlas-app/src/features/portfolio/components/DocumentaryExceptionsBanner.tsx`.
- Estilizado em tom âmbar neutro suave (`colors.warning` a 6% de opacidade com borda sutil), sem alarmismo visual.
- Mensagem: *"3 posições possuem custo anterior a 28/11/2019 pendente de comprovação (ITSA4, JHSF3, SAPR4). Cotações e patrimônio operam normalmente."*
- Botão interativo *"Ver detalhes"* que dispara o modal explicativo.
- Integrado organicamente em:
  - `TodayRoute.tsx`: Acima da seção de principais posições em custódia.
  - `PortfolioRoute.tsx`: Acima da tabela completa de posições na aba Posições.

### 3.2. Modal Explicativo de Pendências Documentais (`DocumentaryExceptionsModal.tsx`)
- Localizado em `apps/atlas-app/src/features/portfolio/components/DocumentaryExceptionsModal.tsx`.
- Detalha para o Owner exatamente quais são os ativos afetados:
  - **ITSA4:** Aquisição de 900 ações anterior a 28/11/2019;
  - **JHSF3:** Aquisição de 600 ações anterior a 28/11/2019;
  - **SAPR4:** Aquisição de 3.300 ações anterior a 28/11/2019.
- Orienta o documento comprobatório exato: *Cópia da DIRPF 2020 (Ano-calendário 2019 — Bens e Direitos) ou notas de corretagem da época*.
- Apresenta quadro comparativo:
  - **Funcionamento Normal (Verde):** Acompanhamento patrimonial diário, cotações de fechamento, valor de mercado, proventos (dividendos e JCP) e alocação percentual.
  - **Proteção Fiscal (Âmbar):** Apuração suspensa nas vendas de outubro/2026 para proteger contra recolhimento incorreto ou custo zero presumido.

### 3.3. Refinamento de Posições e Preço Médio (`PositionsTable.tsx` & `PositionDetailModal.tsx`)
- Posições com `costBasisStatus === 'INCOMPLETE'` renderizam explicitamente `— (Pendente)` na coluna de Preço Médio e Custo Total.
- **PROIBIDO** o uso de `R$ 0,00` como custo substitutivo.
- No modal de detalhes da posição (`PositionDetailModal`), o badge exibe `DOCUMENTAÇÃO PENDENTE` com nota contextual explicativa.

### 3.4. Humanização de Textos Fiscais (`CostEvidenceBanner.tsx`)
- Ajustadas as mensagens do banner fiscal para português amigável e orientativo.
- Explicita os ativos afetados (`ITSA4`, `JHSF3`, `SAPR4`) e orienta a ação recomendada na aba *Base de Custo & Evidências*.

---

## 4. Validação das Rotas de Uso Diário do Owner

| Rota | Tela / Recurso | Resultado da Validação |
| :--- | :--- | :--- |
| `/today` | Resumo Executivo Diário | Boas-vindas ao Owner, KPIs de patrimônio, contexto macroeconômico Bacen/IBGE, banner informativo de custo pendente e top 5 posições. |
| `/portfolio` | Carteira Completa | Exibição das 36 posições em custódia, preço médio com indicação de `— (Pendente)` nos 3 ativos históricos, alternador de abas (Posições, Alocação, Rentabilidade, Histórico). |
| `/market` | Mercado & Indicadores | Cotações diárias, indicadores macroeconômicos e status das fontes externas. |
| `/tax` | Inteligência Fiscal | Segregação clara: competência 2026-10 com Fail-Closed ativo sem afetar o restante do sistema. Abas de apuração mensal, DIRPF anual, evidências de custo e conformidade. |
| `/profile` | Perfil & Configurações | Modo Desktop Local identificado, versão do app, build SHA, botão sanitizado de exportação de diagnóstico e opção de fechar o Atlas. |

---

## 5. Garantias de Integridade e Regras do Monorepo

- **Zero Floats:** Todos os valores continuam estritamente formatados a partir de strings decimais e tipos canônicos de domínio.
- **Zero Custos Inventados:** O Atlas manteve fidelity absoluta aos fatos históricos; nenhum preço de fechamento ou valor arbitrado foi inserido no ledger.
- **Ledger Imutável:** O livro-razão permaneceu intacto, operando exclusivamente em regime append-only.
- **Fail-Closed Preservado:** A suspensão de cálculo tributário permanece ativa para proteger o investidor.

---

## 6. Resultados da Suíte de Testes

| Test Suite / Comando | Escopo | Resultado |
| :--- | :--- | :---: |
| `tsc --noEmit` (`@atlas/app`) | Verificação de tipos TypeScript | **APROVADO (0 erros)** |
| `pnpm test:app` | 15 arquivos de teste / 227 testes unitários e de integração | **APROVADO (227/227)** |
| `pnpm test:api-client` | 2 arquivos de teste / 35 testes de cliente HTTP | **APROVADO (35/35)** |
| `cargo check` (`src-tauri`) | Compilação e vinculação nativa Tauri Rust | **APROVADO (0 warnings/erros)** |
| `pnpm --filter @atlas/app build` | Build Vite de produção | **APROVADO (3.24s)** |
| `git diff --check` | Formatação e ausência de trailing whitespace | **APROVADO (0 erros)** |

---

## 7. Próximos Passos Recomendados

1. **Uso Diário pelo Owner:** O investidor pode utilizar o Atlas Desktop no seu cotidiano para acompanhar sua carteira real de 36 ativos e cotações.
2. **Resolução Documental Futura:** Caso o Owner localize futuramente a declaração de IRPF 2020 ou as notas de corretagem de 2019, o custo de ITSA4, JHSF3 e SAPR4 poderá ser registrado através da camada de evidências da API, desbloqueando a apuração de 10/2026 de forma 100% auditada.

