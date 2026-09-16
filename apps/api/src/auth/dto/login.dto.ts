import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ type: String, example: 'investor@example.com', description: 'User email address' })
  email!: string;

  @ApiProperty({
    type: String,
    format: 'password',
    example: 'StrongPassword123!',
    description: 'User password',
  })
  password!: string;
}
