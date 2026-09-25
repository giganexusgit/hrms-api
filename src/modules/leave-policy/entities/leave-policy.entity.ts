import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { LeaveType } from '../../leave-type/entities/leave-type.entity';
import { TenantAwareEntity } from '../../../common/entities/tenant-aware.entity';

export enum AccrualFrequency {
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY',
  UPFRONT = 'UPFRONT',
  NONE = 'NONE',
}

export enum GenderEligibility {
  ALL = 'ALL',
  MALE = 'MALE',
  FEMALE = 'FEMALE',
}

export enum ScopeType {
  ORGANIZATION = 'ORGANIZATION',
  BRANCH = 'BRANCH',
  DEPARTMENT = 'DEPARTMENT',
  TEAM = 'TEAM',
}

@Entity('leave_policies')
@Index(['tenantId', 'leaveTypeId'])
export class LeavePolicy extends TenantAwareEntity {

  @Column({ name: 'leave_type_id' })
  leaveTypeId!: string;

  @ManyToOne(() => LeaveType, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'leave_type_id', referencedColumnName: 'id' },
  ])
  leaveType!: LeaveType;

  // --- Scope Assignment ---
  @Column({ type: 'enum', enum: ScopeType, default: ScopeType.ORGANIZATION })
  scopeType!: ScopeType;

  @Column({ name: 'scope_id', nullable: true })
  scopeId?: string;

  // --- Versioning ---
  @Column({ type: 'date', name: 'effective_from', nullable: true })
  effectiveFrom?: string;

  @Column({ type: 'date', name: 'effective_to', nullable: true })
  effectiveTo?: string;

  // --- Payroll Rules ---
  @Column({ name: 'is_paid', default: true })
  isPaid!: boolean;

  // --- Accrual Rules ---
  @Column({ type: 'decimal', precision: 5, scale: 2, name: 'annual_quota' })
  annualQuota!: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    name: 'accrual_rate',
    default: 0,
  })
  accrualRate!: number;

  @Column({
    type: 'enum',
    enum: AccrualFrequency,
    name: 'accrual_frequency',
    default: AccrualFrequency.YEARLY,
  })
  accrualFrequency!: AccrualFrequency;

  // --- Carry Forward ---
  @Column({ name: 'carry_forward', default: false })
  carryForward!: boolean;

  @Column({ name: 'monthly_carry_forward', default: true })
  monthlyCarryForward!: boolean;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    name: 'max_carry_forward',
    default: 0,
  })
  maxCarryForward!: number;

  @Column({ name: 'carry_forward_expiry_months', nullable: true })
  carryForwardExpiryMonths?: number;

  // --- Eligibility ---
  @Column({
    type: 'enum',
    enum: GenderEligibility,
    default: GenderEligibility.ALL,
  })
  gender!: GenderEligibility;

  @Column({ name: 'minimum_service_days', default: 0 })
  minimumServiceDays!: number;

  // --- Constraints ---
  @Column({ name: 'notice_days', default: 0 })
  noticeDays!: number;

  @Column({ name: 'document_required_after_days', nullable: true })
  documentRequiredAfterDays?: number;

  @Column({ name: 'allow_half_day', default: false })
  allowHalfDay!: boolean;

  @Column({ name: 'requires_approval', default: true })
  requiresApproval!: boolean;

  @Column({ name: 'allow_negative_balance', default: false })
  allowNegativeBalance!: boolean;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    name: 'max_negative_balance',
    default: 0,
  })
  maxNegativeBalance!: number;

  @Column({ default: false })
  encashable!: boolean;

  // --- Calendar ---
  @Column({ name: 'count_weekend', default: true })
  countWeekend!: boolean;

  @Column({ name: 'count_holiday', default: true })
  countHoliday!: boolean;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

}
