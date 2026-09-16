import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PasswordHasher } from './password-hasher.interface';

// Pre-computed Argon2id hash used to prevent timing attacks when an email does not exist
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$dHVtbXlzYWx0Zm9ydGltaW5n$U29tZVVua25vd25QYXNzd29yZEhhc2hWYWx1ZUZvclZlcmlmaWNhdGlvbg';

@Injectable()
export class Argon2PasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MB
      timeCost: 3,
      parallelism: 4,
    });
  }

  async verify(password: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  async verifyDummy(): Promise<boolean> {
    try {
      await argon2.verify(DUMMY_HASH, 'dummy-password-for-timing');
    } catch {
      // Intentionally ignore
    }
    return false;
  }
}
