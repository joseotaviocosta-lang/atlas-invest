import { PasswordResetNotifier } from '../password-reset-notifier.interface';
import { TransactionalEmailSender } from './transactional-email.interface';
import { Logger } from '@atlas/logger';

export class ProductionPasswordResetNotifier implements PasswordResetNotifier {
  private readonly logger = new Logger({ service: 'ProductionPasswordResetNotifier' });

  constructor(
    private readonly sender: TransactionalEmailSender,
    private readonly appPublicUrl?: string,
  ) {}

  async sendResetEmail(email: string, token: string): Promise<void> {
    const baseUrl = (
      this.appPublicUrl ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_PUBLIC_URL ||
      'http://localhost:3000'
    ).replace(/\/+$/, '');

    const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;

    const subject = 'Redefinição de senha — Project Atlas';

    const text = [
      'Olá,',
      '',
      'Recebemos uma solicitação para redefinir a senha da sua conta no Project Atlas.',
      '',
      `Para cadastrar uma nova senha, acesse o link seguro abaixo:`,
      resetUrl,
      '',
      'IMPORTANTE:',
      '• Este link é de uso único e expira em 15 minutos.',
      '• Se você não solicitou a redefinição de senha, ignore este e-mail. Nenhuma alteração foi efetuada.',
      '• Por segurança, nunca compartilhe este link com terceiros. A equipe do Project Atlas nunca solicita senhas por e-mail.',
      '',
      'Atenciosamente,',
      'Equipe Project Atlas',
    ].join('\n');

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Redefinição de senha — Project Atlas</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f3f4f6; padding: 24px; margin: 0; }
    .container { max-width: 560px; margin: 0 auto; background-color: #111827; border: 1px solid #1f2937; border-radius: 8px; padding: 32px; }
    .title { font-size: 20px; font-weight: 700; color: #ffffff; margin-bottom: 16px; }
    .text { font-size: 14px; line-height: 1.6; color: #d1d5db; margin-bottom: 24px; }
    .button { display: inline-block; background-color: #2563eb; color: #ffffff !important; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px; }
    .footer { font-size: 12px; color: #6b7280; line-height: 1.5; margin-top: 32px; border-top: 1px solid #1f2937; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="title">Project Atlas</div>
    <div class="text">
      Olá,<br><br>
      Recebemos uma solicitação para redefinir a senha da sua conta de investidor no Project Atlas.<br><br>
      Clique no botão abaixo para cadastrar uma nova senha segura:
    </div>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${resetUrl}" class="button" target="_blank" rel="noopener noreferrer">Redefinir Minha Senha</a>
    </div>
    <div class="text" style="font-size: 13px; color: #9ca3af;">
      Se o botão acima não funcionar, copie e cole o seguinte endereço em seu navegador:<br>
      <span style="word-break: break-all; color: #60a5fa;">${resetUrl}</span>
    </div>
    <div class="footer">
      • Este link é de uso único e expira em 15 minutos.<br>
      • Se você não solicitou esta alteração, ignore esta mensagem com segurança.<br>
      • O Project Atlas jamais solicita senhas ou códigos de confirmação por e-mail.
    </div>
  </div>
</body>
</html>
    `.trim();

    try {
      await this.sender.send({
        to: email,
        subject,
        text,
        html,
      });

      this.logger.info('Password reset email dispatched successfully', {
        recipient: email,
        provider: this.sender.getProviderName(),
      });
    } catch (error: unknown) {
      // Step 10 & Step 8: Log sanitized error without leaking the token
      this.logger.error('Failed to dispatch password reset email', {
        recipient: email,
        provider: this.sender.getProviderName(),
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
}
