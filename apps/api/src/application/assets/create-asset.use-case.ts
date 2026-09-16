import { Inject, Injectable } from '@nestjs/common';
import { Asset, AssetType, AssetStatus } from '@atlas/domain';
import { IAssetRepository } from '@atlas/database';
import { ASSET_REPOSITORY } from '../../database/tokens';

export interface CreateAssetCommand {
  ticker: string;
  name: string;
  type: AssetType;
  currency: string;
  exchange: string;
  isin?: string;
  cnpj?: string;
  status?: AssetStatus;
}

@Injectable()
export class CreateAssetUseCase {
  constructor(
    @Inject(ASSET_REPOSITORY)
    private readonly assetRepository: IAssetRepository,
  ) {}

  async execute(command: CreateAssetCommand): Promise<Asset> {
    const asset = Asset.create({
      ticker: command.ticker,
      name: command.name,
      type: command.type,
      currency: command.currency,
      exchange: command.exchange,
      isin: command.isin,
      cnpj: command.cnpj,
      status: command.status,
    });

    return this.assetRepository.create(asset);
  }
}
