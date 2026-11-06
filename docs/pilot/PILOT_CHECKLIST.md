# Project Atlas — Checklist de Validação do Piloto

Este checklist deve ser preenchido por cada participante do piloto durante a validação da versão `0.1.0-pilot.1`.

---

## Identificação do Testador
- **Nome/Identificador:** ___________________________
- **Dispositivo / Modelo:** ___________________________
- **Sistema Operacional:** ( ) Windows 10/11 | ( ) Android (versão: ____)
- **Data do Teste:** ____ / ____ / 2026

---

## Roteiro de Testes

### 1. Instalação e Inicialização
- [ ] **[INST-01] Download:** Arquivo de instalação baixado integralmente sem erros.
- [ ] **[INST-02] Instalação:** O aplicativo instalou normalmente sem exigir privilégios indevidos.
- [ ] **[INST-03] Abertura:** A aplicação abriu e exibiu a tela de login.

### 2. Autenticação e Sessão
- [ ] **[AUTH-01] Login:** Login efetuado com sucesso com as credenciais recebidas.
- [ ] **[AUTH-02] Validação de Erro:** Tentativa de senha inválida exibe mensagem amigável sem travar.
- [ ] **[AUTH-03] Restauração de Sessão (Restore):** Fechar o aplicativo e reabrir mantém o usuário autenticado sem pedir senha novamente.

### 3. Navegação e Consultas (Read Models)
- [ ] **[NAV-01] Hoje (/today):** Visualização dos indicadores de patrimônio e resumo do dia.
- [ ] **[NAV-02] Carteira (/portfolio):** Alternador de carteiras funciona; posições e alocação são exibidas.
- [ ] **[NAV-03] Mercado (/market):** Indicadores macroeconômicos e cotações carregam normalmente.
- [ ] **[NAV-04] Fiscal (/tax):** Visualização consolidada de apuração e status de DARF.

### 4. Notificações e Horário de Silêncio
- [ ] **[NOTIF-01] Central de Notificações:** Ícone de sino visível no cabeçalho com contador de mensagens.
- [ ] **[NOTIF-02] Preferências:** Telas de configuração em `/settings` permitem alterar toggles e horários de silêncio.
- [ ] **[NOTIF-03] Privacidade:** Notificações não exibem valores monetários completos em áreas abertas.

### 5. Resiliência e Offline
- [ ] **[RES-01] Modo Offline:** Ao desconectar a internet (Wi-Fi/4G), banner de modo offline aparece e dados em cache continuam consultáveis.
- [ ] **[RES-02] Reconexão:** Ao religar a internet, o banner desaparece e os dados atualizam normalmente.
- [ ] **[RES-03] Segurança contra Falhas:** Caso ocorra erro de tela, o aviso *"O Atlas encontrou um erro inesperado"* é exibido com botão de tentar novamente e exportar diagnóstico.

### 6. Fluxos Exclusivos de Desktop (Windows)
- [ ] **[DSK-01] Importações (/import):** Tela de importação de arquivos (CSV / B3) acessível.
- [ ] **[DSK-02] Pré-visualização:** Visualização de preview e detecção de duplicidades.
- [ ] **[DSK-03] Histórico:** Listagem de lotes e reconciliações anteriores.

### 7. Encerramento de Sessão (Logout)
- [ ] **[LOG-01] Logout Voluntário:** Ação de Logout em Configurações encerra a sessão e limpa os tokens do dispositivo.
- [ ] **[LOG-02] Purga de Dados:** Após o logout, o cache de dados do investidor é limpo e a tela de login é reexibida.

---

## Registro de Observações
Por favor, descreva abaixo quaisquer comportamentos inesperados ou sugestões:
```text
[Anotações do Testador]:

```
