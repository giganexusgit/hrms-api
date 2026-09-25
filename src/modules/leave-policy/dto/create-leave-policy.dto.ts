import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import {
  AccrualFrequency,
  GenderEligibility,
  ScopeType,
} from '../entities/leave-policy.entity';

export class CreateLeavePolicyDto {
  @IsNotEmpty()
  @IsUUID()
  leaveTypeId!: string;

  @IsOptional()
  @IsEnum(ScopeType)
  scopeType?: ScopeType;

  @IsOptional()
  @IsString() // Can be UUID depending on scope
  scopeId?: string;

  @IsOptional()
  @IsString() // ISO Date YYYY-MM-DD
  effectiveFrom?: string;

  @IsOptional()
  @IsString() // ISO Date YYYY-MM-DD
  effectiveTo?: string;

  @IsOptional()
  @IsBoolean()
  isPaid?: boolean;

  @IsNotEmpty()
  @IsNumber()
  annualQuota!: number;

  @IsOptional()
  @IsNumber()
  accrualRate?: number;

  @IsOptional()
  @IsEnum(AccrualFrequency)
  accrualFrequency?: AccrualFrequency;

  @IsOptional()
  @IsBoolean()
  carryForward?: boolean;

  @IsOptional()
  @IsBoolean()
  monthlyCarryForward?: boolean;

  @IsOptional()
  @IsNumber()
  maxCarryForward?: number;

  @IsOptional()
  @IsNumber()
  carryForwardExpiryMonths?: number;

  @IsOptional()
  @IsEnum(GenderEligibility)
  gender?: GenderEligibility;

  @IsOptional()
  @IsNumber()
  minimumServiceDays?: number;

  @IsOptional()
  @IsNumber()
  noticeDays?: number;

  @IsOptional()
  @IsNumber()
  documentRequiredAfterDays?: number;

  @IsOptional()
  @IsBoolean()
  allowHalfDay?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @IsOptional()
  @IsBoolean()
  allowNegativeBalance?: boolean;

  @IsOptional()
  @IsNumber()
  maxNegativeBalance?: number;

  @IsOptional()
  @IsBoolean()
  encashable?: boolean;

  @IsOptional()
  @IsBoolean()
  countWeekend?: boolean;

  @IsOptional()
  @IsBoolean()
  countHoliday?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
