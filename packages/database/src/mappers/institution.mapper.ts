import { Institution as PrismaInstitution, Prisma } from '@prisma/client';
import { Institution, InstitutionType } from '@atlas/domain';

export class InstitutionMapper {
  static toDomain(raw: PrismaInstitution): Institution {
    return Institution.create({
      id: raw.id,
      name: raw.name,
      type: raw.type as InstitutionType,
      country: raw.country,
    });
  }

  static toPersistence(entity: Institution): Prisma.InstitutionUncheckedCreateInput {
    return {
      id: entity.id,
      name: entity.name,
      type: entity.type,
      country: entity.country,
    };
  }
}
