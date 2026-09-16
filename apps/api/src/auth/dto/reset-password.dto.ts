import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ type: String, description: 'Single-use password reset token' })
  token!: string;

  @ApiProperty({
    type: String,
    format: 'password',
    example: 'NewStrongPassword123!',
    description: 'New password (minimum 10 characters)',
  })
  newPassword!: string;
}
