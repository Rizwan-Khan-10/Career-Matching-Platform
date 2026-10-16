import { ArrayMaxSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ALL_STACK_IDS, TRACK_IDS } from '../../taxonomy/taxonomy';

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

    // Academic keys (contract 4.2). null is allowed so the applicant can clear a wrongly parsed value.
    @IsOptional()
    @IsString()
    @MaxLength(100)
    branch?: string | null;

    @IsOptional()
    @IsInt()
    @Min(2000)
    @Max(2100)
    passingYear?: number | null;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(50)
    backlogs?: number | null;

    // Target role: editable only while the resume is unconfirmed (checked in the service).
    @IsOptional()
    @IsIn(TRACK_IDS, { message: `targetTrack must be one of: ${TRACK_IDS.join(', ')}` })
    targetTrack?: string;

    @IsOptional()
    @IsIn(ALL_STACK_IDS, { message: `targetStack must be one of: ${ALL_STACK_IDS.join(', ')}` })
    targetStack?: string;
}