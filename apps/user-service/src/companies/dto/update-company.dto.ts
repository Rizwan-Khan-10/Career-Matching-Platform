import { IsOptional, IsString, IsUrl, MaxLength, ValidateIf } from 'class-validator';

export class UpdateCompanyDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(100) industry?: string;
  @IsOptional() @IsString() @MaxLength(100) contact?: string;

  @IsOptional()
  @ValidateIf((o) => o.website !== '')
  @IsUrl()
  @MaxLength(300)
  website?: string;

  @IsOptional() @IsString() @MaxLength(100) location?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}