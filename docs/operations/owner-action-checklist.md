# Project Atlas — External Beta Owner Action Checklist

**Data de Registro:** 2026-10-28  
**Commit de Base da Engenharia:** `7d3fc70477fd35d58cb5f084ecd0b0b97d575797`  
**Estado da Engenharia:** `PHASE_6D_TECHNICAL_COMPLETE / TECHNICALLY_READY_FOR_EXTERNAL_BETA_DEPLOYMENT`  
**Regra Permanente:** `NO PUSH`, `NO DEPLOY ATÉ AUTORIZAÇÃO EXPLÍCITA`  

---

## Decisão Atual da Governança

```text
ENGINEERING              = READY
LEGAL                    = PENDING
EMAIL EXTERNAL CONFIG    = PENDING
INFRASTRUCTURE           = PENDING
DEPLOYMENT               = NOT AUTHORIZED
```

---

## Bloco A — Identidade Legal

Preencher e confirmar os dados cadastrais da entidade controladora:

```text
Razão Social:             __________________________________________________
Nome Fantasia:            __________________________________________________
CNPJ:                     __________________________________________________
Endereço:                 __________________________________________________
Cidade / UF:              __________________________________________________
CEP:                      __________________________________________________

Contato Geral:            __________________________________________________
Contato de Privacidade:   __________________________________________________
E-mail do Encarregado:    __________________________________________________
```

> [!CAUTION]
> Se o Project Atlas ainda não possuir empresa ou CNPJ próprio formalmente constituído, registrar como `LEGAL_ENTITY_PENDING`. **Não** preencher os documentos públicos de Termos de Uso e Política de Privacidade com dados fictícios ou provisórios como se fossem definitivos.

---

## Bloco B — Revisão Jurídica Externa

Entregar o dossiê consolidado de conformidade à assessoria jurídica especializada:

- [ ] [`docs/legal/legal-review-handoff.md`](file:///c:/Projetos/atlas-invest/docs/legal/legal-review-handoff.md)
- [ ] [`docs/legal/privacy-policy-draft.md`](file:///c:/Projetos/atlas-invest/docs/legal/privacy-policy-draft.md)
- [ ] [`docs/legal/terms-of-service-draft.md`](file:///c:/Projetos/atlas-invest/docs/legal/terms-of-service-draft.md)
- [ ] [`docs/legal/data-processing-inventory.md`](file:///c:/Projetos/atlas-invest/docs/legal/data-processing-inventory.md)
- [ ] [`docs/legal/data-retention-matrix.md`](file:///c:/Projetos/atlas-invest/docs/legal/data-retention-matrix.md)

### Checklist de Validação Mandatória pelo Jurídico:
- [ ] 1. Identificação formal do Controlador dos dados.
- [ ] 2. Canal e designação do Encarregado de Proteção de Dados (DPO).
- [ ] 3. Validação das bases legais por finalidade (ROPA).
- [ ] 4. Enquadramento do tratamento contextual pela IA.
- [ ] 5. Enquadramento de inteligência de mercado e notícias.
- [ ] 6. Teste de Ponderação de Legítimo Interesse (LIA / RIPD).
- [ ] 7. Política de retenção e immutabilidade do ledger de transações.
- [ ] 8. Tese de retenção fiscal de 5 anos baseada no CTN (Arts. 173/174).
- [ ] 9. Prazos e fluxo de atendimento a solicitações DSR (Art. 18 LGPD).
- [ ] 10. Procedimento de conciliação pós-restauração de backups.
- [ ] 11. Validação de transferência internacional de dados (OpenAI / Cloud).
- [ ] 12. Aprovação final do texto dos Termos de Uso.
- [ ] 13. Aprovação final do texto da Política de Privacidade.

> [!IMPORTANT]
> Somente após a entrega do parecer jurídico assinado e com status `LEGAL_REVIEW_COMPLETE`, os avisos de rascunho (`NOT FOR PRODUCTION PUBLICATION`, `DRAFT`, `LEGAL REVIEW REQUIRED`) poderão ser removidos do código e dos documentos públicos mediante autorização humana explícita.

---

## Bloco C — E-mail Transacional

- **Provedor Preferencial:** **Resend** (adaptador nativo `ResendEmailSender` já testado e integrado na API).
- [ ] Criar conta organizacional no provedor (ex: [resend.com](https://resend.com)).
- [ ] Adicionar o domínio institucional do projeto.
- [ ] Configurar os registros DNS obrigatórios no registrador:
  - [ ] SPF (`TXT`)
  - [ ] DKIM (`CNAME` / `TXT`)
  - [ ] DMARC (`TXT`)
- [ ] Gerar API Key de produção com permissão restrita de envio (`RESEND_API_KEY`).
- [ ] Definir o remetente oficial (`EMAIL_FROM=Atlas Invest <no-reply@dominio.com.br>`).
- [ ] Configurar a URL pública da aplicação (`NEXT_PUBLIC_APP_URL`).

> [!WARNING]
> Nunca comitar secrets ou chaves de API no Git (`.env.example`, documentações, commits ou prints). As chaves devem ser injetadas exclusivamente pelas variáveis de ambiente do runtime de produção/staging.

### Teste de Validação em Staging:
- [ ] Disparar solicitação de redefinição de senha (`POST /api/v1/auth/forgot-password`).
- [ ] Confirmar recebimento do e-mail com layout institucional pt-BR na caixa de entrada.
- [ ] Validar que o link direciona para `${NEXT_PUBLIC_APP_URL}/reset-password?token=...`.
- [ ] Cadastrar nova senha e validar que o token expira imediatamente após o uso.
- [ ] Confirmar que sessões ativas anteriores foram revogadas compulsoriamente.

---

## Bloco D — Domínio e DNS

- [ ] Adquirir/definir o domínio real do projeto (ex: `atlasinvest.com.br`).
- [ ] Definir os FQDNs oficiais:
  - `APP_PUBLIC_URL:` `https://app.<dominio>`
  - `API_PUBLIC_URL:` `https://api.<dominio>`
- [ ] Configurar os apontamentos de DNS (Tipo A / CNAME) apontando para o IP do proxy reverso de borda.
- [ ] Ajustar as variáveis de ambiente com os valores reais:
  - `NEXT_PUBLIC_APP_URL=https://app.<dominio>`
  - `ALLOWED_ORIGINS=https://app.<dominio>`
  - `API_INTERNAL_URL=http://api:3001` (comunicação interna de rede privada).

---

## Bloco E — Infraestrutura e Hospedagem

- [ ] Selecionar a plataforma de hospedagem para o Beta (VPS robusta ou Cloud PaaS como AWS, Render, Railway ou Fly.io).
- [ ] Provisionar instância gerenciada de PostgreSQL $\ge 16$ com TLS compulsório (`sslmode=require`).
- [ ] Registrar a localização de cada componente:
  - `Web:` __________________________________________________
  - `API:` __________________________________________________
  - `PostgreSQL:` __________________________________________________
  - `Backups:` __________________________________________________
  - `Logs:` __________________________________________________
- [ ] Confirmar presença de armazenamento persistente para os dados do banco e reinício automático dos contêineres (`restart: unless-stopped`).

---

## Bloco F — Geração de Segredos de Produção

Gerar chaves criptográficas fora do repositório utilizando CSPRNG:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

- [ ] `JWT_ACCESS_SECRET` ($\ge 32$ caracteres aleatórios).
- [ ] `REFRESH_TOKEN_PEPPER` ($\ge 32$ caracteres aleatórios).
- [ ] `PASSWORD_RESET_PEPPER` ($\ge 32$ caracteres aleatórios).
- [ ] `DATABASE_URL` (com usuário e senha fortes gerados no banco de dados gerenciado).
- [ ] `OPENAI_API_KEY` (chave de API real da OpenAI).
- [ ] `BRAPI_API_KEY` (chave de API real da Brapi para cotações B3 EOD).
- [ ] `RESEND_API_KEY` (chave de API real do Resend).

---

## Bloco G — Backup Externo Criptografado (Offsite)

- [ ] Criar bucket de armazenamento de objetos em nuvem separada (ex: AWS S3 ou Google Cloud Storage).
- [ ] Configurar **Object Lock / Compliance Mode (WORM)** com retenção mínima de 30 dias para backups diários.
- [ ] Configurar chave de criptografia de envelope (KMS ou chave pública GPG da infraestrutura).
- [ ] Programar script de cron para execução do backup diário (`pnpm db:backup`), criptografia do arquivo `.sql` e upload para o bucket.
- [ ] Testar a rotina de restauração e verificação (`pnpm db:restore:verify`).

---

## Bloco H — Monitoramento e Alertas Críticos

- [ ] Configurar monitor sintético externo (ex: UptimeRobot, Better Stack ou Datadog) apontando para:
  - `GET https://app.<dominio>/health` (intervalo de 60s, esperado 200 OK)
  - `GET https://api.<dominio>/ready` (intervalo de 60s, esperado 200 OK)
- [ ] Configurar canal de alerta imediato (PagerDuty, Telegram ou E-mail da equipe técnica) para:
  - API inacessível ou falha de liveness.
  - Banco de dados inacessível em `/ready`.
  - Taxa anormal de respostas HTTP 5xx.
  - Falha na execução do job de backup.

---

## Bloco I — Staging Externo e Beta Controlado

- [ ] Manter `ALLOW_PUBLIC_REGISTRATION=false` para impedir cadastros livres e não monitorados.
- [ ] Criar as primeiras contas de investidores convidados de forma manual e controlada (`pnpm bootstrap:owner` ou convite supervisionado).
- [ ] Disponibilizar termo de compromisso e NDA para o grupo de beta fechado.

---

## Bloco J — Smoke Test de Navegação Real no Staging

Executar com navegador real o roteiro completo de aceitação:
- [ ] 1. Login com credenciais válidas.
- [ ] 2. Onboarding inicial e criação da primeira carteira.
- [ ] 3. Importação de extrato/nota de corretagem via Import Hub.
- [ ] 4. Resolução de pendências no Review Workspace e confirmação do lote.
- [ ] 5. Visualização consolidada no Dashboard Hoje (`/today`).
- [ ] 6. Acompanhamento de DARF 6015 e prejuízos no módulo Fiscal (`/tax`).
- [ ] 7. Consulta de ativos e cotações reais no Mercado (`/market`).
- [ ] 8. Interação com a IA contextual sobre a carteira (`/ai`).
- [ ] 9. Verificação de alertas e prazos na Central de Notificações.
- [ ] 10. Acesso ao Centro de Privacidade (`/profile/privacy`):
  - [ ] Alternância de consentimentos granulares.
  - [ ] Download da exportação JSON de dados e conferência da higienização.
  - [ ] Registro de solicitação de direitos (DSR).
- [ ] 11. Teste de recuperação de senha (`forgot-password` -> recebimento de e-mail -> nova senha).
- [ ] 12. Teste de responsividade em viewport mobile de 390px.
- [ ] 13. Logout e encerramento limpo da sessão.

---

## Bloco K — Declaração Formal de Beta Externo (Go / No-Go)

Apenas assinalar e declarar **`EXTERNAL_BETA_GO`** quando todos os 14 itens estiverem formalmente cumpridos:

- [ ] 1. Parecer de assessoria jurídica emitido e aprovado (`LEGAL_REVIEW_COMPLETE`).
- [ ] 2. Dados cadastrais da entidade controladora preenchidos nos documentos públicos.
- [ ] 3. Canal de privacidade e DPO designado e publicado.
- [ ] 4. Termos de Uso definitivos aprovados e publicados (sem watermark de rascunho).
- [ ] 5. Política de Privacidade definitiva aprovada e publicada (sem watermark de rascunho).
- [ ] 6. Provedor de e-mail transacional ativo com DNS verificado (SPF/DKIM).
- [ ] 7. Fluxo de recuperação de senha por e-mail validado no ambiente real.
- [ ] 8. Domínio público oficial apontado com certificado SSL/TLS válido.
- [ ] 9. Banco de dados PostgreSQL gerenciado com TLS ativo.
- [ ] 10. Pipeline de backup offsite criptografado ativo.
- [ ] 11. Monitoramento sintético e alertas críticos funcionando.
- [ ] 12. Canal de suporte ao cliente estabelecido.
- [ ] 13. Smoke test completo de ponta a ponta aprovado no staging.
- [ ] 14. Zero pendências P0 em aberto.

---

## Itens que NÃO Bloqueiam o Primeiro Beta

Podem permanecer programados para as fases seguintes:
- Homologação institucional direta do Open Finance B3 (importação manual de notas/extratos está plenamente funcional).
- Empacotamento de aplicativos nativos iOS/Android para App Store e Google Play Store (Web responsiva 390px está plenamente funcional).
- Arquivamento contínuo de WALs para Point-In-Time Recovery (PITR ao segundo).
- Centralização avançada de logs em cluster Elasticsearch / Loki.
- Liberação do registro público aberto irrestrito.

