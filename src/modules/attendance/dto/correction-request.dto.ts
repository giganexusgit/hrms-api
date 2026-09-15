import { IsString, IsOptional } from 'class-validator';

export class CorrectionRequestDto {
  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsString()
  date!: string;

  @IsString()
  reason!: string;

  @IsOptional()
  requestedCheckIn?: string;

  @IsOptional()
  requestedCheckOut?: string;
}

