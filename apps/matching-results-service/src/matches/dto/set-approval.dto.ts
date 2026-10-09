import { IsBoolean } from 'class-validator';

export class SetApprovalDto {
    // true = "yes, share my resume with this company", false = "not interested"
    @IsBoolean()
    approved: boolean;
}