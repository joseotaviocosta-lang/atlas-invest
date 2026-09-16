import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, OpenAPIObject } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters';

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Project Atlas API')
    .setDescription('Financial Portfolio & Wealth Management Engine API')
    .setVersion('0.1.0')
    .addTag('Portfolios', 'Portfolio management and configuration')
    .addTag('Institutions', 'Financial institutions and brokerages')
    .addTag('Accounts', 'Custody and trading accounts')
    .addTag('Assets', 'Tradable financial assets and instruments')
    .addTag('Transactions', 'Append-only financial transaction ledger')
    .build();

  return SwaggerModule.createDocument(app, config);
}

export function configureApp(app: INestApplication): void {
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
