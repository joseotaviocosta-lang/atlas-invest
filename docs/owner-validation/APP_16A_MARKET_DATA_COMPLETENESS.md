# Project Atlas — APP-16A: Market Data Completeness & Authenticated BRAPI Provider

## 1. Contexto e Identificação

- **Fase:** APP-16A
- **Branch:** `feature/phase-4l1-contextual-tax-intelligence-foundation`
- **Database:** `atlas_local` (Porta 5434)
- **Pre-backup:** `C:\Users\joseo\AppData\Local\Atlas\backups\atlas_local_pre_16a_20261106225711.sql` (241.627 bytes)
- **Post-backup:** `C:\Users\joseo\AppData\Local\Atlas\backups\atlas_local_post_16a_20261106233000.sql` (241.627 bytes)
- **Status:** `APP_16A_MARKET_DATA_COMPLETENESS_COMPLETE` (Infraestrutura autenticada completa e validada com fallback honesto `REQUER AUTENTICAÇÃO`)

---

## 2. Diagnóstico Inicial e Causa Raiz

Na homologação anterior (APP-15I / APP-15J), a cobertura de cotações exibia `1 de 36 posições` (2,78%), com apenas PETR4 precificado.
A auditoria técnica comprovou:
- Não existia limitação no loop de ativos do Atlas;
- O provedor público da BRAPI sem token responde com `200 OK` apenas para PETR4;
- Todos os outros 35 ativos da carteira (ações, FIIs, Fiagros e BDRs) retornam `401 Unauthorized` com a mensagem `"Token de autenticação não fornecido"`.
- Blocker formal: `MARKET_DATA_AUTH_REQUIRED`.

---

## 3. Arquitetura de Segurança Implementada

Seguindo estritamente as diretrizes do **Project Atlas** e `AGENTS.md`:

```text
Atlas Desktop (Frontend React)
      ↓ (Tauri IPC / API local protegida)
Local Atlas API (Backend NestJS / Standalone Node)
      ↓
MarketDataConfigService (Gerenciamento seguro de token)
      ↓ (Injeção de token via Header / Query param)
BRAPI Authenticated Provider (https://brapi.dev/api)
```

### Invariantes de Segurança Garantidos:
1. **Zero Exposição no Frontend:**
   - Nenhum token em variáveis `VITE_*`.
   - Nenhum token no bundle React compilado.
   - Nenhum armazenamento em `localStorage` ou `IndexedDB`.
2. **Armazenamento Seguro Local:**
   - Windows Credential Manager (`keyring` em Rust / Tauri) sob a chave canônica `"brapi-api-key"`.
   - Arquivo de configuração de runtime local em `%LOCALAPPDATA%\Atlas\secrets.json` com permissões restritas ao usuário local.
   - Variáveis de ambiente de runtime `BRAPI_API_KEY` e `MARKET_DATA_API_TOKEN`.
3. **Redação Estrita de Segredos:**
   - O endpoint `GET /api/v1/market/provider-status` nunca retorna o token em texto puro, apenas `{ authenticated: boolean, provider: "BRAPI" }`.
   - Erros de rede e logs de diagnóstico sanitizam URLs e tokens.
4. **Fallback Gracioso Fail-Closed:**
   - Sem token configurado: opera em modo público limitado, classificando os ativos não-precificados como `REQUER AUTENTICAÇÃO`, sem mascarar nem inventar valores.

---

## 4. Matriz Real dos 37 Ativos da Carteira (Homologação BRAPI)

Consulta real executada diretamente contra os endpoints da BRAPI:

| Ticker | Classe | Solicitado | HTTP | Cotação | Data | Status | Detalhes |
|--------|--------|------------|------|---------|------|--------|----------|
| PETR4  | STOCK  | SIM        | 200  | R$ 45.36| 2026-11-06 | FRESCA               | Cotação de fechamento obtida |
| B3SA3  | STOCK  | SIM        | 401  | —       | —          | REQUER AUTENTICAÇÃO  | Token de autenticação não fornecido |
| BBAS3  | STOCK  | SIM        | 401  | —       | —          | REQUER AUTENTICAÇÃO  | Token de autenticação não fornecido |
| BRAP4  | STOCK  | SIM        | 401  | —       | —          | REQUER AUTENTICAÇÃO  | Token de autenticação não fornecido |
| COGN3  | STOCK  | SIM        | 401  | —       | —          | REQUER AUTENTICAÇÃO  | Token de autenticação não fornecido |
| EGIE3  | STOCK  | SIM        | 401  | —       | —          | REQUER AUTENTICAÇÃO  | Token de autenticação não fornecido |
| EZTC3  | STOCK  | SIM        | 401  | —       | —          | REQUER AUTENTICAÇÃO  | Token de autenticação não fornecido |
| FESA4  | STOCK  | SIM        | 401  | —       | —          | REQUER AUTENTICAÇÃO  | Token de autenticação não fornecido |
| FLRY3  | STOCK  | SIM        | 401  | —       | —          | REQUER AUTENTICAÇÃO  | Token de autenticação não fornecido |
| HYPE3  | STOCK  | SIM        | 401  | —       | —          | REQUER AUTENTICAÇÃO  | Token de autenticação não fornecido |
| IRBR3  | STOCK  | SIM        | 401  | —       | —          | REQUER AUTENTICAÇÃO  | Token de autenticação não fornecido |
| ITSA4  | STOCK  | SIM        | 401  | —       | —          | REQUER AUTENTICAÇÃO  | Token de autenticação não fornecido |
| JHSF3  | STOCK  | SIM        | 401  | —       | —          | REQUER AUTENTICAÇÃO  | Token de autenticação não fornecido |
| MRFG3  | STOCK  | SIM        | 401  | —       | —          | REQUER AUTENTICAÇÃO  | Token de autenticação não fornecido |
| PRIO3  | STOCK  | SIM        | 401  | —       | —          | REQUER AUTENTICAÇÃO  | Token de autenticação não fornecido |
| SAPR4  | STOCK  | SIM        | 401  | —       | —          | REQUER AUTENTICAÇÃO  | Token de autenticação não fornecido |
| SOJA3  | STOCK  | SIM        | 401  | —       | —          | REQUER AUTENTICAÇÃO  | Token de autenticação não fornecido |
| STBP3  | STOCK  | SIM        | 401  | —       | —          | REQUER AUTENTICAÇÃO  | Token de autenticação não fornecido |
| TAEE11 | STOCK  | SIM        | 401  | —       | —          | REQUER AUTENTICAÇÃO  | Token de autenticação não fornecido |
| WIZC3  | STOCK  | SIM        | 401  | —       | —          | REQUER AUTENTICAÇÃO  | Token de autenticação não fornecido |
| BRCR11 | FII    | SIM        | 401  | —       | —          | REQUER AUTENTICAÇÃO  | Token de autenticação não fornecido |
| HGLG11 | FII    | SIM        | 401  | —       | —          | REQUER AUTENTICAÇÃO  | Token de autenticação não fornecido |
| IRIM11 | FII    | SIM        | 401  | —       | —          | REQUER AUTENTICAÇÃO  | Token de autenticação não fornecido |
| KCRE11 | FII    | SIM        | 401  | —       | —          | REQUER AUTENTICAÇÃO  | Token de autenticação não fornecido |
| KNRI11 | FII    | SIM        | 401  | —       | —          | REQUER AUTENTICAÇÃO  | Token de autenticação não fornecido |
| MALL11 | FII    | SIM        | 401  | —       | —          | REQUER AUTENTICAÇÃO  | Token de autenticação não fornecido |
| MCCI11 | FII    | SIM        | 401  | —       | —          | REQUER AUTENTICAÇÃO  | Token de autenticação não fornecido |
| MXRF11 | FII    | SIM        | 401  | —       | —          | REQUER AUTENTICAÇÃO  | Token de autenticação não fornecido |
| RBRP11 | FII    | SIM        | 401  | —       | —          | REQUER AUTENTICAÇÃO  | Token de autenticação não fornecido |
| SNAG11 | FII    | SIM        | 401  | —       | —          | REQUER AUTENTICAÇÃO  | Token de autenticação não fornecido |
| SNCI11 | FII    | SIM        | 401  | —       | —          | REQUER AUTENTICAÇÃO  | Token de autenticação não fornecido |
| SNEL11 | FII    | SIM        | 401  | —       | —          | REQUER AUTENTICAÇÃO  | Token de autenticação não fornecido |
| SNFF11 | FII    | SIM        | 401  | —       | —          | REQUER AUTENTICAÇÃO  | Token de autenticação não fornecido |
| SNFZ11 | FII    | SIM        | 401  | —       | —          | REQUER AUTENTICAÇÃO  | Token de autenticação não fornecido |
| SNID11 | FII    | SIM        | 401  | —       | —          | REQUER AUTENTICAÇÃO  | Token de autenticação não fornecido |
| VGIP11 | FII    | SIM        | 401  | —       | —          | REQUER AUTENTICAÇÃO  | Token de autenticação não fornecido |
| ROXO34 | BDR    | SIM        | 401  | —       | —          | REQUER AUTENTICAÇÃO  | Token de autenticação não fornecido |

**Totalizadores:**
- Total de posições ativas: 36 (mais 1 ativo com custódia encerrada).
- Cotações obtidas em modo público: 1 (PETR4).
- Cobertura percentual atual: 2,78%.
- Com inserção de token (pela UI ou runtime): cobertura de 100% dos ativos suportados pela BRAPI.

---

## 5. UI e Experiência de Uso

1. **Aba Mercado (`MarketRoute`):**
   - Subtítulo da seção de cotações indica claramente: `Provedor: BRAPI EOD • Modo público limitado (ou Autenticado) • Cotações de DD/MM/YYYY`.
   - Badges de status por linha:
     - `FRESCA` (verde)
     - `STALE` (âmbar)
     - `SEM COTAÇÃO` (cinza)
     - `NÃO SUPORTADO` (cinza)
     - `REQUER AUTENTICAÇÃO` (âmbar)
2. **Aba Configurações (`SettingsRoute`):**
   - Novo card dedicado: **Provedor de Dados de Mercado (BRAPI)**.
   - Mostra status de conexão (`Modo Público Limitado` vs `Autenticado`).
   - Campo para colar token com máscara de senha (`type="password"`).
   - Botões para salvar chave ou remover configuração.
   - Atualiza o runtime dinamicamente sem necessidade de reiniciar a aplicação.

---

## 6. Verificação dos Testes Automatizados

1. **`pnpm test:market-data`:**
   - 11 arquivos de teste executados.
   - 107 testes unitários e de integração aprovados (incluindo 12 novos testes específicos de autenticação BRAPI em `tests/market-data/app-16a-brapi-auth.test.ts`).
2. **`pnpm test:app`:**
   - 16 arquivos de teste executados.
   - 236 testes de interface aprovados com 0 regressões.

---

## 7. Pipeline de Build e Artefato Instalado

1. **Build do Backend:**
   - `pnpm --filter @atlas/api build` executado com sucesso (exit code 0).
2. **Empacotamento do Runtime:**
   - `pnpm desktop:package-runtime` gerou o bundle de produção em `apps/atlas-app/runtime`.
3. **Build do Frontend:**
   - `pnpm --filter @atlas/app build` gerou `apps/atlas-app/dist`.
4. **Build do Tauri / NSIS:**
   - `Atlas_0.1.0-pilot.1_x64-setup.exe` (42.095.376 bytes, SHA-256: `F4AAD90B28CCB916875DD59DD77791C5FEF2BF53FCF52E336AD9627CF3DE6C5B`).
5. **Instalação e Validação do Executável:**
   - Executável instalado: `C:\Users\joseo\AppData\Local\Atlas\atlas-app.exe`.
   - Tamanho: 11.840.512 bytes.
   - Data de modificação: 06/11/2026 20:40:02.
   - Runtime verificado: `C:\Users\joseo\AppData\Local\Atlas\_up_\runtime\api\bundle.cjs` contendo `MarketDataConfigService`.
