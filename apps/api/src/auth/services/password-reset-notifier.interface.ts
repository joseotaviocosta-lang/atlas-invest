export const PASSWORD_RESET_NOTIFIER = Symbol('PASSWORD_RESET_NOTIFIER');

export interface PasswordResetNotifier {
  sendResetEmail(email: string, token: string): Promise<void>;
}

export class InMemoryPasswordResetNotifier implements PasswordResetNotifier {
  private lastTokens = new Map<string, string>();

  async sendResetEmail(email: string, token: string): Promise<void> {
    this.lastTokens.set(email.toLowerCase().trim(), token);
  }

  getLastToken(email: string): string | undefined {
    return this.lastTokens.get(email.toLowerCase().trim());
  }

  clear(): void {
    this.lastTokens.clear();
  }
}
