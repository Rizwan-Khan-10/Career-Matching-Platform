import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAuditDto {
    @IsString() @IsNotEmpty() @MaxLength(100)
    actorId: string;

    @IsString() @IsNotEmpty() @MaxLength(100)
    action: string;

    @IsString() @IsNotEmpty() @MaxLength(200)
    target: string;

    @IsOptional() @IsObject()
    meta?: Record<string, unknown>;
}