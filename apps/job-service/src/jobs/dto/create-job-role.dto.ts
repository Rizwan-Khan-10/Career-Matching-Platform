import {
    ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min,
} from 'class-validator';
import { ALL_STACK_IDS, TRACK_IDS } from '../../taxonomy/taxonomy';

export const ROLE_LEVELS = ['fresher', 'experienced', 'any'] as const;
export const SALARY_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'] as const;
export const SALARY_PERIODS = ['year', 'month'] as const;

/**
 * Every key of contract 4.1. Optional keys: absent or null = "rule not set".
 * (IsOptional lets both undefined and null through.)
 * Whether the stacks belong to the track is checked in JobsService (needs both values).
 */
export class CreateJobRoleDto {
    @IsString()
    @MaxLength(150)
    title: string;

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    summary?: string | null;

    @IsArray()
    @ArrayMaxSize(40)
    @IsString({ each: true })
    @MaxLength(60, { each: true })
    requiredSkills: string[];

    // nice-to-have skills: used by matching as a (smaller) bonus, never as a hard requirement
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(40)
    @IsString({ each: true })
    @MaxLength(60, { each: true })
    preferredSkills?: string[];

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(60)
    minExperienceYears?: number | null;

    // Upper limit set by the company ("up to 3 years"). null / absent = NO upper limit. Must not be below minExperienceYears
    // (checked in JobsService, it needs both values).
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(60)
    maxExperienceYears?: number | null;

    // true = a candidate below minExperienceYears is rejected outright; false / null = only a big shortfall is
    @IsOptional()
    @IsBoolean()
    strictMinExperience?: boolean | null;

    // Salary the company offers (optional, shown to applicants, never used for matching). Either bound alone is fine
    // ("from X" / "up to Y"). Amounts are whole money units per period, e.g. 600000 INR per year.
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(1000000000)
    salaryMin?: number | null;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(1000000000)
    salaryMax?: number | null;

    @IsOptional()
    @IsIn(SALARY_CURRENCIES as unknown as string[])
    salaryCurrency?: string | null;

    @IsOptional()
    @IsIn(SALARY_PERIODS as unknown as string[])
    salaryPeriod?: string | null;

    @IsOptional()
    @IsString()
    @MaxLength(300)
    qualifications?: string | null;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(30)
    @IsString({ each: true })
    @MaxLength(300, { each: true })
    responsibilities?: string[] | null;

    @IsOptional()
    @IsIn(ROLE_LEVELS, { message: `level must be one of: ${ROLE_LEVELS.join(', ')}` })
    level?: (typeof ROLE_LEVELS)[number] | null;

    @IsOptional()
    @IsIn(TRACK_IDS, { message: `track must be one of: ${TRACK_IDS.join(', ')}` })
    track?: string | null;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(ALL_STACK_IDS.length)
    @ArrayUnique()
    @IsIn(ALL_STACK_IDS, { each: true, message: `each stack must be one of: ${ALL_STACK_IDS.join(', ')}` })
    stacks?: string[] | null;

    // CGPA scale is 10 (contract 4.3)
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(10)
    minCgpa?: number | null;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(30)
    @ArrayUnique()
    @IsString({ each: true })
    @IsNotEmpty({ each: true })
    @MaxLength(100, { each: true })
    allowedBranches?: string[] | null;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(10)
    @ArrayUnique()
    @IsInt({ each: true })
    @Min(1990, { each: true })
    @Max(2100, { each: true })
    passingYears?: number[] | null;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(50)
    maxBacklogs?: number | null;
}
