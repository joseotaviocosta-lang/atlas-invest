import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { PRISMA_CLIENT } from '../../apps/api/src/database/tokens';
import {
  PASSWORD_RESET_NOTIFIER,
  InMemoryPasswordResetNotifier,
} from '../../apps/api/src/auth/services/password-reset-notifier.interface';
import { getTestPrismaClient, cleanDatabase, disconnectTestDatabase } from '../database/setup';

export { cleanDatabase, disconnectTestDatabase, getTestPrismaClient };

let testApp: INestApplication | null = null;
let notifierInstance: InMemoryPasswordResetNotifier | null = null;

export async function createAuthTestApp(): Promise<{
  app: INestApplication;
  notifier: InMemoryPasswordResetNotifier;
}> {
  const prisma = getTestPrismaClient();
  notifierInstance = new InMemoryPasswordResetNotifier();

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PRISMA_CLIENT)
    .useValue(prisma)
    .overrideProvider(PASSWORD_RESET_NOTIFIER)
    .useValue(notifierInstance)
    .compile();

  const app = moduleFixture.createNestApplication();
  configureApp(app);
  await app.init();
  testApp = app;

  return { app, notifier: notifierInstance };
}

export async function closeAuthTestApp(): Promise<void> {
  if (testApp) {
    await testApp.close();
    testApp = null;
  }
  await disconnectTestDatabase();
}

export interface AuthSessionFixture {
  user: {
    id: string;
    email: string;
    name: string;
  };
  accessToken: string;
  refreshToken: string;
}

export async function registerAndLoginUser(
  app: INestApplication,
  email = 'investor@atlas.dev',
  password = 'StrongPassword123!',
  name = 'Test Investor',
): Promise<AuthSessionFixture> {
  // Register
  await request(app.getHttpServer()).post('/api/v1/auth/register').send({ email, password, name });

  // Login
  const loginRes = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password });

  return {
    user: loginRes.body.data.user,
    accessToken: loginRes.body.data.accessToken,
    refreshToken: loginRes.body.data.refreshToken,
  };
}
