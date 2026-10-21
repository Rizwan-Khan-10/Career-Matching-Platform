import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class VerifyTwoFactorDto {
  @IsString()
  @MaxLength(100)
  challengeId: string;

  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code' })
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  recoveryCode?: string;
}