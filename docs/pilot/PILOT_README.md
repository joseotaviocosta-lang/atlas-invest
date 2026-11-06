# Project Atlas — Guia de Instalação e Testes (Piloto Fechado)

Bem-vindo ao **Project Atlas**! Este documento fornece instruções claras e descomplicadas para instalar, testar e utilizar a versão piloto (`0.1.0-pilot.1`) no **Windows** e no **Android**.

---

## ⚠️ Sobre o Piloto
- **Versão:** `0.1.0-pilot.1` (Build inicial para grupo fechado de amigos e validação direta pelo Owner).
- **Ambiente:** Servidor de Piloto / Staging dedicado.
- **Finalidade:** Validar usabilidade, navegação, sincronização de carteira e lembretes de impostos no dia a dia.
- **Privacidade:** Suas credenciais são individuais e protegidas. Seus dados de carteira são estritamente isolados e inacessíveis por outros participantes.
- **Segurança:** Nunca compartilhe sua senha ou códigos de recuperação com terceiros.

---

## 🖥️ Instalação no Windows Desktop

### 1. Download
Baixe o instalador oficial do piloto:
- **Arquivo:** `Atlas-0.1.0-pilot.1-win64-setup.exe`
- **Tamanho:** ~2.6 MB

### 2. Execução e Instalação
1. Dê um duplo clique no arquivo `Atlas-0.1.0-pilot.1-win64-setup.exe`.
2. O instalador opera em modo *CurrentUser* (instalação no seu perfil de usuário local). Não requer privilégios de administrador (sem tela de confirmação UAC invasiva).
3. O Atlas será instalado e um atalho será criado no Menu Iniciar.

### 3. Primeiro Acesso
1. Abra o **Atlas** pelo atalho criado.
2. Na tela de login, insira seu e-mail e senha fornecidos pelo administrador.
3. Clique em **Entrar**. Seus dados de carteira e posições serão carregados automaticamente.

### 4. Atualização
Quando uma nova versão do piloto for disponibilizada:
- Baixe o novo instalador (ex: `Atlas-0.1.0-pilot.2-win64-setup.exe`) e execute-o por cima da versão existente.
- Sua sessão e credenciais armazenadas no Windows Credential Manager serão preservadas intactas.

### 5. Desinstalação
Caso deseje desinstalar:
- Acesse `Configurações do Windows` → `Aplicativos` → `Aplicativos Instalados` → Localize `Atlas` → `Desinstalar`.

---

## 📱 Instalação no Android (Smartphones)

### 1. Download
Baixe o pacote de instalação do aplicativo:
- **Arquivo:** `Atlas-0.1.0-pilot.1-arm64.apk`
- **Tamanho:** ~11.4 MB
- **Compatibilidade:** Android 7.0+ (ARM64). Otimizado para dispositivos modernos.

### 2. Permitir Instalação de Fontes Desconhecidas (Sideload)
Por se tratar de um piloto interno (fora da Google Play Store):
1. Toque no arquivo `.apk` baixado no seu gerenciador de arquivos ou navegador.
2. Se o Android exibir a mensagem *"Para sua segurança, o smartphone não tem permissão para instalar apps desconhecidos desta fonte"*:
   - Toque em **Configurações**.
   - Ative a opção **Permitir desta fonte**.
   - Volte e toque em **Instalar**.

### 3. Notificações e Acesso
1. Abra o aplicativo **Atlas**.
2. Quando solicitado, autorize a permissão de notificações para receber lembretes de DARF e apurações fiscais.
3. Faça login com suas credenciais.

---

## 🆘 Como Reportar Problemas ou Sugestões

Caso encontre qualquer inconsistência ou travamento:
1. Abra a aba **Perfil & Configurações** no menu da aplicação.
2. Na seção **Diagnóstico e Suporte Técnico**, clique em **Exportar Diagnóstico Sanitizado**.
3. Um arquivo JSON ou texto seguro será gerado (ele **NÃO** contém senhas, tokens ou dados bancários).
4. Envie o feedback para o Owner utilizando o modelo em `PILOT_FEEDBACK_TEMPLATE.md` anexando o diagnóstico exportado.
