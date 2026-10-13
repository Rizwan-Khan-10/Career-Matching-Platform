import { IsEmail, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export const SELF_SERVICE_ROLES = ['APPLICANT', 'COMPANY'] as const;

export class SignupDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt ignores everything after 72 bytes
  password: string;

  @IsIn(SELF_SERVICE_ROLES) // ADMIN can never be self-registered
  role: (typeof SELF_SERVICE_ROLES)[number];
}