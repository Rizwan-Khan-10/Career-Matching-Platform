import { Matches } from 'class-validator';

export class EnableTwoFactorDto {
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code' })
  code: string;
}