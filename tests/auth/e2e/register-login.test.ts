import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createAuthTestApp, closeAuthTestApp, cleanDatabase, getTestPrismaClient } from '../setup';

describe('Auth E2E: Register, Login, /me', () => {
  let app: INestApplication;
  const prisma = getTestPrismaClient();

  beforeAll(async () => {
    const res = await createAuthTestApp();
    app = res.app;
  });

  afterAll(async () => {
    await closeAuthTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user, store passwordHash, and never store plain password', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/auth/register').send({
        email: 'investor@project-atlas.io',
        password: 'SuperSecretPassword123!',
        name: 'Atlas Investor',
      });

      expect(res.status).toBe(201);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.email).toBe('investor@project-atlas.io');
      expect(res.body.data.name).toBe('Atlas Investor');
      expect(res.body.data.passwordHash).toBeUndefined();
      expect(res.body.data.password).toBeUndefined();

      // Check DB directly
      const userInDb = await prisma.user.findUnique({
        where: { email: 'investor@project-atlas.io' },
      });
      expect(userInDb).not.toBeNull();
      expect(userInDb?.passwordHash).toBeDefined();
      expect(userInDb?.passwordHash.startsWith('$argon2id$')).toBe(true);
      expect(userInDb?.passwordHash).not.toContain('SuperSecretPassword123!');
    });

    it('should normalize email with trim and lowercase', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/auth/register').send({
        email: '   NormalizedUser@Atlas.Dev  ',
        password: 'SuperSecretPassword123!',
        name: 'Normalized User',
      });

      expect(res.status).toBe(201);
      expect(res.body.data.email).toBe('normalizeduser@atlas.dev');

      const userInDb = await prisma.user.findUnique({
        where: { email: 'normalizeduser@atlas.dev' },
      });
      expect(userInDb).not.toBeNull();
    });

    it('should reject duplicate email registration with 409 Conflict', async () => {
      await request(app.getHttpServer()).post('/api/v1/auth/register').send({
        email: 'duplicate@atlas.dev',
        password: 'SuperSecretPassword123!',
        name: 'User One',
      });

      const res = await request(app.getHttpServer()).post('/api/v1/auth/register').send({
        email: 'duplicate@atlas.dev',
        password: 'AnotherPassword123!',
        name: 'User Two',
      });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('AUTH.EMAIL_ALREADY_EXISTS');
    });

    it('should reject passwords shorter than 10 characters with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/auth/register').send({
        email: 'shortpass@atlas.dev',
        password: 'short',
        name: 'Short Pass User',
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION.INVALID_INPUT');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    beforeEach(async () => {
      await request(app.getHttpServer()).post('/api/v1/auth/register').send({
        email: 'login-user@atlas.dev',
        password: 'CorrectPassword123!',
        name: 'Login User',
      });
    });

    it('should authenticate valid credentials and return tokens with session', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
        email: 'login-user@atlas.dev',
        password: 'CorrectPassword123!',
      });

      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe('login-user@atlas.dev');
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.expiresIn).toBe(900);

      // Verify session was created in DB
      const sessions = await prisma.session.findMany({
        where: { userId: res.body.data.user.id },
      });
      expect(sessions.length).toBe(1);
      expect(sessions[0].revokedAt).toBeNull();
    });

    it('should return 401 AUTH.INVALID_CREDENTIALS for incorrect password', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
        email: 'login-user@atlas.dev',
        password: 'WrongPassword999!',
      });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTH.INVALID_CREDENTIALS');
      expect(res.body.message).toBe('Invalid credentials.');
    });

    it('should return identical 401 AUTH.INVALID_CREDENTIALS for non-existent email', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
        email: 'non-existent@atlas.dev',
        password: 'SomePassword123!',
      });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTH.INVALID_CREDENTIALS');
      expect(res.body.message).toBe('Invalid credentials.');
    });

    it('should reject deactivated user with identical 401 AUTH.INVALID_CREDENTIALS', async () => {
      await prisma.user.update({
        where: { email: 'login-user@atlas.dev' },
        data: { deactivatedAt: new Date() },
      });

      const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
        email: 'login-user@atlas.dev',
        password: 'CorrectPassword123!',
      });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTH.INVALID_CREDENTIALS');
      expect(res.body.message).toBe('Invalid credentials.');
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return authenticated user profile with valid Bearer token', async () => {
      // Register & Login
      await request(app.getHttpServer()).post('/api/v1/auth/register').send({
        email: 'me-user@atlas.dev',
        password: 'SecurePassword123!',
        name: 'Me User',
      });

      const loginRes = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
        email: 'me-user@atlas.dev',
        password: 'SecurePassword123!',
      });

      const token = loginRes.body.data.accessToken;

      const meRes = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.data.email).toBe('me-user@atlas.dev');
      expect(meRes.body.data.name).toBe('Me User');
      expect(meRes.body.data.baseCurrency).toBe('BRL');
      expect(meRes.body.data.locale).toBe('pt-BR');
    });

    it('should reject request without Bearer token with 401 Unauthorized', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
    });

    it('should reject request with invalid Bearer token with 401 Unauthorized', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token-string');
      expect(res.status).toBe(401);
    });
  });
});
