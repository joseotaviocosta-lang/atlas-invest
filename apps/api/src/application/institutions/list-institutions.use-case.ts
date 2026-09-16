import { Inject, Injectable } from '@nestjs/common';
import { Institution } from '@atlas/domain';
import { IInstitutionRepository } from '@atlas/database';
import { INSTITUTION_REPOSITORY } from '../../database/tokens';

@Injectable()
export class ListInstitutionsUseCase {
  constructor(
    @Inject(INSTITUTION_REPOSITORY)
    private readonly institutionRepository: IInstitutionRepository,
  ) {}

  async execute(): Promise<Institution[]> {
    return this.institutionRepository.list();
  }
}
