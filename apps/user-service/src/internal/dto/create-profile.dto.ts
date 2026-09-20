import { IsEmail, IsIn, IsString } from 'class-validator';

export class CreateProfileDto {
    @IsString()
    userId: string;

    @IsIn(['APPLICANT', 'COMPANY'])
    role: string;

    @IsEmail()
    email: string;
}