import { IsArray, IsOptional, IsString, IsNumber, Min, Max, MaxLength } from 'class-validator';

// Note: IsOptional() lets BOTH undefined ("don't touch") and null ("clear this field") through.
export class UpdateJobRoleDto {
    @IsOptional()
    @IsString()
    @MaxLength(150)
    title?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    requiredSkills?: string[];

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