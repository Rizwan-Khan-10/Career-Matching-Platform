import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { AcademicFieldsDto } from '../../applicants/dto/academic-fields.dto';

export class CreateProfileDto {
  @IsString()
  userId: string;

  @IsIn(['APPLICANT', 'COMPANY'])
  role: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  // COMPANY only; defaults to "approved" when absent (contract §4.4)
  @IsOptional()
  @IsIn(['pending', 'approved'])
  companyStatus?: 'pending' | 'approved';

  // APPLICANT only, from the admin CSV import
  @IsOptional()
  @ValidateNested()
  @Type(() => AcademicFieldsDto)
  academic?: AcademicFieldsDto;

  @IsOptional()
  @IsBoolean()
  academicVerified?: boolean;
}