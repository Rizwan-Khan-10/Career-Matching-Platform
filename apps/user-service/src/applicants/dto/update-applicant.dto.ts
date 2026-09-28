import { IsOptional, IsString, IsUrl, MaxLength, ValidateIf } from 'class-validator';

export class UpdateApplicantDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @IsString() @MaxLength(200) education?: string;
  @IsOptional() @IsString() @MaxLength(100) headline?: string;
  @IsOptional() @IsString() @MaxLength(100) location?: string;

  @IsOptional()
  @ValidateIf((o) => o.linkedinUrl !== '')
  @IsUrl()
  @MaxLength(300)
  linkedinUrl?: string;
}