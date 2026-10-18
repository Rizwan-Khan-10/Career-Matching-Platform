import { Transform } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

// Forms send '' for a cleared field: store it as null. IsOptional() lets null through.
const blankToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);
const trimBlankToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export class AcademicFieldsDto {
  @IsOptional()
  @Transform(blankToNull)
  @IsNumber({}, { message: 'CGPA must be a number' })
  @Min(0, { message: 'CGPA cannot be negative' })
  @Max(100, { message: 'CGPA cannot be above 100' })
  cgpa?: number | null;

  @IsOptional()
  @Transform(trimBlankToNull)
  @IsString()
  @MaxLength(100, { message: 'Branch is too long (max 100 characters)' })
  branch?: string | null;

  @IsOptional()
  @Transform(blankToNull)
  @IsInt({ message: 'Passing year must be a whole number' })
  @Min(1990, { message: 'Passing year must be 1990 or later' })
  @Max(2100, { message: 'Passing year must be 2100 or earlier' })
  passingYear?: number | null;

  @IsOptional()
  @Transform(blankToNull)
  @IsInt({ message: 'Backlogs must be a whole number' })
  @Min(0, { message: 'Backlogs cannot be negative' })
  @Max(50, { message: 'Backlogs cannot be above 50' })
  backlogs?: number | null;
}