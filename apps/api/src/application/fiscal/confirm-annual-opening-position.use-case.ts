import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IAnnualOpeningPositionRepository } from '@atlas/database';
import { ANNUAL_OPENING_POSITION_REPOSITORY } from '../../database/tokens';
import {
  AnnualOpeningPositionReadModel,
  mapAnnualOpeningPositionToReadModel,
} from './annual-opening-position.read-model';

export interface ConfirmAnnualOpeningPositionCommand {
  readonly id: string;
  readonly taxSubjectId: string;
}

@Injectable()
export class ConfirmAnnualOpeningPositionUseCase {
  constructor(
    @Inject(ANNUAL_OPENING_POSITION_REPOSITORY)
    private readonly openingPositionRepository: IAnnualOpeningPositionRepository,
  ) {}

  async execute(
    command: ConfirmAnnualOpeningPositionCommand,
  ): Promise<AnnualOpeningPositionReadModel> {
    const updated = await this.openingPositionRepository.confirm(command.id, command.taxSubjectId);

    if (!updated) {
      throw new NotFoundException(`Opening position ${command.id} not found.`);
    }

    return mapAnnualOpeningPositionToReadModel(updated);
  }
}
