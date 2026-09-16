import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({ type: String, example: 'investor@example.com', description: 'User email address' })
  email!: string;
}
