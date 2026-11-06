# Project Atlas — Guia de Configuração de DNS & Ativação de HTTPS

Este documento fornece as instruções humanas exatas para que o Owner configure um hostname de sua propriedade e ative o certificado TLS/HTTPS válido no servidor de piloto/staging (`54.233.66.110`).

---

## 1. Regra Crítica sobre Domínio
- **`atlasinvest.com.br` NÃO é utilizado pelo projeto:** O domínio `atlasinvest.com.br` está atualmente vinculado a nameservers externos de terceiros (Cloudflare / WP Engine) e não deve ser assumido como ativo sob controle do Project Atlas.
- **Domínio Próprio do Owner:** O endpoint da API do piloto deve utilizar exclusivamente um domínio registrado e controlado pelo Owner (ex: Registro.br, Cloudflare, AWS Route 53, Namecheap, etc.).

---

## 2. Registro DNS Necessário

No painel de gerenciamento DNS do domínio sob controle do Owner, crie o seguinte apontamento:

```text
Tipo de Registro: A
Nome / Host:      api   (ou subdomínio de sua preferência)
Valor / Destino:  54.233.66.110
TTL:              300 segundos (ou o menor valor aceito pelo provedor)
Proxy / CDN:      DNS Only (Se utilizar Cloudflare, desative a nuvem laranja temporariamente para emissão direta ACME)
```

**Exemplo do FQDN resultante:**
`https://api.<seu-dominio-controlado>`

---

## 3. Firewall no AWS Lightsail

No console do **Amazon Lightsail** (região `sa-east-1` / São Paulo), verifique a instância `atlas-staging-app`:
1. Acesse a aba **Networking** (Rede).
2. Na seção **IPv4 Firewall**, confirme se as seguintes portas estão liberadas para entrada:
   - **HTTP (TCP porta 80):** Obrigatória para validação do desafio ACME Let's Encrypt e redirecionamento.
   - **HTTPS (TCP porta 443):** Obrigatória para o tráfego criptografado da API.
   - **SSH (TCP porta 22):** Restrita ao IP do Owner.

---

## 4. Ativação do HTTPS no Caddy

Assim que o DNS estiver propagado (verifique com `nslookup api.<seu-dominio>`), acesse o servidor via SSH:

```bash
# 1. Acessar o diretório do projeto no servidor
cd /opt/atlas

# 2. Definir a variável do domínio no .env.staging
echo "PILOT_API_DOMAIN=api.<seu-dominio-controlado>" >> .env.staging
echo "CADDY_EMAIL=admin@<seu-dominio-controlado>" >> .env.staging

# 3. Recarregar o Caddy para emissão automática do certificado Let's Encrypt
docker compose -f compose.prod.yml restart caddy
```

O Caddy detectará automaticamente o hostname, solicitará o certificado TLS oficial ao Let's Encrypt / ZeroSSL e ativará a porta 443 com protocolo HTTPS moderno.

---

## 5. Validação do Endpoint HTTPS

Após o restart, valide externamente:

```bash
# Verificar status da API e certificado TLS
curl -I https://api.<seu-dominio-controlado>/health

# Resposta esperada:
# HTTP/2 200 OK
# Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

---

## 6. Procedimento de Rebuild da Versão Release (`0.1.0-pilot.2`)

Com o HTTPS operacional, execute o rebuild das aplicações apontando para o novo endpoint:

```powershell
# 1. Definir a URL da API no ambiente
$env:VITE_ATLAS_API_URL = "https://api.<seu-dominio-controlado>"
$env:VITE_ATLAS_ENV = "pilot"

# 2. Gerar o instalador Windows release
pnpm --filter @atlas/app exec tauri build -b nsis

# 3. Gerar o APK release assinado do Android
pnpm --filter @atlas/app exec tauri android build --apk --target aarch64
.\scripts\sign-android-release.ps1
```

Esse procedimento destrava imediatamente a distribuição segura para os amigos na fase `APP-15`.
