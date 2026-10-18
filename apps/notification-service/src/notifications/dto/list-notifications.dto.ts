import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;

export class ListNotificationsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit?: number;

  /** The `nextCursor` of the previous page (a notification id). */
  @IsOptional()
  @IsUUID()
  cursor?: string;

  /** `unread=1` -> only unread notifications. */
  @IsOptional()
  @IsIn(['1', 'true', '0', 'false'])
  unread?: string;
}