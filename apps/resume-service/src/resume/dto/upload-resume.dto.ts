import { IsString } from 'class-validator';

export class UploadResumeDto {
    @IsString()
    applicantId: string;
}