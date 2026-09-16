import { PrismaClient, Prisma } from '@prisma/client';
import { IUserRepository, UserRecord, CreateUserData } from './interfaces';
import { UserAlreadyExistsError } from '../errors/user-already-exists-error';
import { PersistenceError } from '../errors/persistence-error';

export class UserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateUserData): Promise<UserRecord> {
    try {
      const user = await this.prisma.user.create({
        data: {
          ...(data.id ? { id: data.id } : {}),
          email: data.email,
          name: data.name,
          passwordHash: data.passwordHash,
          locale: data.locale ?? 'pt-BR',
          timezone: data.timezone ?? 'America/Sao_Paulo',
          baseCurrency: data.baseCurrency ?? 'BRL',
        },
      });
      return user;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new UserAlreadyExistsError(data.email);
      }
      throw new PersistenceError(`Failed to create user: ${(error as Error).message}`);
    }
  }

  async findById(id: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      });
    } catch (error) {
      throw new PersistenceError(`Failed to update password: ${(error as Error).message}`);
    }
  }
}
