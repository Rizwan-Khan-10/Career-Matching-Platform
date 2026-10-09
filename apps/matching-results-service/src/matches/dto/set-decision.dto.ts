import { IsIn, IsOptional } from 'class-validator';

export class SetDecisionDto {
    // null clears a previous decision
    @IsOptional()
    @IsIn(['shortlisted', 'rejected'])
    decision?: 'shortlisted' | 'rejected' | null;
}