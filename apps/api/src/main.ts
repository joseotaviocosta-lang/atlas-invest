import 'reflect-metadata';
import * as path from 'path';

// Deterministic dev/local environment bootstrap: load root .env if DATABASE_URL is not set
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile?.(path.resolve(__dirname, '../../../.env'));
  } catch {
    try {
      process.loadEnvFile?.(path.resolve(process.cwd(), '.env'));
    } catch {
      // Ignored if not found
    }
  }
}

import { NestFactory } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, OpenAPIObject } from '@nestjs/swagger';
import helmet from 'helmet';
import * as express from 'express';
import { logger } from '@atlas/logger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters';

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Project Atlas API')
    .setDescription('Financial Portfolio & Wealth Management Engine API')
    .setVersion('0.1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter JWT Access Token',
        in: 'header',
      },
      'bearer',
    )
    .addTag('Authentication', 'User registration, login, and session management')
    .addTag('Portfolios', 'Portfolio management and configuration')
    .addTag('Institutions', 'Financial institutions and brokerages')
    .addTag('Accounts', 'Custody and trading accounts')
    .addTag('Assets', 'Tradable financial assets and instruments')
    .addTag('Transactions', 'Append-only financial transaction ledger')
    .build();

  return SwaggerModule.createDocument(app, config);
}

export function validateProductionSecrets(): void {
  if (process.env.ATLAS_LOCAL_OWNER_MODE === 'true') {
    if (!process.env.JWT_ACCESS_SECRET) {
      process.env.JWT_ACCESS_SECRET = 'atlas-desktop-local-owner-jwt-access-secret-production-32chars';
    }
    if (!process.env.REFRESH_TOKEN_PEPPER) {
      process.env.REFRESH_TOKEN_PEPPER = 'atlas-desktop-local-owner-refresh-pepper-production-32chars';
    }
    if (!process.env.PASSWORD_RESET_PEPPER) {
      process.env.PASSWORD_RESET_PEPPER = 'atlas-desktop-local-owner-reset-pepper-production-32chars';
    }
  }

  if (process.env.NODE_ENV === 'production') {
    const requiredSecrets = [
      { name: 'JWT_ACCESS_SECRET', value: process.env.JWT_ACCESS_SECRET },
      { name: 'REFRESH_TOKEN_PEPPER', value: process.env.REFRESH_TOKEN_PEPPER },
      { name: 'PASSWORD_RESET_PEPPER', value: process.env.PASSWORD_RESET_PEPPER },
    ];

    for (const secret of requiredSecrets) {
      if (
        !secret.value ||
        secret.value.length < 32 ||
        secret.value.includes('replace-with') ||
        secret.value.includes('default')
      ) {
        throw new Error(
          `Security invariant violated: ${secret.name} must be securely configured with at least 32 characters in production.`,
        );
      }
    }

    const dbUrl = process.env.DATABASE_URL;
    if (
      !dbUrl ||
      dbUrl.includes('atlas_test') ||
      dbUrl.includes('127.0.0.1:5433') ||
      dbUrl.includes('localhost:5433')
    ) {
      throw new Error(
        'Security invariant violated: DATABASE_URL in production must point to a dedicated production database, not atlas_test or port 5433.',
      );
    }
  } else if (process.env.NODE_ENV !== 'test') {
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl && (dbUrl.includes(':5432/') || dbUrl.includes(':5432?'))) {
      throw new Error(
        'Development database target invariant violated: port 5432 is obsolete and missing migrations. Point DATABASE_URL to port 5434 (atlas_dev).',
      );
    }
  }
}

export function configureApp(app: INestApplication): void {
  validateProductionSecrets();

  app.use(
    helmet({
      contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.useGlobalFilters(new GlobalExceptionFilter());

  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) return callback(null, true);
      // Installed Tauri / Mobile WebView client origins
      if (
        origin === 'tauri://localhost' ||
        origin === 'http://tauri.localhost' ||
        origin === 'https://tauri.localhost'
      ) {
        return callback(null, true);
      }
      if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    exposedHeaders: ['x-request-id'],
  });

  const document = createOpenApiDocument(app);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs-json',
  });
}

async function bootstrap() {
  validateProductionSecrets();
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  app.enableShutdownHooks();

  // Process safety guards: capture and log fatal process events without leaking secrets
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Promise Rejection detected in Node process', {
      reason: reason instanceof Error ? reason.stack || reason.message : String(reason),
    });
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception detected in Node process', {
      error: err.stack || err.message,
    });
    // Controlled fatal exit so process supervisor (e.g. systemd/Docker) initiates clean restart
    process.exit(1);
  });

  const port = process.env.API_PORT ? parseInt(process.env.API_PORT, 10) : 3001;
  await app.listen(port);

  // Extract safe database host/port/name without passwords/credentials
  const safeDbTarget = process.env.DATABASE_URL
    ? (() => {
        try {
          const parsed = new URL(process.env.DATABASE_URL!);
          return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
        } catch {
          return 'CONFIGURED';
        }
      })()
    : 'NOT_CONFIGURED';

  logger.info('[Atlas API] Server bootstrap complete', {
    environment: process.env.NODE_ENV || 'development',
    port,
    databaseTarget: safeDbTarget,
    migrationBaseline: 49,
    taxCostEnrichment:
      process.env.TAX_COST_EVIDENCE_ENRICHMENT_ENABLED === 'true' ? 'ENABLED' : 'DISABLED',
  });

  console.info(`[Atlas API] Server running on http://localhost:${port}`);
  console.info(`[Atlas API] Swagger documentation available at http://localhost:${port}/docs`);
  console.info(
    `[Atlas API] Tax cost evidence enrichment: ${
      process.env.TAX_COST_EVIDENCE_ENRICHMENT_ENABLED === 'true' ? 'ENABLED' : 'DISABLED'
    }`,
  );
}

if (process.env.NODE_ENV !== 'test') {
  bootstrap();
}
