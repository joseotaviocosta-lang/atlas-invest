import { z } from 'zod';
import { ApiProperty } from '@nestjs/swagger';

export const AddWatchlistSchema = z.object({
  assetId: z.string().uuid({ message: 'assetId must be a valid UUID' }),
});

export type AddWatchlistDto = z.infer<typeof AddWatchlistSchema>;

export class AddWatchlistSwaggerDto {
  @ApiProperty({
    type: String,
    description: 'UUID of the asset to watch',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  assetId!: string;
}

export interface WatchlistAssetQuoteDto {
  price: string;
  currency: string;
  tradingDate: string;
  provider: string;
  freshness: 'FRESH' | 'STALE';
}

export interface WatchlistItemDto {
  id: string;
  assetId: string;
  ticker: string;
  name: string;
  type: string;
  currency: string;
  exchange: string;
  addedAt: string;
  quote: WatchlistAssetQuoteDto | null;
  quoteFreshness: 'FRESH' | 'STALE' | 'UNVALUED';
}
