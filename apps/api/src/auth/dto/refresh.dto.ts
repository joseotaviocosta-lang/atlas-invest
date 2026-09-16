import { ApiProperty } from '@nestjs/swagger';

export class RefreshDto {
  @ApiProperty({ type: String, description: 'Opaque refresh token' })
  refreshToken!: string;
}
