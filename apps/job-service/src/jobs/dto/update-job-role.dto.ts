import {
    ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min,
} from 'class-validator';
import { ALL_STACK_IDS, TRACK_IDS } from '../../taxonomy/taxonomy';
import { ROLE_LEVELS, SALARY_CURRENCIES, SALARY_PERIODS } from './create-job-role.dto';

// Note: IsOptional() lets BOTH undefined ("don't touch") and null ("clear this field") through.
// Same limits as CreateJobRoleDto. The track/stacks pair is checked against the merged role in JobsService.
export class UpdateJobRoleDto {
    @IsOptional()
    @IsString()
    @MaxLength(150)
    title?: string;

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    summary?: string | null;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(40)
    @IsString({ each: true })
    @MaxLength(60, { each: true })
    requiredSkills?: string[];

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
