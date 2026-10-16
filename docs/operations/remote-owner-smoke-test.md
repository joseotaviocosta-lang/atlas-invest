# Protocolo de Smoke Test Remoto: Validação Manual do Titular

Este documento fornece o roteiro passo a passo para o investidor titular homologar o **Project Atlas** executando em ambiente remoto, a partir de qualquer dispositivo ou navegador externo.

---

## Pré-Requisitos

1. Navegador moderno (Google Chrome, Safari, Firefox ou Microsoft Edge).
2. URL pública HTTPS do ambiente remoto (ex.: `https://app.atlas.seudominio.com`).
3. Credenciais criadas via CLI de bootstrap (`pnpm bootstrap:owner`).

---

## Roteiro de Teste (13 Passos)

| Passo  | Ação                                        | Resultado Esperado                                                                                                                                | Status |
| :----: | :------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------ | :----: |
| **1**  | Acessar URL HTTPS da aplicação web          | Conexão segura (TLS válido), sem avisos de certificado no navegador. Redirecionamento correto para `/login`.                                      |  [ ]   |
| **2**  | Tentar acessar tela de cadastro `/register` | O cadastro público está bloqueado (`403` / redirecionamento ou bloqueio visual).                                                                  |  [ ]   |
| **3**  | Efetuar login com e-mail e senha do titular | Login bem-sucedido. Cookie HttpOnly `atlas.refresh-token` gravado de forma transparente e segura.                                                 |  [ ]   |
| **4**  | Carregamento da tela Hoje (`/today`)        | Carregamento imediato sem loops de redirecionamento. Boas-vindas ao investidor.                                                                   |  [ ]   |
| **5**  | Navegação para Carteira (`/portfolio`)      | Alternador de carteiras exibe a carteira ativa. Tabela de ativos em custódia carrega com dados reais.                                             |  [ ]   |
| **6**  | Validação da Política de Honestidade Visual | Ausência total de dados fictícios ou gráficos simulados. Apenas dados matematicamente derivados do ledger.                                        |  [ ]   |
| **7**  | Acessar aba Proventos                       | Navegação direta e imediata, sem necessidade de clique intermediário.                                                                             |  [ ]   |
| **8**  | Acessar aba Rentabilidade / Performance     | A página carrega sem erro de execução (`TypeError`). Seleção de carteira e métricas operando.                                                     |  [ ]   |
| **9**  | Acessar área Fiscal (`/tax`)                | Visão geral mensal, obrigações fiscais, histórico de DARF e botão de fechar período visíveis.                                                     |  [ ]   |
| **10** | Acessar Declaração Anual (`/tax/irpf`)      | Ficha de Bens e Direitos e Renda Variável sincronizadas com a prontidão e dados de encerramento do exercício.                                     |  [ ]   |
| **11** | Exportar Relatório DIRPF em CSV             | O download do arquivo `.csv` é disparado automaticamente. Ao abrir no Excel/Numbers, acentuação e ponto-e-vírgula estão corretos (UTF-8 com BOM). |  [ ]   |
| **12** | Teste de Persistência de Sessão             | Pressionar F5 (recarregar página) ou abrir nova aba. A sessão do titular permanece autenticada sem exigir novo login.                             |  [ ]   |
| **13** | Efetuar Logout                              | Sessão revogada no banco, cookies HttpOnly limpos compulsoriamente, cache expurgado e retorno à tela de login.                                    |  [ ]   |

---

## Critério de Aprovação

Todos os 13 passos devem ser marcados como **PASS** pelo titular. Qualquer falha constitui impeditivo para uso operacional diário do Remote Owner MVP.
