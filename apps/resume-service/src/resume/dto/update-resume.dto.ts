import { IsArray, IsOptional, IsString, IsNumber, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class ProjectDto {
    @IsString()
    name: string;

    @IsString()
    description: string;
}

export class UpdateResumeDto {
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    skills?: string[];

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProjectDto)
    projects?: ProjectDto[];

    @IsOptional()
    @IsString()
    education?: string;

    @IsOptional()
    @IsNumber()
    cgpa?: number;

    @IsOptional()
    @IsNumber()
    experienceYears?: number;
}