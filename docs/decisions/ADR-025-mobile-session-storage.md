# ADR-025: Armazenamento Seguro de Sessão Mobile e Ciclo de Vida de Tokens

## Status

Aprovado

## Contexto

O Project Atlas processa dados financeiros confidenciais de investidores brasileiros. No ecossistema mobile, dispositivos estão sujeitos a perda, roubo, inspeção de backup não-criptografado e vulnerabilidades em bibliotecas de terceiros que inspecionam armazenamento padrão não-seguro (ex: `AsyncStorage`).

## Decisão

1. **Refresh Token Exclusivo em SecureStore:**
   - O `refreshToken` rotativo é armazenado exclusivamente através do `expo-secure-store`.
   - Utiliza a chave canônica `atlas.refresh-token`.
   - No iOS, utiliza o Keychain com a política `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. No Android, utiliza o Keystore do hardware via SharedPreferences criptografadas.
2. **Access Token Estritamente em Memória:**
   - O `accessToken` (JWT de curta duração) reside estritamente em variáveis de memória volátil do processo da aplicação (módulo JavaScript e store Zustand).
   - **Invariante Crítica:** O access token NUNCA é salvo no disco, no `expo-secure-store`, no `AsyncStorage` ou em cookies do WebView.
3. **Proibição Absoluta de Armazenamento de Senha:**
   - Senhas em texto plano nunca são armazenadas em nenhuma camada do dispositivo sob qualquer circunstância.
4. **Higienização Total no Logout / Revogação:**
   - Ao deslogar ou ao ser detectada expiração ou reuso indevido do refresh token, o `expo-secure-store` é integralmente limpo via `clearAuthStorage()`, e as referências em memória são anuladas imediatamente.

## Consequências

- **Positivas:**
  - Impossibilidade de extração de credenciais ou tokens de acesso a partir de dumps de armazenamento comum.
  - Revogação confiável de acesso em caso de perda ou furto do aparelho.
  - Conformidade estrita com padrões bancários e de segurança financeira.
- **Negativas / Mitigações:**
  - Caso o app seja encerrado pelo sistema operacional, na reabertura uma chamada de `refresh` é realizada para reidratar o token de acesso em memória, o que é tratado de forma transparente pelo `app/_layout.tsx`.
