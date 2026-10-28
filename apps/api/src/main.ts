import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, OpenAPIObject } from '@nestjs/swagger';
import helmet from 'helmet';
import * as express from 'express';
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

  const port = process.env.API_PORT ? parseInt(process.env.API_PORT, 10) : 3001;
  await app.listen(port);
  console.info(`[Atlas API] Server running on http://localhost:${port}`);
  console.info(`[Atlas API] Swagger documentation available at http://localhost:${port}/docs`);
}

if (process.env.NODE_ENV !== 'test') {
  bootstrap();
}
