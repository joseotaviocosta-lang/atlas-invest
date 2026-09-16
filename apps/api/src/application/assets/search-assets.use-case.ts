import { Inject, Injectable } from '@nestjs/common';
import { Asset, AssetType } from '@atlas/domain';
import { IAssetRepository } from '@atlas/database';
import { ASSET_REPOSITORY } from '../../database/tokens';

export interface SearchAssetsQuery {
  q?: string;
  exchange?: string;
  type?: AssetType;
}

@Injectable()
export class SearchAssetsUseCase {
  constructor(
    @Inject(ASSET_REPOSITORY)
    private readonly assetRepository: IAssetRepository,
  ) {}

  async execute(query: SearchAssetsQuery): Promise<Asset[]> {
    const all = await this.assetRepository.list();

    return all.filter((asset) => {
      if (query.q) {
        const queryTerm = query.q.trim().toUpperCase();
        const matchesTicker = asset.ticker.toUpperCase().includes(queryTerm);
        const matchesName = asset.name.toUpperCase().includes(queryTerm);
        if (!matchesTicker && !matchesName) {
          return false;
        }
      }

      if (query.exchange) {
        const queryExchange = query.exchange.trim().toUpperCase();
        if (asset.exchange.toUpperCase() !== queryExchange) {
          return false;
        }
      }

      if (query.type) {
        if (asset.type !== query.type) {
          return false;
        }
      }

      return true;
    });
  }
}
