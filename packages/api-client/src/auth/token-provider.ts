import type { AccessTokenGetter } from '../types';

export interface TokenProvider {
  getToken(): Promise<string | null>;
}

export class SimpleTokenProvider implements TokenProvider {
  constructor(private readonly getter?: AccessTokenGetter) {}

  async getToken(): Promise<string | null> {
    if (!this.getter) {
      return null;
    }
    const token = await this.getter();
    return token ?? null;
  }
}
