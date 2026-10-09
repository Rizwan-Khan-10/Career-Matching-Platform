import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

export class ApplicantSummariesDto {
    @IsArray()
    @ArrayMaxSize(100)
    @IsString({ each: true })
    ids: string[];
}