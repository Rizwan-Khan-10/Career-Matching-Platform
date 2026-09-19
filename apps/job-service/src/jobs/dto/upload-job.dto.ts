import { IsString } from 'class-validator';

export class UploadJobDto {
    @IsString()
    companyId: string;
}