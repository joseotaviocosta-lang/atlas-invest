# Project Atlas — Production Deployment Architecture & Operations Runbook

Este documento orienta os operadores e a engenharia de infraestrutura na orquestração, deploy e monitoramento do Project Atlas para a fase de Beta Externo e Produção.

---

## 1. Topologia de Arquitetura

O Project Atlas adota uma arquitetura em contêineres desacoplados atrás de um Proxy Reverso com terminação TLS segura:

```text
               [ Tráfego Externo de Usuários ]
                              │
                              ▼ HTTPS (Port 443) / HSTS
              ┌────────────────────────────────┐
              │ Reverse Proxy (Caddy / NGINX)  │
              │ • Redirecionamento HTTP -> HTTPS│
              │ • Terminação TLS com Let's Enc. │
              │ • Limite de Upload: 1MB        │
              │ • Suporte a SSE (Zero Buffering)│
              └───────────────┬────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼ :3000                         ▼ :3001
      ┌───────────────┐               ┌───────────────┐
      │   apps/web    │──────────────▶│   apps/api    │
      │  (Next.js 15) │   BFF Auth    │   (NestJS)    │
      │  Standalone   │               │   Node.js 22  │
      └───────────────┘               └───────┬───────┘
                                              │
                     ┌────────────────────────┼────────────────────────┐
                     ▼                        ▼                        ▼
          ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
          │ Managed PostgreSQL  │  │ Provedor de Mercado │  │ Provedor Transac.   │
          │ • 45 Migrações      │  │ (Brapi API Oficial) │  │ (Resend ou SMTP)    │
          │ • Conexão TLS       │  └─────────────────────┘  └─────────────────────┘
          │ • Pool 10-20 conexões│
          └─────────────────────┘
```

---

## 2. Contratos de Rede, Proxy e Borda

### 2.1. Terminação TLS e HTTPS
- **Compulsoriedade:** Em produção externa, o uso de HTTPS é mandatório. O tráfego na porta 80 é redirecionado compulsoriamente via HTTP 301 para a porta 443.
- **Cabeçalho HSTS:** `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.

### 2.2. Suporte a Streaming de IA (Server-Sent Events)
- O proxy deve desativar o buffering para as rotas da API (`proxy_buffering off` no NGINX / `flush_interval -1` no Caddy) e estender o timeout de leitura para 120 segundos, permitindo a transmissão em tempo real das respostas da IA contextual sem interrupção abrupta.

### 2.3. Teto de Carga Útil (Upload Ceilings)
- O limite máximo de payload para o proxy de borda está fixado em exatamente **1MB** (`client_max_body_size 1M` no NGINX / `max_size 1MB` no Caddy), em perfeita conformidade com o parser de corpo da API (`express.json({ limit: '1mb' })`).

### 2.4. Download de Exportação de Dados Pessoais (LGPD)
- O proxy preserva o cabeçalho `Content-Disposition: attachment; filename="atlas-privacy-export-<uuid>.json"`, permitindo o download íntegro da exportação JSON de privacidade pelo navegador do titular.

---

## 3. Gestão e Políticas de Contêineres

1. **Usuário Não-Root (`USER node`):**
   - Todos os contêineres executam sob o usuário sem privilégios administrativos `node` (UID 1000), mitigando riscos de escalonamento de privilégios no host.
2. **Probes de Saúde Nativas:**
   - **Liveness:** `GET /health` a cada 15 segundos.
   - **Readiness:** `GET /ready` verificando conectividade com o banco e a presença exata das 45 migrações do Prisma.
3. **Desligamento Suave (Graceful Shutdown):**
   - Ao receber o sinal `SIGTERM`, a aplicação drena as conexões HTTP em andamento, interrompe o scheduler de sincronização (`NodeCronIntegrationScheduler.onModuleDestroy()`) e encerra o pool do Prisma de forma limpa.

---

## 4. Requisitos de Backup Offsite Criptografado (`OFFSITE_BACKUP_PROVIDER_REQUIREMENTS`)

Para a operação plena com usuários externos (fechamento de P1):

1. **Criptografia em Repouso:** Os blobs de dump lógico (`.sql`) gerados por `pnpm db:backup` devem ser cifrados via GPG com chave assimétrica pública da infraestrutura ou via AWS KMS antes da transmissão externa.
2. **Destino de Armazenamento:** Bucket externo (AWS S3 Glacier Instant Retrieval ou Google Cloud Storage Archive) com **Object Lock / Compliance Mode (WORM)** ativo, impedindo a exclusão acidental ou maliciosa de backups históricos.
3. **Política de Retenção:**
   - Backups diários: Retenção de 30 dias.
   - Backups mensais (primeiro dia de cada mês): Retenção de 5 anos (em conformidade com a retenção fiscal do CTN Arts. 173/174).
4. **Controle de Acesso IAM:** O contêiner de backup possui apenas permissão de escrita (`s3:PutObject`). Nenhuma permissão de exclusão (`s3:DeleteObject`) é concedida.

---

## 5. Diretrizes de Alerting Crítico (`CRITICAL_ALERTING_SINK`)

1. **Monitoramento Sintético Externo:**
   - Configurar um serviço de monitoramento sintético (ex: UptimeRobot, Better Stack ou Datadog) realizando requisições periódicas a cada 60 segundos nos endpoints:
     - `GET https://app.atlasinvest.com.br/health` (esperado: 200 OK)
     - `GET https://api.atlasinvest.com.br/ready` (esperado: 200 OK)
2. **Gatilhos de Notificação:**
   - 2 falhas consecutivas de liveness/readiness disparam alerta crítico via PagerDuty / Telegram / E-mail da equipe de plantão.
   - Taxa de respostas 5xx superior a 1% em janela móvel de 5 minutos.
   - Falha na execução do job noturno de backup.

---

## 6. Procedimento de Bootstrap de Operador Inicial

Em ambiente de produção inicial ou staging:

1. A variável `ALLOW_PUBLIC_REGISTRATION=false` deve ser mantida para evitar cadastros externos desautorizados.
2. Para criar a primeira conta administrativa/operadora com segurança e sem credenciais hardcoded:
   - Temporariamente habilitar o registro manual via script controlado local ou rodar:
     ```bash
     pnpm bootstrap:owner
     ```
   - O script solicita interativamente o e-mail e a senha mestra, aplica o hash Argon2id e registra o usuário diretamente na base de dados com perfil ativo.

