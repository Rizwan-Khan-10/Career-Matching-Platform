import { IsString, MaxLength } from 'class-validator';

export class SetupTokenDto {
  @IsString()
  @MaxLength(100)
  setupToken: string;
}