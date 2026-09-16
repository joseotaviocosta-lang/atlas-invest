import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ type: String, example: 'investor@example.com', description: 'User email address' })
  email!: string;

  @ApiProperty({
    type: String,
    format: 'password',
    example: 'StrongPassword123!',
    description: 'User password (minimum 10 characters)',
  })
  password!: string;

  @ApiProperty({ type: String, example: 'Atlas Investor', description: 'Full name' })
  name!: string;
}
