import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { SELF_SERVICE_ROLES } from './signup.dto';

export class GoogleLoginDto {
  @IsString()
  @MaxLength(8000) // a Google ID token is about 1-2 KB
  credential: string;

  // only used when the person has no account yet; ADMIN can never be chosen here
  @IsOptional()
  @IsIn(SELF_SERVICE_ROLES)
  role?: (typeof SELF_SERVICE_ROLES)[number];
}