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
