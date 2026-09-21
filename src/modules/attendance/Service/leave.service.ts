import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import dayjs from 'dayjs';
import { Leave } from '../entities/leave.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { CreateLeaveDto } from '../dto/create-leave.dto';
import { LeaveStatusEnum } from '../../../common/enums/leave-status.enum';
import { Attendance } from '../entities/attendance.entity';
import { DataSource } from 'typeorm';
import { AttendanceStatus } from '../../../common/enums/AttendanceStatus.enum';
import { LeaveEngineService } from '../../leave-engine/leave-engine.service';
import { LeavePolicy } from '../../leave-policy/entities/leave-policy.entity';
import { LeaveBalance } from '../../leave-balance/entities/leave-balance.entity';
import { LeaveTransactionType } from '../../leave-ledger/entities/leave-ledger.entity';
import { DataScopeService } from '../../../common/services/data-scope.service';
import { NotificationService } from '../../notification/notification.service';
import { NotificationType } from '../../../common/enums/NotificationType.enum';
import { Holiday } from '../../holiday/entities/holiday.entity';
import { WeekendSetting } from '../../weekend_settings/entities/weekend_setting.entity';
import { TenantQueryService } from "../../../common/services/tenant-query.service";
import { PermissionEnum } from '../../../common/enums/permission.enum';
import { RoleEnum } from '../../../common/enums/role.enum';

@Injectable()
export class LeaveService {
  constructor(
    @InjectRepository(Leave)
    private readonly leaveRepo: Repository<Leave>,

    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,

    @InjectRepository(Attendance)
    private readonly attendanceRepo: Repository<Attendance>,

    @InjectRepository(LeavePolicy)
    private readonly leavePolicyRepo: Repository<LeavePolicy>,

    @InjectRepository(LeaveBalance)
    private readonly leaveBalanceRepo: Repository<LeaveBalance>,

    @InjectRepository(Holiday)
    private readonly holidayRepo: Repository<Holiday>,

    @InjectRepository(WeekendSetting)
    private readonly weekendRepo: Repository<WeekendSetting>,

    private leaveEngineService: LeaveEngineService,

    private readonly dataSource: DataSource,
    private readonly dataScopeService: DataScopeService,
    private readonly notificationService: NotificationService, private readonly tenantQueryService: TenantQueryService
  ) {}

  async requestLeave(employeeId: string, dto: CreateLeaveDto) {
    const today = dayjs().startOf('day');

    const startDate = dayjs(dto.startDate);

    const endDate = dayjs(dto.endDate);

    if (startDate.isBefore(today)) {
      throw new BadRequestException(
        'Leave can only be requested for future dates',
      );
    }

    if (startDate.isAfter(endDate)) {
      throw new BadRequestException(
        'Start date cannot be greater than end date',
      );
    }

    const { tenantId } = this.tenantQueryService.getTenantWhereClause();

    const overlappingLeave = await this.leaveRepo
      .createQueryBuilder('leave')
      .where('leave.employee_id = :employeeId', {
        employeeId,
      })
      .andWhere('leave.status IN (:...statuses)', {
        statuses: [LeaveStatusEnum.PENDING, LeaveStatusEnum.APPROVED],
      })
      .andWhere(
        `
      (
        leave.start_date <= :endDate
        AND
        leave.end_date >= :startDate
      )
      `,
        {
          startDate: dto.startDate,

          endDate: dto.endDate,
        },
      );
    this.tenantQueryService.applyTenantFilter(overlappingLeave, 'leave');
    const hasOverlap = await overlappingLeave.getOne();

    if (hasOverlap) {
      throw new BadRequestException('Leave already exists for selected dates');
    }

    // Fetch the applicable policy for this leave type
    const policy = await this.leavePolicyRepo.findOne({
      where: { leaveTypeId: dto.leaveTypeId, isActive: true,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
    });

    if (!policy) {
      throw new BadRequestException(
        'Active policy not found for this leave type',
      );
    }

    // Notice Days Validation
    if (policy.noticeDays > 0) {
      const daysNotice = startDate.diff(today, 'day');
      if (daysNotice < policy.noticeDays) {
        throw new BadRequestException(
          `This leave type requires at least ${policy.noticeDays} days advance notice`,
        );
      }
    }

    // Fetch Employee for Validation
    const employee = await this.employeeRepo.findOne({
      where: { id: employeeId,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    if (
      policy.gender !== 'ALL' &&
      policy.gender.toString() !== employee.gender?.toString()
    ) {
      throw new BadRequestException(
        `This leave type is restricted to ${policy.gender} employees only.`,
      );
    }

    // Minimum Service Validation
    if (policy.minimumServiceDays > 0) {
      const joiningDate = employee.joiningDate || employee.createdAt;
      if (!joiningDate) {
        throw new BadRequestException(
          'Employee joining date is not set, cannot verify minimum service days.',
        );
      }
      const daysServed = today.diff(dayjs(joiningDate), 'day');
      if (daysServed < policy.minimumServiceDays) {
        throw new BadRequestException(
          `This leave type requires a minimum service of ${policy.minimumServiceDays} days.`,
        );
      }
    }

    // Document Requirement
    const rawTotalDays = endDate.diff(startDate, 'day') + 1;
    if (
      policy.documentRequiredAfterDays &&
      rawTotalDays > policy.documentRequiredAfterDays
    ) {
      // Future: require document upload
    }

    // Total Days Calculation (Accounting for weekends/holidays)
    const totalDays = await this.calculateTotalLeaveDays(
      startDate,
      endDate,
      policy,
    );
    if (totalDays === 0) {
      throw new BadRequestException(
        'The selected dates fall on a weekend or public holiday, which do not count as leave days under this policy.',
      );
    }

    // Balance Validation
    const year = today.year();
    const balance = await this.leaveBalanceRepo.findOne({
      where: { employeeId, leaveTypeId: dto.leaveTypeId, year,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
    });

    const accrued = balance ? Number(balance.accrued) : 0;
    const carriedForward = balance ? Number(balance.carriedForward) : 0;
    const used = balance ? Number(balance.used) : 0;

    let availableBalance = accrued + carriedForward - used;

    if (policy.allowNegativeBalance) {
      availableBalance += Number(policy.maxNegativeBalance);
    }

    if (totalDays > availableBalance) {
      throw new BadRequestException(
        `Insufficient leave balance. You are trying to take ${totalDays} days, but only have ${availableBalance} days available.`,
      );
    }

    const leave = this.leaveRepo.create({
      employeeId,
      leaveTypeId: dto.leaveTypeId,
      startDate: dto.startDate,
      endDate: dto.endDate,
      reason: dto.reason,
      status: policy.requiresApproval
        ? LeaveStatusEnum.PENDING
        : LeaveStatusEnum.APPROVED,
      tenantId, // Fixed: tenantId was missing, causing NOT NULL constraint violation
    });

    const saved = await this.leaveRepo.save(leave);

    const employeeName =
      employee.displayName ||
      `${employee.firstName} ${employee.lastName || ''}`.trim() ||
      employee.email;

    // Send confirmation notification to the applicant
    await this.notificationService.createNotification({
      employeeId,
      type: NotificationType.LEAVE,
      title: 'Leave Request Submitted',
      message: `Your leave request from ${dto.startDate} to ${dto.endDate} (${totalDays} days) has been submitted. Status: ${saved.status}.`,
      referenceId: saved.id,
    });

    // Notify managers / HR / Admins with leave approval/read permissions
    await this.notificationService.notifyUsersWithPermission({
      permission: [PermissionEnum.LEAVE_APPROVAL, PermissionEnum.LEAVE_READ],
      title: 'New Leave Application',
      message: `${employeeName} requested leave from ${dto.startDate} to ${dto.endDate} (${totalDays} days). Reason: ${dto.reason || 'Not specified'}.`,
      type: NotificationType.LEAVE,
      referenceId: saved.id,
      excludeEmployeeId: employeeId,
    });

    if (!policy.requiresApproval) {
      await this.reviewLeave(
        saved.id,
        LeaveStatusEnum.APPROVED,
        employeeId,
        'Auto-approved by policy',
      );
      saved.status = LeaveStatusEnum.APPROVED;
    }

    return saved;
  }

  async requestEncashment(
    employeeId: string,
    dto: { leaveTypeId: string; days: number; reason?: string },
  ) {
    if (dto.days <= 0) {
      throw new BadRequestException('Requested days must be greater than 0');
    }

    return this.dataSource.transaction(async (manager) => {
      // 1. Fetch Policy
      const policy = await manager.findOne(LeavePolicy, {
        where: { leaveTypeId: dto.leaveTypeId, isActive: true },
      });

      if (!policy) {
        throw new BadRequestException(
          'Active policy not found for this leave type',
        );
      }

      if (!policy.encashable) {
        throw new BadRequestException(
          'This leave type is not eligible for encashment',
        );
      }

      // 2. Check Balance WITH LOCK
      const year = new Date().getFullYear();
      const balance = await manager.findOne(LeaveBalance, {
        where: { employeeId, leaveTypeId: dto.leaveTypeId, year },
        lock: { mode: 'pessimistic_write' },
      });

      if (!balance) {
        throw new BadRequestException('No leave balance found for this year');
      }

      const remaining =
        Number(balance.accrued) +
        Number(balance.carriedForward) -
        Number(balance.used);

      if (remaining <= 0) {
        throw new BadRequestException(
          'You do not have any available balance to encash.',
        );
      }

      if (remaining < dto.days) {
        throw new BadRequestException(
          `Insufficient balance. You only have ${remaining} days available to encash.`,
        );
      }

      // 3. Process Transaction
      const ledger = await this.leaveEngineService.processTransaction({
        employeeId,
        leaveTypeId: dto.leaveTypeId,
        transactionType: LeaveTransactionType.ENCASHMENT,
        days: dto.days,
        remarks: dto.reason || 'Leave Encashment Requested',
      }, manager);

      // 4. Send Notification
      await this.notificationService.createNotification({
        employeeId,
        type: NotificationType.LEAVE,
        title: 'Leave Encashment',
        message: `Your request to encash ${dto.days} days has been processed and will be added to your next payslip.`,
        referenceId: ledger.id,
      });

      return ledger;
    });
  }

  async getMyLeaves(employeeId: string, status?: string) {
    const qb = this.leaveRepo.createQueryBuilder('leave');

    qb.where('leave.employee_id = :employeeId', {
      employeeId,
    });

    if (status) {
      qb.andWhere('leave.status = :status', {
        status,
      });
    }

    qb.orderBy('leave.created_at', 'DESC');

    return qb.getMany();
  }

  async cancelLeave(id: string, employeeId: string) {
    const leave = await this.leaveRepo.findOne({
      where: {
        id,
        employeeId,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
    });

    if (!leave) {
      throw new NotFoundException('Leave not found');
    }

    if (leave.status !== LeaveStatusEnum.PENDING) {
      throw new BadRequestException('Only pending leave can be cancelled');
    }

    leave.status = LeaveStatusEnum.CANCELLED;
    console.log({
      id,
      employeeId,
    });

    return this.leaveRepo.save(leave);
  }

  async findAll(query: any, currentUser: Employee) {
    const { status, employeeId, page = 1, limit = 10 } = query;

    const qb = this.leaveRepo.createQueryBuilder('leave');

    qb.leftJoinAndSelect('leave.employee', 'employee');

    qb.leftJoinAndSelect('leave.reviewer', 'reviewer');

    if (status) {
      qb.andWhere('leave.status = :status', {
        status,
      });
    }

    if (employeeId) {
      qb.andWhere('leave.employee_id = :employeeId', {
        employeeId,
      });
    }

    this.dataScopeService.applyScope(qb, currentUser, {
      branch: 'employee.branchId',
      department: 'employee.departmentId',
      employee: 'employee.id',
    });

    qb.orderBy('leave.created_at', 'DESC');

    qb.skip((Number(page) - 1) * Number(limit));

    qb.take(Number(limit));

    const [data, total] = await qb.getManyAndCount();

    return {
      data,

      meta: {
        total,

        page: Number(page),

        limit: Number(limit),

        totalPages: Math.ceil(total / Number(limit)),
      },
    };
  }

  async getLeaveReport(startDate?: string, endDate?: string) {
    const qb = this.leaveRepo
      .createQueryBuilder('leave')
      .leftJoinAndSelect('leave.employee', 'employee')
      .leftJoinAndSelect('employee.department', 'department')
      .leftJoinAndSelect('leave.leaveType', 'leaveType');

    if (startDate && endDate) {
      qb.andWhere('leave.start_date >= :startDate', { startDate }).andWhere(
        'leave.start_date <= :endDate',
        { endDate },
      );
    }

    const leaves = await qb.getMany();

    const report = {
      overall: {
        totalRequests: leaves.length,
      },
      byStatus: {} as Record<string, number>,
      byType: {} as Record<string, number>,
      byDepartment: {} as Record<string, number>,
    };

    for (const leave of leaves) {
      // By Status
      report.byStatus[leave.status] = (report.byStatus[leave.status] || 0) + 1;

      // By Type
      const typeName = leave.leaveType?.name || 'Unknown';
      report.byType[typeName] = (report.byType[typeName] || 0) + 1;

      // By Department
      const deptName = leave.employee?.department?.name || 'Unassigned';
      report.byDepartment[deptName] = (report.byDepartment[deptName] || 0) + 1;
    }

    return report;
  }

  async reviewLeave(
    id: string,

    status: LeaveStatusEnum,

    reviewerId: string,

    comment?: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const leave = await manager.findOne(Leave, {
        where: {
          id,
        },
      });

      if (!leave) {
        throw new NotFoundException('Leave not found');
      }

      if (leave.status !== LeaveStatusEnum.PENDING) {
        throw new BadRequestException('Already reviewed');
      }

      const reviewer = await manager.findOne(Employee, {
        where: { id: reviewerId },
        relations: { role: true },
      });

      if (leave.employeeId === reviewerId) {
        if (reviewer?.role?.name !== RoleEnum.SUPER_ADMIN) {
          throw new BadRequestException('You cannot approve your own leave.');
        }
      } else {
        const employee = await manager.findOne(Employee, {
          where: { id: leave.employeeId },
          relations: { role: true },
        });

        if (
          reviewer?.role?.name !== RoleEnum.SUPER_ADMIN &&
          (reviewer?.role?.authorityLevel ?? 0) <= (employee?.role?.authorityLevel ?? 0)
        ) {
          throw new BadRequestException('You must have a higher authority level to review this leave.');
        }
      }

      if (status === LeaveStatusEnum.APPROVED) {
        // TOTAL DAYS (Re-calculated based on policy rules)
        const policy = await manager.findOne(LeavePolicy, {
          where: { leaveTypeId: leave.leaveTypeId, isActive: true },
        });

        let totalDays =
          dayjs(leave.endDate).diff(dayjs(leave.startDate), 'day') + 1;
        if (policy) {
          totalDays = await this.calculateTotalLeaveDays(
            dayjs(leave.startDate),
            dayjs(leave.endDate),
            policy,
          );
        }

        // DEDUCT BALANCE via LeaveEngine
        await this.leaveEngineService.processTransaction({
          employeeId: leave.employeeId,
          leaveTypeId: leave.leaveTypeId,
          transactionType: LeaveTransactionType.LEAVE_TAKEN,
          days: totalDays,
          referenceId: leave.id,
          remarks: `Leave approved by ${reviewerId}`,
        }, manager);

        const systemComment = `Leave taken: ${totalDays} days deducted`;

        leave.reviewComment = comment
          ? `${comment} | ${systemComment}`
          : systemComment;

        await this.createLeaveAttendance(leave);
      }

      if (status === LeaveStatusEnum.REJECTED) {
        leave.reviewComment = comment ?? null;
      }

      // FINAL UPDATE
      leave.status = status;

      leave.reviewedById = reviewerId;

      leave.reviewedAt = new Date();

      const updatedLeave = await manager.save(leave);

      const message =
        status === LeaveStatusEnum.APPROVED
          ? `Your leave request from ${dayjs(leave.startDate).format('MMM D')} to ${dayjs(leave.endDate).format('MMM D')} has been approved.`
          : `Your leave request from ${dayjs(leave.startDate).format('MMM D')} to ${dayjs(leave.endDate).format('MMM D')} has been rejected.`;

      await this.notificationService.createNotification({
        employeeId: leave.employeeId,
        type: NotificationType.LEAVE,
        title: `Leave ${status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()}`,
        message,
        referenceId: leave.id,
      });

      return updatedLeave;
    });
  }

  private async calculateTotalLeaveDays(
    startDate: dayjs.Dayjs,
    endDate: dayjs.Dayjs,
    policy: LeavePolicy,
  ): Promise<number> {
    let totalDays = 0;

    const weekendSettings = await this.weekendRepo.find({ where: { tenantId: this.tenantQueryService.getTenantWhereClause().tenantId } });
    const weekendDays = weekendSettings.map((w) => w.day.toLowerCase());

    const holidays = await this.holidayRepo.find({
      where: {
        date: Between(
          startDate.format('YYYY-MM-DD'),
          endDate.format('YYYY-MM-DD'),
        ),
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
    });
    const holidayDates = holidays.map((h) => h.date);

    for (
      let current = startDate.clone();
      current.isBefore(endDate) || current.isSame(endDate, 'day');
      current = current.add(1, 'day')
    ) {
      const dateStr = current.format('YYYY-MM-DD');
      const dayName = current.format('dddd').toLowerCase();

      const isWeekend = weekendDays.includes(dayName);
      const isHoliday = holidayDates.includes(dateStr);

      if (isWeekend && !policy.countWeekend) continue;
      if (isHoliday && !policy.countHoliday) continue;

      totalDays++;
    }

    return totalDays;
  }

  private async createLeaveAttendance(leave: Leave) {
    const start = dayjs(leave.startDate);

    const end = dayjs(leave.endDate);

    for (
      let current = start;
      current.isBefore(end) || current.isSame(end, 'day');
      current = current.add(1, 'day')
    ) {
      const date = current.format('YYYY-MM-DD');

      const existing = await this.attendanceRepo.findOne({
        where: {
          employeeId: leave.employeeId,

          date,
            tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
        },
      });

      if (existing) {
        continue;
      }

      await this.attendanceRepo.save({
        employeeId: leave.employeeId,

        date,

        status: AttendanceStatus.LEAVE,

        workedMinutes: 0,

        overtimeMinutes: 0,
        
        tenantId: this.tenantQueryService.getTenantWhereClause().tenantId as string,
      });
    }
  }
}
