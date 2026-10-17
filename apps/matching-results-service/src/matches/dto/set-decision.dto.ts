import { Transform, Type } from 'class-transformer';
import { IsDateString, IsDefined, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf, ValidateNested } from 'class-validator';

export const SHORTLIST_MODES = ['online', 'offline', 'phone'] as const;
export const REJECT_REASONS = ['skills_gap', 'experience', 'resume_quality', 'position_filled', 'other'] as const;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** What the applicant is told when shortlisted (contract §5.6). roundName + mode are required, the rest is optional. */
export class ShortlistDto {
    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    roundName: string;

    @IsIn(SHORTLIST_MODES)
    mode: (typeof SHORTLIST_MODES)[number];

    @IsOptional()
    @IsDateString()
    scheduledAt?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(500)
    bring?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(500)
    link?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(500)
    address?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(1000)
    note?: string;
}

/** Why the recruiter rejected. reasonCategory is required and is NEVER shown to the applicant. */
export class RejectionDto {
    @IsIn(REJECT_REASONS)
    reasonCategory: (typeof REJECT_REASONS)[number];

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(1000)
    message?: string;
}

export class SetDecisionDto {
    // `null` clears a previous decision. A missing / unknown value is an error (it must be sent explicitly).
    @ValidateIf((o: SetDecisionDto) => o.decision !== null)
    @IsIn(['shortlisted', 'rejected'])
    decision: 'shortlisted' | 'rejected' | null;

    // the matching form is required for its decision; the other one is ignored
    @ValidateIf((o: SetDecisionDto) => o.decision === 'shortlisted')
    @IsDefined()
    @ValidateNested()
    @Type(() => ShortlistDto)
    shortlist?: ShortlistDto;

    @ValidateIf((o: SetDecisionDto) => o.decision === 'rejected')
    @IsDefined()
    @ValidateNested()
    @Type(() => RejectionDto)
    rejection?: RejectionDto;
}
