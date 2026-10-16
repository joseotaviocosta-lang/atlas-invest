import 'reflect-metadata';
import * as argon2 from 'argon2';
import { getPrismaClient, disconnectPrismaClient, UserRepository } from '@atlas/database';

function parseArgs(): {
  email?: string;
  password?: string;
  name?: string;
  resetPassword?: boolean;
} {
  const args = process.argv.slice(2);
  const result: { email?: string; password?: string; name?: string; resetPassword?: boolean } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--email' && args[i + 1]) {
      result.email = args[++i];
    } else if (arg === '--password' && args[i + 1]) {
      result.password = args[++i];
    } else if (arg === '--name' && args[i + 1]) {
      result.name = args[++i];
    } else if (arg === '--reset-password') {
      result.resetPassword = true;
    }
  }

  return result;
}

async function bootstrapOwner() {
  const args = parseArgs();

  const email = (args.email || process.env.OWNER_EMAIL || '').trim().toLowerCase();
  const password = args.password || process.env.OWNER_PASSWORD || '';
  const name = (args.name || process.env.OWNER_NAME || 'Owner').trim();
  const resetPassword = args.resetPassword || process.env.OWNER_RESET_PASSWORD === 'true';

  if (!email || !email.includes('@')) {
    console.error('Error: Valid owner email must be provided via --email or OWNER_EMAIL env var.');
    process.exit(1);
  }

  if (!password || password.length < 10) {
    console.error(
      'Error: Owner password must be at least 10 characters long (via --password or OWNER_PASSWORD).',
    );
    process.exit(1);
  }

  const prisma = getPrismaClient();
  const userRepo = new UserRepository(prisma);

  try {
    const existing = await userRepo.findByEmail(email);

    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    if (existing) {
      if (resetPassword) {
        await userRepo.updatePassword(existing.id, passwordHash);
        console.info(
          `[BOOTSTRAP] Password updated successfully for existing owner user: ${email} (ID: ${existing.id})`,
        );
      } else {
        console.info(
          `[BOOTSTRAP] Owner user already exists: ${email} (ID: ${existing.id}). Use --reset-password to update password.`,
        );
      }
      return;
    }

    const created = await userRepo.create({
      email,
      name,
      passwordHash,
    });

    console.info(
      `[BOOTSTRAP] Owner user created successfully: ${created.email} (ID: ${created.id})`,
    );
  } catch (err) {
    console.error('[BOOTSTRAP] Failed to bootstrap owner user:', (err as Error).message);
    process.exit(1);
  } finally {
    await disconnectPrismaClient();
  }
}

if (process.argv[1]?.includes('bootstrap-owner')) {
  bootstrapOwner().catch((err) => {
    console.error('[BOOTSTRAP] Unexpected fatal error:', err);
    process.exit(1);
  });
}

export { bootstrapOwner };
