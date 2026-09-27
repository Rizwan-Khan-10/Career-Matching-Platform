import { IsArray, IsOptional, IsString, IsNumber, ArrayMinSize } from 'class-validator';

export class CreateJobRoleDto {
    @IsString()
    title: string;

    @IsArray()
    @ArrayMinSize(0)
    @IsString({ each: true })
    requiredSkills: string[];

    @IsOptional()
    @IsNumber()
    minExperienceYears?: number;

    @IsOptional()
    @IsString()
    qualifications?: string;
}