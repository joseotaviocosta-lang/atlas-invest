import { Inject, Injectable } from '@nestjs/common';
import { Institution } from '@atlas/domain';
import { IInstitutionRepository, EntityNotFoundError } from '@atlas/database';
import { INSTITUTION_REPOSITORY } from '../../database/tokens';

@Injectable()
export class GetInstitutionUseCase {
  constructor(
    @Inject(INSTITUTION_REPOSITORY)
    private readonly institutionRepository: IInstitutionRepository,
  ) {}

  async execute(institutionId: string): Promise<Institution> {
    const institution = await this.institutionRepository.findById(institutionId);
    if (!institution) {
      throw new EntityNotFoundError('Institution', institutionId);
    }
    return institution;
  }
}
