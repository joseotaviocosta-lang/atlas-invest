# Project Atlas — Phase 6C: External Beta Launch Readiness Report

**Data:** 2026-10-28  
**Branch:** `feature/phase-4l1-contextual-tax-intelligence-foundation`  
**Entrada HEAD:** `fdbe3eb18c956cc1801aecbb7528bae4e9268633`  
**Status Técnico:** `PHASE_6C_TECHNICAL_COMPLETE`  
**Status de Lançamento Externo:** `EXTERNAL_BETA_BLOCKED` (Permitido: `TECHNICALLY_READY_FOR_INTERNAL_BETA`)  
**Regra Permanente:** `NO PUSH` (Todos os artefatos e commits locais)

---

## 1. Sumário Executivo

A Fase 6C auditou e implementou as fundações técnicas e operacionais indispensáveis para avaliar se o Project Atlas pode migrar com segurança de um ambiente de desenvolvimento local para um **Beta Externo Controlado**.

A auditoria concluiu que, do ponto de vista **arquitetural, de segurança de código, integridade financeira e persistência**, o Atlas atingiu maturidade técnica (`PHASE_6C_TECHNICAL_COMPLETE`). No entanto, o lançamento público/externo para investidores reais está **formalmente bloqueado (`EXTERNAL_BETA_BLOCKED`)** por fatores externos ao código-fonte:
1. **Revisão Jurídica Externa Pendente:** Minutas de Termos de Uso e Política de Privacidade continuam com watermark de rascunho (`LEGAL_REVIEW_PENDING`); identidade societária da controladora (CNPJ/Razão Social) e canal formal de encarregado LGPD (DPO) não foram definidos formalmente.
2. **Provedor de E-mail Transacional Inexistente (`TRANSACTIONAL_EMAIL_PROVIDER_GAP`):** O fluxo de recuperação de senha (`forgot-password`) opera com notificador in-memory, inviabilizando autorrecuperação segura por usuários externos.
3. **Destino de Backup Criptografado Offsite (`OFFSITE_BACKUP_BETA_ASSESSMENT: UNCONFIGURED`):** Backups lógicos estão funcionais e testados, mas residem no mesmo ambiente local/host.
4. **Canal de Entrega de Alertas Críticos (`ALERT_DELIVERY_BETA_GAP`):** Falhas operacionais críticas geram logs estruturados, mas não disparam notificações push/pager para operadores humanos.

**Classificação Atual:**  
- **Beta Interno / Convidado sob NDA e Supervisão:** **LIBERADO TECNICAMENTE (`TECHNICALLY_READY_FOR_INTERNAL_BETA`)**.  
- **Beta Externo Público:** **BLOQUEADO (`EXTERNAL_BETA_BLOCKED`)**.

---

## 2. Reconciliação do Roadmap (Step 1)

- **Pesquisa Histórica:** Pesquisas no histórico Git (`git log`), documentação (`docs/`), relatórios anteriores e arquivos untracked confirmaram ausência total de referências conflitantes a `Phase 6C` ou `External Beta`.
- **Status:** `6C_RECONCILIATION = PASS`.
- **Precedentes de Fechamento:** Fase 6A (Confiabilidade & Observabilidade) e Fase 6B (Conformidade LGPD & Direitos do Titular) encontram-se 100% integradas no commit base `fdbe3eb`.

---

## 3. Inventário de Deployment & Arquitetura Alvo (Steps 3, 4, 5, 6)

### 3.1. Arquitetura Mínima Recomendada para Beta

```text
               [ Tráfego de Usuários Beta ]
                           │
                           ▼ HTTPS (Port 443)
              ┌──────────────────────────┐
              │ Reverse Proxy / TLS Term │ (Cloudflare / NGINX / Caddy)
              │ HSTS, Rate Limit Edge    │
              └─────────────┬────────────┘
                            │
              ┌─────────────┴────────────┐
              │                          │
              ▼ :3000                    ▼ :3001
      ┌───────────────┐          ┌───────────────┐
      │   apps/web    │─────────▶│   apps/api    │
      │  (Next.js 15) │   BFF    │   (NestJS)    │
      └───────────────┘          └───────┬───────┘
                                         │
                 ┌───────────────────────┼───────────────────────┐
                 ▼                       ▼                       ▼
      ┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐
      │ Managed PostgreSQL  │ │ OpenAI API (real)   │ │ Brapi API (real)    │
      │ 45 Migrations, SSL  │ │ (ou IA desativada)  │ │ (Cotações B3 EOD)   │
      └─────────────────────┘ └─────────────────────┘ └─────────────────────┘
```

### 3.2. Inventário de Componentes

| Componente | Modo Local Atual | Requisito de Produção Beta | Dependência Externa | Status / Blocker |
| :--- | :--- | :--- | :--- | :--- |
| **apps/web** | Next.js Dev (`:3000`) | Next.js Standalone Node (`:3000`) | Nenhuma | **PRONTO** (Build 34/34 estático) |
| **apps/api** | NestJS Dev (`:3001`) | Node.js compilado (`dist/main.js`) | Nenhuma | **PRONTO** (Build tsc limpo) |
| **PostgreSQL** | Docker local (`:5433` / `:5434`) | PostgreSQL Gerenciado $\ge 16$ com TLS | AWS RDS / Supabase / Neon / Render | **REQUER INSTÂNCIA GERENCIADA** |
| **Scheduler** | node-cron com Advisory Lock | In-process cron com advisory lock DB | PostgreSQL | **PRONTO** (Fencing multi-instância) |
| **AI Provider** | OpenAiProvider / FakeAi | Chave real OpenAI configurada | OpenAI API Key | **PRONTO** (Proibido fake em prod) |
| **Market Data** | Brapi / Persisted | Chave real Brapi configurada | Brapi API Key | **PRONTO** (Proibido fake em prod) |
| **B3 Open Finance** | Certificado bloqueado | Importação manual de extratos | B3 Portal Investidor | **OPERACIONAL COM IMPORT HUB** |
| **File Storage** | Memória / Payload JSON | Stream efêmero em memória (<1MB) | Nenhuma | **PRONTO** (Zero persistência em disco) |
| **E-mail** | In-Memory Token Store | SMTP / API Transacional | Resend / Postmark / SES | **BLOCKER (P0)** para external beta |
| **Backup** | `pg_dump` local script | Snapshot gerenciado + Offsite S3 | Bucket S3/GCS criptografado | **BLOCKER (P1)** para external beta |
| **Telemetria** | Stdout JSON + `/metrics` | Centralizador de logs + Alertas | Grafana Cloud / Sentry / Datadog | **BLOCKER (P1)** para external beta |

### 3.3. Avaliação de Banco: Self-Hosted vs. Managed PostgreSQL

- **Decisão:** Para o Beta Externo, recomenda-se expressamente **Managed PostgreSQL** (ex: Supabase Pro, Neon, AWS RDS PostgreSQL ou Render Managed PostgreSQL).
- **Justificativa Técnica:** 
  - Prover Point-In-Time Recovery (PITR) automatizado.
  - TLS compulsório (`sslmode=require`).
  - Backups contínuos sem sobrecarregar a CPU da máquina de aplicação.
  - Menor overhead operacional de manutenção e segurança para uma equipe enxuta.

---

## 4. Matriz de Variáveis de Ambiente e Segurança (Steps 7, 8, 9, 10)

### 4.1. Matriz de Configuração

| Variável | Escopo | Obrigatória? | Segredo? | Fail-Fast em Startup? | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `NODE_ENV` | Web & API | Sim (`production`) | Não | Sim | Configurado |
| `DATABASE_URL` | API & DB | Sim | Sim | Sim (Rejeita `atlas_test` ou `:5433`) | Requer URL de Prod |
| `JWT_ACCESS_SECRET` | API | Sim | Sim | Sim (Rejeita < 32 chars ou defaults) | Gerar com 48 bytes |
| `REFRESH_TOKEN_PEPPER`| API | Sim | Sim | Sim (Rejeita < 32 chars ou defaults) | Gerar com 48 bytes |
| `PASSWORD_RESET_PEPPER`| API | Sim | Sim | Sim (Rejeita < 32 chars ou defaults) | Gerar com 48 bytes |
| `ALLOWED_ORIGINS` | API | Sim | Não | Sim (CORS estrito em prod) | Definir FQDN Web |
| `NEXT_PUBLIC_APP_URL` | Web | Sim | Não | Sim (Validação Origin no BFF) | Definir FQDN Web |
| `API_INTERNAL_URL` | Web (BFF) | Sim | Não | Sim (Chamadas server-side) | Definir FQDN/IP API |
| `OPENAI_API_KEY` | API | Condicional | Sim | Sim (Se IA habilitada) | Requer Chave Real |
| `BRAPI_API_KEY` | API | Sim | Sim | Sim (Se provedor for BRAPI) | Requer Chave Real |
| `ALLOW_PUBLIC_REGISTRATION` | API | Sim | Não | Sim (Pode ser `false` para convidados) | Recomendado `false` |
| `INTEGRATION_SCHEDULER_ENABLED` | API | Opcional | Não | Não (Default `false`) | Opcional para beta |

### 4.2. Política de Geração de Segredos Fortes

Segredos de produção devem ser gerados criptograficamente fora do repositório:
```bash
# Geração de Segredos Criptográficos (48 bytes base64)
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```
**Regra Permanente:** Arquivos `.env.production`, `.env.local` e credenciais reais são terminantemente excluídos do versionamento Git via `.gitignore`.

---

## 5. Fronteiras de Rede, Domínio e Navegador (Steps 12, 13, 14, 15, 16)

1. **Compulsoriedade de HTTPS / TLS:**
   - Em produção externa, o protocolo HTTP puro é classificado como **BETA_BLOCKER**.
   - O aplicativo Web impõe `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` via headers do Next.js.
2. **Cookies de Sessão e Autenticação:**
   - `atlas_refresh`: Armazena o refresh token rotativo. Configurado com `HttpOnly: true`, `Secure: true` (em produção), `SameSite: Lax`, `Path: /`, TTL 30 dias. Imune a vazamento via JavaScript (`document.cookie`).
   - `atlas_logged_in`: Hint visual de interface, sem privilégios de autorização.
3. **CORS:**
   - A API NestJS restringe requisições cross-origin estritamente às origens listadas em `ALLOWED_ORIGINS` quando `NODE_ENV === 'production'`.
4. **Content Security Policy (CSP):**
   - Helmet ativado na API.
   - Web configurado com `nosniff`, `DENY` em X-Frame-Options, e strict referrer. Compatível com SSE (Server-Sent Events) para streaming da IA e downloads de exportação JSON da privacidade.

---

## 6. Autenticação, Ciclo de Vida e Gaps de E-mail (Steps 17 a 22)

### 6.1. Ciclo de Vida do Investidor

O fluxo completo foi validado em suite de testes automatizados e builds de produção:
1. **Registro:** Cria usuário com hash Argon2id (sem envio de e-mail obrigatório no modelo atual).
2. **Autenticação & Sessão:** Emite JWT de 15 minutos em memória e Refresh Token rotativo em cookie seguro.
3. **Onboarding:** Derivação puramente determinística: se `portfolios.length === 0`, direciona para `/onboarding`. Primeira carteira criada e persistida via API, seguida por escolha de método (Import Hub ou manual). Usuários com $\ge 1$ carteira são encaminhados diretamente a `/today`.
4. **Desativação:** Desativação voluntária via Privacy Center (`POST /api/v1/privacy/account/deactivate`): marca `deactivated_at`, revoga compulsoriamente todas as sessões ativas no banco e rejeita logins futuros.

### 6.2. Gaps de E-mail e Recuperação de Senha

- **`PASSWORD_RESET_DELIVERY_GAP` (P0 para beta aberto):** A API aceita solicitações de recuperação em `POST /api/v1/auth/forgot-password`, persiste o token com expiração de 15 minutos, mas o entregador atual é o `InMemoryPasswordResetNotifier`.
- **Mitigação para Beta Interno / Fechado:** Os primeiros usuários beta devem ser instruídos sobre a ausência de autorrecuperação de senha por e-mail, ou o operador pode fornecer links diretamente via log seguro em ambiente de homologação.
- **Exigência para Beta Externo:** Integração com provedor transacional real (ex: Resend ou AWS SES).

---

## 7. Conformidade Legal e LGPD (Steps 23 a 31)

### 7.1. Legal Beta Gate

```text
LEGAL_BETA_GATE
- Controller Identity:           [PENDENTE DE DEFINIÇÃO SOCIETÁRIA/CNPJ]
- Privacy Contact / DPO:         [PENDENTE - EX: dpo@atlasinvest.com.br]
- Terms of Service Review:       PENDING EXTERNAL COUNSEL
- Privacy Policy Review:         PENDING EXTERNAL COUNSEL
- Legal Basis Matrix:            CANDIDATE (DOCUMENTED, NOT FORMALLY SIGNED)
- Statutory Retention Matrix:    CANDIDATE (5 YEARS CTN 173/174)
- International Data Transfers:  NOT EVALUATED BY LEGAL COUNSEL
- Legal Beta Gate Status:        EXTERNAL_BETA_LEGAL_BLOCKED
```

### 7.2. Controles de Privacidade Funcionais

A camada de privacidade (Fase 6B) está 100% implementada e testada no código:
- **Centro de Privacidade Web (`/profile/privacy`):** Conectado à API.
- **Consentimentos Granulares:** 4 finalidades canônicas com alternância em tempo real e log de auditoria.
- **Exportação de Dados:** Download de arquivo JSON íntegro, higienizado (sem vazamento de senhas, hashes de sessão ou segredos) e com cabeçalho `Cache-Control: no-store`.
- **Invariante do Ledger Imutável:** Solicitações de exclusão não destroem transações históricas do ledger (preservação obrigatória de 5 anos sob CTN Arts. 173/174); a conta é desativada e a solicitação protocolada como `PENDING_LEGAL_RETENTION_REVIEW`.
- **`POST_RESTORE_PRIVACY_RECONCILIATION_GAP`:** Procedimento operacional documentado no runbook para reaplicar revogações de consentimento ocorridas entre o backup e o restore.

---

## 8. Resiliência Operacional, Observabilidade e Backups (Steps 32 a 41)

1. **Backup & Restore Drill:**
   - Rotina automatizada `pnpm db:restore:verify` executada com sucesso.
   - RTO medido: $\sim 20$ segundos.
   - Assertividade: 45 migrations, 64 tabelas, integridade de ledger e esquemas de auditoria/privacidade validados.
2. **`OFFSITE_BACKUP_BETA_ASSESSMENT` (P1):**
   - Atualmente, backups são gerados localmente no sistema de arquivos. Para usuários externos, é mandatório configurar script de upload criptografado (GPG/KMS) para bucket S3 com bloqueio de exclusão (Object Lock/WORM).
3. **`ALERT_DELIVERY_BETA_GAP` (P1):**
   - Probes `/health` e `/ready` respondem corretamente com status liveness, conectividade com DB e status de degradação de provedores.
   - A métrica in-memory `/metrics` expõe latências, taxas de erro e memória.
   - Gap: Não há webhook/pagerduty/slack para acordar o operador em caso de falha silenciosa.

---

## 9. Provedores Externos: Mercado, B3 e IA (Steps 11, 50, 51, 88)

### Matriz de Funcionalidades do Beta

| Funcionalidade | Habilitado no Beta? | Provedor de Dados | Simulado em Prod? | Status / Justificativa |
| :--- | :--- | :--- | :--- | :--- |
| **Carteiras & Ledger** | **SIM** | Ledger Determinístico (PostgreSQL) | **NÃO** | Totalmente operacional (long-only, zero floats). |
| **Import Hub** | **SIM** | Extratos CSV / XLS / PDF | **NÃO** | Operacional para importação manual de notas/extratos. |
| **Conexão Direta B3** | **PARCIAL** | Open Finance B3 | **NÃO** | Interface exibe status real: "Homologação Institucional Pendente". Import manual disponível. |
| **Motor Fiscal (Tax)** | **SIM** | Tax Engine (Regras Oficiais BR) | **NÃO** | Totalmente operacional (DARF 6015, prejuízos, compensações). |
| **Mercado & Cotações** | **SIM** | Brapi / Persisted DB | **NÃO** | Operacional com chave de API real da Brapi. Fallback in-memory proibido em prod. |
| **IA Contextual** | **CONDICIONAL** | OpenAI API (gpt-4o-mini / text-embedding) | **NÃO** | Só ativa se `OPENAI_API_KEY` for fornecida. Fallback a FakeAi proibido em prod. |
| **Notificações** | **SIM** | Factual Notification Center | **NÃO** | Notificações baseadas estritamente em eventos verificados do banco. |
| **Privacidade / LGPD**| **SIM** | Privacy Repository | **NÃO** | Exportação, consentimentos e DSR plenamente operacionais. |

---

## 10. Matriz de Riscos do Beta (Step 113)

| Risco | Probabilidade | Impacto | Mitigação Técnica / Operacional | Beta Blocker? |
| :--- | :--- | :--- | :--- | :--- |
| **Responsabilidade Legal por Termos Rascunho** | Média | Alto | Obter aprovação formal de assessoria jurídica externa | **SIM (P0)** |
| **Usuário esquece senha e não recupera** | Alta | Médio | Implantar provedor SMTP/Resend transacional | **SIM (P0)** |
| **Perda de banco sem cópia offsite** | Baixa | Crítico | Configurar backup diário automatizado em S3/GCS | **SIM (P1)** |
| **Instabilidade sem alerta ao operador** | Média | Alto | Conectar `/health` e `/ready` ao UptimeRobot/Grafana | **SIM (P1)** |
| **Excesso de chamadas na API de IA/Mercado** | Média | Baixo | ThrottlerGuard ativo na API; limitação de requisições | **NÃO (Mitigado)** |
| **Tentativa de ataque de força bruta em login** | Média | Médio | Throttler estrito (5 req/min em login/reset) | **NÃO (Mitigado)** |
| **Injeção via arquivos de importação** | Baixa | Alto | Parsing JSON em memória limitado a 1MB; sem execução de código | **NÃO (Mitigado)** |

---

## 11. Classificação de Gaps: P0 / P1 / P2 (Step 114)

### P0 — Bloqueadores Mandatórios para Lançamento Externo Público
1. **`LEGAL_REVIEW_SIGN_OFF`:** Aprovação jurídica formal dos Termos de Uso e Política de Privacidade e definição dos dados cadastrais do Controlador e canal de DPO.
2. **`TRANSACTIONAL_EMAIL_PROVIDER`:** Integração de envio de e-mails transacionais para viabilizar recuperação de senha (`forgot-password`).
3. **`HTTPS_INFRASTRUCTURE`:** Provisionamento de domínio com certificado SSL/TLS válido e cabeçalhos de segurança em produção.

### P1 — Altamente Recomendados Antes da Expansão do Beta
1. **`OFFSITE_BACKUP_STORAGE`:** Configuração de pipeline de upload seguro de dumps diários para bucket externo criptografado.
2. **`CRITICAL_ALERTING_SINK`:** Monitoramento sintético externo apontado para `/ready` e `/health` com disparo para e-mail/celular da equipe.
3. **`AUDIT_LOG_RETENTION`:** Centralização e retenção imutável de logs de produção fora do stdout efêmero dos containers.

### P2 — Pós-Beta / Preparação para Produção Geral
1. **`B3_INSTITUTIONAL_CERTIFICATION`:** Conclusão da certificação formal junto à B3 para integração Open Finance direta.
2. **`MOBILE_NATIVE_PACKAGING`:** Build e submissão dos aplicativos nativos iOS/Android às lojas (App Store e Play Store).
3. **`PITR_CONTINUOUS_ARCHIVING`:** Arquivamento contínuo de WALs de PostgreSQL para recuperação a qualquer segundo.

---

## 12. Veredito GO / NO-GO (Step 116)

```text
=====================================================
PROJECT ATLAS — BETA LAUNCH READINESS VERDICT
=====================================================

1. TECHNICAL ARCHITECTURE:  [ GO ]     (Engine, APIs, Web, builds e typecheck 100% aprovados)
2. FINANCIAL INTEGRITY:     [ GO ]     (Zero floats, ledger imutável, replay puro determinístico)
3. SECURITY & AUTH:         [ GO ]     (Argon2id, JWT/Refresh rotativo, rate limit, sanitização)
4. PRIVACY TECHNICAL:      [ GO ]     (Centro de privacidade, export JSON limpo, consentimentos)
5. OPERATIONS / DRILLS:     [ GO ]     (Restore drill validado, RTO < 30s, 45 migrations)
6. LEGAL / LGPD FORMAL:     [ NO-GO ]  (Minutas com watermark pendentes de assessoria jurídica)
7. EMAIL INFRASTRUCTURE:    [ NO-GO ]  (Recuperação de senha sem provedor transacional externo)
8. SUPPORT & DPO CHANNELS:  [ NO-GO ]  (Canais formais de contato com titular pendentes)

-----------------------------------------------------
FINAL VERDICT:
- CONTROLLED INTERNAL BETA (Team / Dev / NDA):   APPROVED (GO)
- EXTERNAL BETA (Public / Real Investors):       BLOCKED  (NO-GO)
STATUS: PHASE_6C_TECHNICAL_COMPLETE / EXTERNAL_BETA_BLOCKED
=====================================================
```
