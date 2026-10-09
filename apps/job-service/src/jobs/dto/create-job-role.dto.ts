import { IsArray, IsOptional, IsString, IsNumber, ArrayMinSize, Min, Max, MaxLength } from 'class-validator';

export class CreateJobRoleDto {
    @IsString()
    @MaxLength(150)
    title: string;

    @IsArray()
    @ArrayMinSize(0)
    @IsString({ each: true })
    requiredSkills: string[];

    // nice-to-have skills: used by matching as a (smaller) bonus, never as a hard requirement
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    preferredSkills?: string[];

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(60)
    minExperienceYears?: number | null;

    @IsOptional()
    @IsString()
    @MaxLength(300)
    qualifications?: string | null;
}