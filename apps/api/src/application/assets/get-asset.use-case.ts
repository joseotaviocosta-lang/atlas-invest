import { Inject, Injectable } from '@nestjs/common';
import { Asset } from '@atlas/domain';
import { IAssetRepository, EntityNotFoundError } from '@atlas/database';
import { ASSET_REPOSITORY } from '../../database/tokens';

@Injectable()
export class GetAssetUseCase {
  constructor(
    @Inject(ASSET_REPOSITORY)
    private readonly assetRepository: IAssetRepository,
  ) {}

  async execute(assetId: string): Promise<Asset> {
    const asset = await this.assetRepository.findById(assetId);
    if (!asset) {
      throw new EntityNotFoundError('Asset', assetId);
    }
    return asset;
  }
}
