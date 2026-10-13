import { ArrayMaxSize, IsArray, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class ProjectDto {
    @IsString()
    @MaxLength(150)
    name: string;

    @IsString()
    @MaxLength(1000)
    description: string;
}

export class UpdateResumeDto {
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(80)
    @IsString({ each: true })
    @MaxLength(60, { each: true })
    skills?: string[];

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(15)
    @ValidateNested({ each: true })
    @Type(() => ProjectDto)
    projects?: ProjectDto[];

    @IsOptional()
    @IsString()
    @MaxLength(300)
    education?: string;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(100)
    cgpa?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(60)
    experienceYears?: number;
}