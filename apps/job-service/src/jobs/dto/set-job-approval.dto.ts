import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class SetJobApprovalDto {
    @IsBoolean()
    approved: boolean;

    /** Shown to the company, e.g. why the posting was rejected. */
    @IsOptional()
    @IsString()
    @MaxLength(500)
    note?: string;
}
