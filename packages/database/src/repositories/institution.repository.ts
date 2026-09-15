import { PrismaClient } from '@prisma/client';
import { Institution } from '@atlas/domain';
import { IInstitutionRepository } from './interfaces';
import { InstitutionMapper } from '../mappers/institution.mapper';
import { getPrismaClient } from '../client';

export class InstitutionRepository implements IInstitutionRepository {
  constructor(private readonly prisma: PrismaClient = getPrismaClient()) {}

  async findById(id: string): Promise<Institution | null> {
    const raw = await this.prisma.institution.findUnique({ where: { id } });
    return raw ? InstitutionMapper.toDomain(raw) : null;
  }

  async create(institution: Institution): Promise<Institution> {
    const created = await this.prisma.institution.create({
      data: InstitutionMapper.toPersistence(institution),
    });
    return InstitutionMapper.toDomain(created);
  }

  async list(): Promise<Institution[]> {
    const items = await this.prisma.institution.findMany({
      orderBy: { name: 'asc' },
    });
    return items.map((item) => InstitutionMapper.toDomain(item));
  }
}
