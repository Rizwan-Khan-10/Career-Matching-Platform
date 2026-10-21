import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Max, Min } from 'class-validator';

export class ListAuditDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'limit must be a whole number' })
    @Min(1, { message: 'limit must be at least 1' })
    @Max(200, { message: 'limit can be at most 200' })
    limit?: number;

    // only entries where this user is the actor or the target
    @IsOptional()
    @IsString()
    @MaxLength(100)
    personId?: string;
}