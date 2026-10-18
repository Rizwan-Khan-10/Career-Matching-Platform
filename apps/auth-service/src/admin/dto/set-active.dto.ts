import { IsBoolean } from 'class-validator';

export class SetActiveDto {
  @IsBoolean({ message: 'active must be true or false' })
  active: boolean;
}