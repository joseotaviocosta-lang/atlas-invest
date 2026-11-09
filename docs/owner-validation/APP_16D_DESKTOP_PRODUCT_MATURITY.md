# PROJECT ATLAS — APP-16D: DESKTOP PRODUCT MATURITY REPORT
**Status:** `APP_16D_DESKTOP_PRODUCT_MATURITY_COMPLETE`  
**Data:** 09/11/2026  
**Ambiente:** `DESKTOP_LOCAL_OWNER` (Windows 11 x64)  
**Database:** `atlas_local` em PostgreSQL 18 (porta 5434)  
**Versão:** `0.1.0-pilot.1`  
**Installer SHA-256:** `DD44F3623008AA4F9326322C8C69F492AEF3B7B8DB9B2ACDF2B13A62BFEEB99F`  
**Installed `atlas-app.exe` SHA-256:** `64B6994561A9683857DFB780D799FB6987166B5595D625A4C4EC40B6ED1308DA`  

---

## 1. RESUMO EXECUTIVO

A fase **APP-16D (Desktop Product Maturity)** consolidou a transição do Project Atlas Desktop de uma *aplicação funcional* para um **produto desktop maduro, resiliente e pronto para o uso diário do investidor proprietário (Owner)**.

Nenhum cálculo financeiro foi alterado e nenhuma regra tributária foi modificada. O ledger de transações permaneceu estritamente imutável (append-only) e o banco de dados `atlas_local` preservou suas 48 migrations aplicadas com integridade total.

Foram implementadas 7 frentes principais de maturidade operacional:
1. **Local Backup UX (`LocalBackupCard`)**: Visualização em tempo real do diretório de backup, último snapshot, tamanho, checksum SHA-256 e acionamento de snapshot manual com feedback em tempo real.
2. **Restore Readiness (`RestoreReadinessCard`)**: Orientação passo a passo à prova de falhas com comando CLI exato para restauração (`psql -U atlas -h 127.0.0.1 -p 5434 -d atlas_local -f ...`), sem overwrite automático destrutivo.
3. **Review Inbox Noise Cleanup**: Isolamento de previews históricos de teste (`isHistorical`) e itens puramente informativos (`isInformative`). O badge do menu lateral agora reflete apenas itens com ação real pendente (`isActionable: true`), eliminando o falso alerta de 40 itens.
4. **Import Daily Workflow Guidance (`ImportSourceGuidanceCard`)**: Guia visual de 4 passos com cards explicativos para os 4 formatos suportados (Negociação B3, Movimentação B3, Relatório Anual e Extrato CSV Atlas).
5. **Operational Health Summary na tela Hoje (`OperationalHealthSummary`)**: Indicador discreto ("Atlas em dia" / "Atenção necessária") que agrega saúde do banco de dados, cobertura de cotações, freshness macroeconômico e pendências documentais sem fadiga de alerta.
6. **Settings Reorganization & Build Metadata**: Organização em abas temáticas (`Todas as Seções`, `Perfil`, `Mercado`, `Backup`, `Notificações`, `Diagnóstico`, `Sistema`) com exibição clara dos metadados de build (versão `0.1.0-pilot.1`, commit SHA, data e runtime).
7. **Process Recovery & Log Rotation**: Rotação automática de `api.log` no runtime Rust (`apps/atlas-app/src-tauri/src/runtime.rs`) quando excede 2MB (mantendo `api.log.old`), com sanitização rigorosa de credenciais e tokens.

---

## 2. MATRIZ DE MATURIDADE DE PRODUTO (15 DIMENSÕES)

| Dimensão | Estado Anterior | Estado Maduro (APP-16D) | Status |
|---|---|---|---|
| **1. Autonomia Operacional** | Dependia de scripts manuais para dump | Backup nativo via UI (`Criar Backup Agora`) + CLI documentado | **APROVADO** |
| **2. Integridade de Dados** | Backups esparsos sem validação | Checksum SHA-256 gerado e verificado automaticamente em cada dump | **APROVADO** |
| **3. Política de Retenção** | Acúmulo indefinido de arquivos `.sql` | Política canônica ativa: 7 diários, 4 semanais, 3 mensais (manuais preservados) | **APROVADO** |
| **4. Disaster Recovery** | Processo manual não documentado na UI | `RestoreReadinessCard` com diagnóstico do último dump e comando de restauração | **APROVADO** |
| **5. Higiene de Notificações** | Badge do menu lateral exibindo 40 previews de teste | Badge filtrado estritamente por `isActionable: true` (1 item real pendente) | **APROVADO** |
| **6. Organização de Inbox** | Lista linear de 40 itens misturados | Sub-abas (`Ação Necessária`, `Informativo`, `Histórico`, `Todas`) com contadores | **APROVADO** |
| **7. Experiência de Importação** | Dropzone direta sem contexto de formatos | `ImportSourceGuidanceCard` com fluxo de 4 passos e especificações dos 4 arquivos B3/Atlas | **APROVADO** |
| **8. Visibilidade de Saúde** | Usuário precisava navegar até Diagnóstico | `OperationalHealthSummary` no topo da tela Hoje com status unificado | **APROVADO** |
| **9. Navegação de Ajustes** | Rolagem longa desestruturada | Abas temáticas organizadas com seleção persistente e deep link preservado | **APROVADO** |
| **10. Rastreabilidade de Build** | Versão estática genérica sem SHA | Commit SHA, data de compilação e versão semântica visíveis na seção Sistema | **APROVADO** |
| **11. Gestão de Logs** | `api.log` crescia indefinidamente | Rotação automática (> 2MB rotaciona para `api.log.old`) com redaction de segredos | **APROVADO** |
| **12. Cobertura de Cotações** | Histórico recuperado, BRAPI autenticada | 36 de 36 posições precificadas (100% de cobertura) via BRAPI autenticada | **APROVADO** |
| **13. Indicadores Macro** | Incompletos ou não persistidos | IPCA, Selic Meta, Selic Efetiva, PTAX e Ibovespa sincronizados e funcionais | **APROVADO** |
| **14. Isolamento Fiscal** | Fail-closed com DARFs e alertas | Isenções de R$ 20k, DARFs e pendências preservadas fail-closed | **APROVADO** |
| **15. Experiência Multiplataforma** | Testes e builds divergentes | Suíte unificada de testes (Vitest + Playwright + Rust cargo check) 100% verde | **APROVADO** |

---

## 3. BACKUPS DE SEGURANÇA E AUDITORIA DA BASE

Foram gerados snapshots criptográficos do banco de dados `atlas_local` na porta 5434:

- **Pre-16D Snapshot:**
  - Arquivo: `atlas_local_pre_16d_20261109_100300.sql`
  - Tamanho: 262.293 bytes
- **Post-16D Snapshot:**
  - Arquivo: `atlas_local_post_16d_20261109_104100.sql`
  - Tamanho: 256.494 bytes
  - SHA-256: `9ab945adcc9fd0f4ac870e52a3065d6310dffe13919f72ee82ec2be4f47b098e`
- **Manual Backup gerado via UI (Endpoint `/api/v1/backups/create`):**
  - Arquivo: `atlas_backup_atlas_local_manual_2026-11-09T16-29-58-906Z.sql`
  - Tamanho: 261.049 bytes
  - SHA-256: `7c9e20e0acaa8fe0046f7c341c230bc45c0884a77fca54c5e80b8502bc44b222`
  - Checksum validado: `true`
  - Duração: 344ms

---

## 4. DETALHAMENTO DAS IMPLEMENTAÇÕES

### 4.1. Camada de Banco de Dados (`packages/database`)
- Localização e execução de binário nativo `pg_dump.exe` (`C:\Program Files\PostgreSQL\18\bin\pg_dump.exe` ou `PATH`) com `PGPASSWORD` para execução local no Windows sem exigir Docker.
- Cálculo de hash SHA-256 em stream e gravação de arquivo `.sha256` correspondente.
- Função `listBackups(dir)` que valida a integridade do checksum de cada arquivo.
- Função `applyRetentionPolicy(dir, options)` que mantém até 7 backups diários, 4 semanais e 3 mensais, preservando permanentemente os marcados como manuais (`_manual_`).

### 4.2. API Local (`apps/api`)
- `BackupService` e `BackupController` (`@Inject(BackupService)` desacoplado).
- Endpoints REST protegidos:
  - `GET /api/v1/backups/status`: metadados do último backup, lista dos últimos 10 dumps, contagem total e política de retenção.
  - `POST /api/v1/backups/create`: disparo de backup síncrono com verificação de integridade e aplicação imediata de retenção.
- `IntegrationReviewService.countPending(userId)`: alterado para contabilizar unicamente itens acionáveis (`item.isActionable`), desconsiderando previews de simulação anteriores ou linhas não suportadas informativas.

### 4.3. Import Engine (`packages/import-engine`)
- Categorização de itens no Review Inbox:
  - `isActionable: boolean`
  - `isHistorical: boolean`
  - `isInformative: boolean`
- Execuções de preview não confirmadas que foram substituídas por reexecuções posteriores são marcadas automaticamente como históricas.
- Execuções que possuem apenas notas de linhas não suportadas são marcadas como informativas.

### 4.4. Frontend Desktop (`apps/atlas-app`)
- **`LocalBackupCard.tsx`**: Exibe diretório canônico de backup, status do último arquivo, tamanho formatado e botão de ação para criar backup com indicador de progresso e mensagem de sucesso/erro.
- **`RestoreReadinessCard.tsx`**: Apresenta instruções claras para recuperação de desastre, comando CLI copy-paste e aviso de segurança sobre a imutabilidade do banco.
- **`ReviewInboxSection.tsx`**: Adicionada barra de filtros por categoria (`Ação Necessária (X)`, `Informativo (Y)`, `Histórico (Z)`, `Todas (W)`) com seleção dinâmica.
- **`ImportSourceGuidanceCard.tsx`**: Apresenta fluxo em 4 passos com especificações dos 4 arquivos B3/Atlas aceitos.
- **`OperationalHealthSummary.tsx`**: Pill de saúde visual na tela Hoje com chips contextuais de banco, cotações e macro.
- **`SettingsRoute.tsx`**: Abas de navegação estruturadas, respeitando todos os IDs e test IDs existentes e adicionando a seção de backup e metadados de build dinâmicos via `import.meta.env`.
- **`runtime.rs`**: Rotação de logs em Rust para `api.log` (> 2MB renomeia para `api.log.old`) e sanitização de variáveis e tokens.

---

## 5. RESULTADOS DE TESTES E VALIDAÇÃO

- **Suíte de Maturidade Desktop (`tests/app/desktop-product-maturity.test.tsx`):**
  - `LocalBackupCard`: 2 testes aprovados.
  - `RestoreReadinessCard`: 1 teste aprovado.
  - `ImportSourceGuidanceCard`: 1 teste aprovado.
  - `ReviewInboxSection Actionable Filtering`: 1 teste aprovado.
  - `OperationalHealthSummary`: 2 testes aprovados.
- **Suíte Completa `@atlas/app` (`pnpm test:app`):** 19 arquivos, 250 testes aprovados.
- **Suíte de Import Engine (`pnpm test:import-engine`):** 20 arquivos, 228 testes aprovados.
- **Suíte de API Client (`pnpm test:api-client`):** 2 arquivos, 35 testes aprovados.
- **Suíte de Market Data (`pnpm test:market-data`):** 15 arquivos, 138 testes aprovados.
- **Typechecks (`tsc`):**
  - `@atlas/api`: Aprovado (código 0).
  - `@atlas/app`: Aprovado (código 0).
  - `@atlas/web`: Aprovado (código 0).
- **Git diff check:** Limpo (código 0).
- **Tauri build & NSIS installer:** Concluído com sucesso (40.15 MiB).
- **Execução Real do Executável Instalado (`atlas-app.exe`):**
  - Processo iniciado com sucesso.
  - Conexão e verificação do PostgreSQL 18 na porta 5434 em 1.16s.
  - API local respondendo `GET /ready` com HTTP 200 em 127.0.0.1:3001.
  - Teste ao vivo de `POST /api/v1/backups/create`: dump gerado (261 KB) com checksum SHA-256 verificado.
  - Teste ao vivo de `GET /api/v1/integration-reviews/count`: 1 item pendente acionável.
  - Teste ao vivo de `GET /api/v1/macro/context`: 5 indicadores sincronizados e disponíveis.
  - Teste ao vivo de `GET /api/v1/portfolios/.../valuation`: 36 de 36 ativos precificados (100% de cobertura).

---

## 6. DECLARAÇÃO DE CONCLUSÃO

Todas as metas da APP-16D foram rigorosamente atingidas sem desvios de escopo, sem regressões de arquitetura e com validação ponta a ponta no executável Windows instalado.

**Status Final:** `APP_16D_DESKTOP_PRODUCT_MATURITY_COMPLETE`
