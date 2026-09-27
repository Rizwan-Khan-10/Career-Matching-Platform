import { IsArray, IsOptional, IsString, IsNumber } from 'class-validator';

export class UpdateJobRoleDto {
    @IsOptional()
    @IsString()
    title?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    requiredSkills?: string[];

    @IsOptional()
    @IsNumber()
    minExperienceYears?: number;

    @IsOptional()
    @IsString()
    qualifications?: string;
}