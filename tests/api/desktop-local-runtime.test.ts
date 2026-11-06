import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard, isLoopbackAddress } from '../../apps/api/src/auth/guards/jwt-auth.guard';
import {
  LOCAL_OWNER_USER_ID,
  LOCAL_OWNER_SESSION_ID,
  ATLAS_CLIENT_HEADER,
  DESKTOP_LOCAL_CLIENT_VALUE,
} from '../../apps/api/src/auth/constants/local-owner.constants';
import { LocalOwnerBootstrapService } from '../../apps/api/src/auth/services/local-owner-bootstrap.service';

describe('Desktop Local Owner Runtime & Auth Boundary (APP-15C)', () => {
  describe('isLoopbackAddress', () => {
    it('recognizes IPv4 loopback (127.0.0.1)', () => {
      expect(isLoopbackAddress('127.0.0.1')).toBe(true);
    });

    it('recognizes IPv6 loopback (::1)', () => {
      expect(isLoopbackAddress('::1')).toBe(true);
    });

    it('recognizes IPv4-mapped IPv6 loopback (::ffff:127.0.0.1)', () => {
      expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
    });

    it('recognizes localhost string', () => {
      expect(isLoopbackAddress('localhost')).toBe(true);
    });

    it('rejects external private or public IP addresses', () => {
      expect(isLoopbackAddress('192.168.0.15')).toBe(false);
      expect(isLoopbackAddress('10.0.0.1')).toBe(false);
      expect(isLoopbackAddress('54.233.66.110')).toBe(false);
      expect(isLoopbackAddress(undefined)).toBe(false);
    });
  });

  describe('JwtAuthGuard Desktop Local Owner Mode', () => {
    let reflector: Reflector;
    let tokenService: any;
    let sessionRepo: any;
    let guard: JwtAuthGuard;

    beforeEach(() => {
      reflector = {
        getAllAndOverride: vi.fn().mockReturnValue(false),
      } as any;
      tokenService = {
        verifyAccessToken: vi.fn(),
      };
      sessionRepo = {
        findById: vi.fn(),
        touchLastUsed: vi.fn().mockResolvedValue(undefined),
      };
      guard = new JwtAuthGuard(reflector, tokenService, sessionRepo);
    });

    it('authenticates loopback request with x-atlas-client: desktop-local without Bearer token', async () => {
      const mockRequest: any = {
        headers: {
          [ATLAS_CLIENT_HEADER]: DESKTOP_LOCAL_CLIENT_VALUE,
        },
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
      };

      const mockContext = {
        getHandler: vi.fn(),
        getClass: vi.fn(),
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as unknown as ExecutionContext;

      const canActivate = await guard.canActivate(mockContext);
      expect(canActivate).toBe(true);
      expect(mockRequest.user).toEqual({
        userId: LOCAL_OWNER_USER_ID,
        sessionId: LOCAL_OWNER_SESSION_ID,
      });
      expect(tokenService.verifyAccessToken).not.toHaveBeenCalled();
    });

    it('rejects desktop-local client header if request originates from outside loopback', async () => {
      const mockRequest: any = {
        headers: {
          [ATLAS_CLIENT_HEADER]: DESKTOP_LOCAL_CLIENT_VALUE,
        },
        ip: '192.168.1.50',
        socket: { remoteAddress: '192.168.1.50' },
      };

      const mockContext = {
        getHandler: vi.fn(),
        getClass: vi.fn(),
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
    });

    it('requires valid Bearer token when x-atlas-client header is absent', async () => {
      const mockRequest: any = {
        headers: {},
        ip: '127.0.0.1',
      };

      const mockContext = {
        getHandler: vi.fn(),
        getClass: vi.fn(),
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('LocalOwnerBootstrapService', () => {
    it('creates technical user and default portfolio idempotently if not present', async () => {
      const userRepo: any = {
        findById: vi.fn().mockResolvedValue(null),
        findByEmail: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: LOCAL_OWNER_USER_ID, email: 'owner@atlas.local' }),
      };
      const portfolioRepo: any = {
        findByUserId: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockImplementation((p) => Promise.resolve(p)),
      };
      const institutionRepo: any = {
        findById: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation((i) => Promise.resolve(i)),
      };
      const accountRepo: any = {
        findByPortfolioId: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockImplementation((a) => Promise.resolve(a)),
      };

      const bootstrap = new LocalOwnerBootstrapService(
        userRepo,
        portfolioRepo,
        institutionRepo,
        accountRepo,
      );

      await bootstrap.bootstrapLocalOwner();

      expect(userRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: LOCAL_OWNER_USER_ID,
          email: 'owner@atlas.local',
        }),
      );
      expect(portfolioRepo.create).toHaveBeenCalled();
      expect(institutionRepo.create).toHaveBeenCalled();
      expect(accountRepo.create).toHaveBeenCalled();
    });

    it('skips creation if local owner user and portfolio already exist', async () => {
      const existingUser = { id: LOCAL_OWNER_USER_ID, email: 'owner@atlas.local' };
      const existingPortfolio = { id: '00000000-0000-4000-8000-000000000002', name: 'Carteira Principal' };
      const existingInstitution = { id: '00000000-0000-4000-8000-000000000004' };
      const existingAccount = { id: '00000000-0000-4000-8000-000000000005' };

      const userRepo: any = {
        findById: vi.fn().mockResolvedValue(existingUser),
        create: vi.fn(),
      };
      const portfolioRepo: any = {
        findByUserId: vi.fn().mockResolvedValue([existingPortfolio]),
        create: vi.fn(),
      };
      const institutionRepo: any = {
        findById: vi.fn().mockResolvedValue(existingInstitution),
        create: vi.fn(),
      };
      const accountRepo: any = {
        findByPortfolioId: vi.fn().mockResolvedValue([existingAccount]),
        create: vi.fn(),
      };

      const bootstrap = new LocalOwnerBootstrapService(
        userRepo,
        portfolioRepo,
        institutionRepo,
        accountRepo,
      );

      await bootstrap.bootstrapLocalOwner();

      expect(userRepo.create).not.toHaveBeenCalled();
      expect(portfolioRepo.create).not.toHaveBeenCalled();
      expect(institutionRepo.create).not.toHaveBeenCalled();
      expect(accountRepo.create).not.toHaveBeenCalled();
    });
  });
});
