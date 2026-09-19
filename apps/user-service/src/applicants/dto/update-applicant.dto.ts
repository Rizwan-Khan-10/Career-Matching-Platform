import { IsOptional, IsString } from 'class-validator';

export class UpdateApplicantDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() education?: string;
}