import { IsIn } from 'class-validator';

export const COMPANY_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];

export class SetCompanyStatusDto {
  @IsIn(COMPANY_STATUSES, { message: 'status must be pending, approved or rejected' })
  status: CompanyStatus;
}
