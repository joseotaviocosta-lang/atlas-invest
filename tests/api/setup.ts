import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { PRISMA_CLIENT } from '../../apps/api/src/database/tokens';
import {
  getTestPrismaClient,
  cleanDatabase,
  disconnectTestDatabase,
  seedBaseFixtures,
} from '../database/setup';

export { cleanDatabase, disconnectTestDatabase, seedBaseFixtures, getTestPrismaClient };

let testApp: INestApplication | null = null;

export async function createTestApp(): Promise<INestApplication> {
  const prisma = getTestPrismaClient();

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PRISMA_CLIENT)
    .useValue(prisma)
    .compile();

  const app = moduleFixture.createNestApplication();
  configureApp(app);
  await app.init();
  testApp = app;
  return app;
}

export async function closeTestApp(): Promise<void> {
  if (testApp) {
    await testApp.close();
    testApp = null;
  }
  await disconnectTestDatabase();
}

export async function createAuthenticatedUserSession(
  userId = '11111111-1111-4111-8111-111111111111',
): Promise<{ token: string; sessionId: string }> {
  const prisma = getTestPrismaClient();
  const { TokenService } = await import('../../apps/api/src/auth/services/token.service');
  const tokenService = new TokenService();

  const rawRefresh = tokenService.generateRefreshToken();
  const hash = tokenService.hashRefreshToken(rawRefresh);

  const session = await prisma.session.create({
    data: {
      userId,
      refreshTokenHash: hash,
      expiresAt: tokenService.getRefreshTokenExpiresAt(),
    },
  });

  const token = tokenService.generateAccessToken({
    userId,
    sessionId: session.id,
  });

  return { token, sessionId: session.id };
}
