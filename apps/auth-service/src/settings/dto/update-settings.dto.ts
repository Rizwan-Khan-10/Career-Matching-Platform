import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsString, MaxLength } from 'class-validator';
import { REGISTRATION_MODES, RegistrationMode } from '../settings';

export class UpdateSettingsDto {
  @IsIn(REGISTRATION_MODES, { message: 'registrationMode must be open, invite_only or domain' })
  registrationMode: RegistrationMode;

  @IsArray()
  @ArrayMaxSize(50, { message: 'You can list at most 50 domains' })
  @IsString({ each: true })
  @MaxLength(253, { each: true })
  allowedDomains: string[];

  @IsBoolean()
  companyApprovalRequired: boolean;

  @IsBoolean()
  jobApprovalRequired: boolean;
}