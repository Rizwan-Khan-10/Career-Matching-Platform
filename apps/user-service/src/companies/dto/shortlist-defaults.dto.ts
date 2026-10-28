import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export const SHORTLIST_MODES = ['online', 'offline', 'phone'] as const;

/**
 * What the company wants pre-filled the next time it shortlists someone (same limits as the shortlist form).
 * The date and time is NOT part of it: that is different for every candidate.
 * Empty string / null = "not saved".
 */
export class ShortlistDefaultsDto {
  @IsOptional() @IsString() @MaxLength(100) roundName?: string | null;

  @IsOptional()
  @IsIn(SHORTLIST_MODES as unknown as string[])
  mode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^(https?:\/\/\S+)?$/i, { message: 'link must start with http:// or https://' })
  link?: string | null;

  @IsOptional() @IsString() @MaxLength(300) address?: string | null;
  @IsOptional() @IsString() @MaxLength(500) bring?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) note?: string | null;
}
