# Project Atlas — Manual Operacional e Hardening de Release (Piloto)

Este documento formaliza todos os requisitos de arquitetura, segurança, empacotamento, observabilidade e contingência para a versão piloto (`0.1.0-pilot.1`) do aplicativo unificado Atlas (`apps/atlas-app`).

---

## 1. Auditoria Geral de Release (PARTE A)

| Área | Estado Atual | Risco de Release | Ação Aplicada | Blocker? |
| :--- | :--- | :--- | :--- | :---: |
| **Runtime Config** | Versionamento centralizado em `runtime.ts` e exposto na interface | Divergência de versão entre package.json, tauri e UI | Unificado SemVer `0.1.0-pilot.1` em todos os manifestos | **NÃO** |
| **API Endpoint** | IP direto `http://54.233.66.110` ativo temporariamente | Tráfego sem criptografia TLS em trânsito | Exigência mandatória de HTTPS com domínio próprio; documentado blocker | **SIM (para release pública)** |
| **Secure Storage** | Windows Credential Manager + Android Keystore EncryptedSharedPreferences | Vazamento de tokens em disco | Tokens em memória, refresh criptografado nativamente. Zero plaintext | **NÃO** |
| **Notificações** | Local-First (`tauri-plugin-notification`) com canais seguros | Vazamento de dados em tela de bloqueio | Visibilidade privada configurada; sem valores financeiros expostos | **NÃO** |
| **Local Cache** | Cache local sob chave `atlas.cache.*` com purga no logout | Acesso físico não autorizado a dados transitórios | Aceite operacional formalizado (`PILOT_ACCEPTED_LOCAL_CACHE_RISK`) | **NÃO** |
| **Crash Safety** | React ErrorBoundary adicionado com fallback amigável | App fechar abruptamente sem diagnóstico | Boundary com botões de retentativa e exportação de diagnóstico | **NÃO** |
| **Logging** | Plugin de log nativo com rotação e limite de 2MB | Crescimento ilimitado de disco por logs | Rotação `KeepOne`, 2MB máximo, sanitização estrita de tokens | **NÃO** |
| **Windows Build** | NSIS Installer configurado para `currentUser` | Exigência de privilégio de administrador desnecessário | Instalador em `%LOCALAPPDATA%`, sem UAC invasivo | **NÃO** |
| **Android Build** | ARM64 Release APK assinado com v2/v3 e zipalign | App lento por símbolos debug e não assinado | Release APK otimizado, sem cleartext, assinado com keystore | **NÃO** |
| **CORS Policy** | NestJS com fail-closed para web e suporte a `tauri://localhost` | Requisições instaladas bloqueadas | Permissão explícita para origens instaladas nativas | **NÃO** |

---

## 2. Modelo de Ambientes (PARTE B)

A arquitetura do Atlas formaliza quatro ambientes estritamente segregados:

```text
development   → Ambiente local de engenharia (localhost:3001, Vite dev, mocks, DB local 5434)
staging       → Ambiente de homologação contínua (VPS / Caddy com IP ou subdomínio de teste)
pilot         → Ambiente fechado de validação com Owner e amigos (contas convidadas, dados isolados)
production    → Produção aberta ao público (requer domínio registrado, HTTPS, alta disponibilidade)
```

### Configuração do Piloto:
- **Build Mode:** `release` (otimizações ativas, sem mapas de código e sem símbolos de depuração).
- **App Version:** `0.1.0-pilot.1`.
- **Debug Flags:** Desativadas (`isDebuggable = false`, `isJniDebuggable = false`).
- **Cleartext Policy:** Estritamente proibido em release (`usesCleartextTraffic = false`).
- **Logging Level:** `Info` em release, suprimindo chamadas redundantes de depuração.

---

## 3. Avaliação de HTTPS e Domínio do Piloto (PARTE C & D)

### Requisito Mandatório:
Para distribuição segura entre amigos e usuários externos, todo tráfego de rede **deve trafegar exclusivamente sob TLS/HTTPS válido**, sem certificados autoassinados ou flags de bypass.

### Diagnóstico da Infraestrutura Atual:
1. **Endpoint Temporário Atual:** `http://54.233.66.110` (servidor VPS ativo com Caddy e NestJS na porta 3001).
2. **Status da Porta 443:** A porta 443 do IP `54.233.66.110` não está aceitando conexões no momento.
3. **Status de Domínio:** O domínio canônico `atlasinvest.com.br` possui registros DNS sob nameservers de terceiros (Cloudflare / WP Engine) e os subdomínios (`api.atlasinvest.com.br`, `staging.atlasinvest.com.br`) não possuem delegação de zona ativa para o servidor do projeto.
4. **Parecer de Release:**
   - **Para testes imediatos do Owner em redes controladas:** Os artefatos release Windows (`.exe`) e Android (`.apk`) compilados funcionam perfeitamente com a infraestrutura atual.
   - **Para envio irrestrito a amigos:** Configurar a delegação de DNS de um domínio controlado pelo Owner (ex: Registro.br apontando para o Caddy com emissão automática Let's Encrypt / ZeroSSL) é o pré-requisito final.

---

## 4. Política de Contas e Isolamento de Usuários (PARTE V & W)

1. **Cadastro Fechado:** O cadastro público é bloqueado (`ALLOW_PUBLIC_REGISTRATION=false`). Novas contas para o grupo de amigos são criadas unicamente de forma administrativa controlada.
2. **Isolamento de Dados:** Cada investidor acessa unicamente as carteiras associadas ao seu próprio `userId`. O repositório e os serviços da API impõem `404 Not Found` em qualquer tentativa de acesso cross-user (anti-enumeração).
3. **Isolamento no Dispositivo:**
   - Ao executar Logout, todo o cache de queries do React Query é esvaziado (`queryClient.clear()`).
   - O histórico de notificações locais no dispositivo é purgado (`purgeUserNotifications()`).
   - O armazenamento de cache financeiro local (`LocalCache.clear()`) é redefinido.

---

## 5. Procedimentos de Atualização e Rollback (PARTE N & O)

### Atualização Manual:
- **Windows:** Executar o novo instalador setup (ex: `Atlas-0.1.0-pilot.2-win64-setup.exe`). Ele sobrepõe os binários da aplicação mantendo as credenciais salvas no Windows Credential Manager.
- **Android:** Instalar o novo APK (ex: `Atlas-0.1.0-pilot.2-arm64.apk`). Por utilizar a mesma chave de assinatura (`atlas-pilot`), o Android atualiza o pacote sem perda de dados da aplicação.

### Procedimento de Rollback:
Em caso de anomalia grave na versão `0.1.0-pilot.2`:
1. Distribuir novamente o instalador ou APK da versão `0.1.0-pilot.1`.
2. O aplicativo reverterá para a versão estável anterior sem afetar o Ledger de transações no servidor.

---

## 6. Procedimento de Backup do Piloto (PARTE Y)

1. **Backup Automático do Banco de Dados:**
   - Script de dump diário: `pg_dump -U postgres -d atlas_staging > backup_$(date +%Y%m%d).sql`.
2. **Retenção:** Os dumps são armazenados por 14 dias em volume protegido.
3. **Invariante do Ledger:** Nenhuma ação de teste destrutivo é realizada no banco do piloto sem confirmação e isolamento prévio.

---

## 7. Revisão de Risco do Cache Local (PARTE AD)
- **Registro:** `PILOT_ACCEPTED_LOCAL_CACHE_RISK`
- **Diagnóstico:** O cache financeiro (`LocalCache`) acelera a inicialização da aplicação e permite consultas offline de dados autoritativos. Os dados são limpos no logout, mas residem no storage padrão do WebView enquanto a sessão estiver ativa. Para o piloto fechado, este risco é aceitável e documentado; para distribuição pública geral futura, será implementada camada de encriptação transparente no cache local.
