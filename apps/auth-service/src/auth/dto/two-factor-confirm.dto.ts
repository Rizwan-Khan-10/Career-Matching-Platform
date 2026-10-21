import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class TwoFactorConfirmDto {
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password: string;

  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code' })
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  recoveryCode?: string;
}