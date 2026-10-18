import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListAuditDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'limit must be a whole number' })
    @Min(1, { message: 'limit must be at least 1' })
    @Max(200, { message: 'limit can be at most 200' })
    limit?: number;
}