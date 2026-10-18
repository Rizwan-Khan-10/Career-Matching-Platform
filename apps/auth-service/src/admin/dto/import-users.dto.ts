import { Transform } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsIn, IsInt, IsNumber, IsObject,
  IsOptional, IsString, Max, MaxLength, Min,
} from 'class-validator';

export const IMPORT_ROLES = ['APPLICANT', 'COMPANY'] as const;
export const MAX_IMPORT_ROWS = 500;

const trimmedOrUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value ?? undefined;
  const v = value.trim();
  return v === '' ? undefined : v;
};

// CSV cells arrive as strings. Blank -> undefined; a non-number stays a string so IsNumber/IsInt reports it.
const numberOrUndefined = ({ value }: { value: unknown }) => {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'string') return value;
  const v = value.trim();
  if (v === '') return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? v : n;
};

/** One CSV row. Validated per row in the service so one bad row does not reject the whole file. */
export class ImportUserRowDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Invalid email address' })
  email: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsIn(IMPORT_ROLES, { message: 'Role must be APPLICANT or COMPANY' })
  role: (typeof IMPORT_ROLES)[number];

  @IsOptional()
  @Transform(trimmedOrUndefined)
  @IsString()
  @MaxLength(120, { message: 'Name is too long (max 120 characters)' })
  name?: string;

  @IsOptional()
  @Transform(numberOrUndefined)
  @IsNumber({}, { message: 'CGPA must be a number' })
  @Min(0, { message: 'CGPA cannot be negative' })
  @Max(100, { message: 'CGPA cannot be above 100' })
  cgpa?: number;

  @IsOptional()
  @Transform(trimmedOrUndefined)
  @IsString()
  @MaxLength(100, { message: 'Branch is too long (max 100 characters)' })
  branch?: string;

  @IsOptional()
  @Transform(numberOrUndefined)
  @IsInt({ message: 'Passing year must be a whole number' })
  @Min(1990, { message: 'Passing year must be 1990 or later' })
  @Max(2100, { message: 'Passing year must be 2100 or earlier' })
  passingYear?: number;

  @IsOptional()
  @Transform(numberOrUndefined)
  @IsInt({ message: 'Backlogs must be a whole number' })
  @Min(0, { message: 'Backlogs cannot be negative' })
  @Max(50, { message: 'Backlogs cannot be above 50' })
  backlogs?: number;
}

export class ImportUsersDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Provide at least one user to import' })
  @ArrayMaxSize(MAX_IMPORT_ROWS, { message: `You can import at most ${MAX_IMPORT_ROWS} users at a time` })
  @IsObject({ each: true, message: 'Every row must be an object' })
  users: Record<string, unknown>[];
}