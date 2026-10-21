import { IsString, Matches, MaxLength } from 'class-validator';

export class FinishSetupLoginDto {
  @IsString()
  @MaxLength(100)
  setupToken: string;

  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code' })
  code: string;
}