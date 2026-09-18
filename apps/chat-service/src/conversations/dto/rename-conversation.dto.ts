import { IsString } from 'class-validator';

export class RenameConversationDto {
    @IsString()
    name: string;
}