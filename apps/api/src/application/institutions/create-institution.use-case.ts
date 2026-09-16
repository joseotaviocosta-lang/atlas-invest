import { Inject, Injectable } from '@nestjs/common';
import { Institution, InstitutionType } from '@atlas/domain';
import { IInstitutionRepository } from '@atlas/database';
import { INSTITUTION_REPOSITORY } from '../../database/tokens';

export interface CreateInstitutionCommand {
  name: string;
  type: InstitutionType;
  country: string;
}

@Injectable()
export class CreateInstitutionUseCase {
  constructor(
    @Inject(INSTITUTION_REPOSITORY)
    private readonly institutionRepository: IInstitutionRepository,
  ) {}

  async execute(command: CreateInstitutionCommand): Promise<Institution> {
    const institution = Institution.create({
      name: command.name,
      type: command.type,
      country: command.country,
    });

    return this.institutionRepository.create(institution);
  }
}
