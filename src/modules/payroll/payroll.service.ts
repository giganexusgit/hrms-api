import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import dayjs from 'dayjs';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository, Between } from 'typeorm';

import { Payroll } from './entities/payroll.entity';

import { Employee } from './../employees/entities/employee.entity';

import { Attendance } from './../attendance/entities/attendance.entity';
import { Leave } from './../attendance/entities/leave.entity';

import { SalaryStructure } from './../salary-structure/entities/salary-structure.entity';
import { LeavePolicy } from '../leave-policy/entities/leave-policy.entity';
import {
  LeaveLedger,
  LeaveTransactionType,
} from '../leave-ledger/entities/leave-ledger.entity';
import { WeekendSetting } from '../weekend_settings/entities/weekend_setting.entity';
import { Holiday } from '../holiday/entities/holiday.entity';
import { AttendanceStatus } from './../../common/enums/AttendanceStatus.enum';
import { SalaryComponentTypeEnum } from '../../common/enums/salary-component-type.enum';
import { CalculationTypeEnum } from '../../common/enums/calculation-type.enum';
import { PercentageBaseEnum } from '../../common/enums/percentage-base.enum';
import { DataScopeService } from './../../common/services/data-scope.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../../common/enums/NotificationType.enum';
import { TenantQueryService } from "../../common/services/tenant-query.service";
import { ClsService } from 'nestjs-cls';
import { TenantExecutionService } from '../../common/services/tenant-execution.service';

@Injectable()
export class PayrollService {
  constructor(
    @InjectRepository(Payroll)
    private readonly payrollRepo: Repository<Payroll>,

    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,

    @InjectRepository(Attendance)
    private readonly attendanceRepo: Repository<Attendance>,

    @InjectRepository(SalaryStructure)
    private readonly salaryRepo: Repository<SalaryStructure>,

    @InjectRepository(Leave)
    private readonly leaveRequestRepo: Repository<Leave>,

    @InjectRepository(LeavePolicy)
    private readonly leavePolicyRepo: Repository<LeavePolicy>,

    @InjectRepository(LeaveLedger)
    private readonly leaveLedgerRepo: Repository<LeaveLedger>,

    @InjectRepository(WeekendSetting)
    private readonly weekendRepo: Repository<WeekendSetting>,

    @InjectRepository(Holiday)
    private readonly holidayRepo: Repository<Holiday>,

    private readonly dataScopeService: DataScopeService,
    private readonly notificationService: NotificationService, 
    private readonly tenantQueryService: TenantQueryService,
    private readonly cls: ClsService,
    private readonly tenantExecutionService: TenantExecutionService,
  ) {}

  // =====================
  // GENERATE PAYROLL
  // =====================

  private roundCurrency(value: number): number {
    return Math.round(value * 100) / 100;
  }

  async generatePayroll(
    employeeId: string,
    month: number,
    year: number,
    options?: {
      bonusAmount?: number;
      bonusReason?: string;
      deductionAmount?: number;
      deductionReason?: string;
    },
    precalculatedWeekends?: WeekendSetting[],
  ) {
    const existing = await this.payrollRepo.findOne({
      where: {
        employeeId,
        month,
        year,
        ...this.tenantQueryService.getTenantWhereClause(),                                     
      },
    });

    if (existing && existing.isPaid) {
      throw new BadRequestException('Payroll already paid and finalized');
    }

    const employee = await this.employeeRepo.findOne({
      where: {
        id: employeeId,
        ...this.tenantQueryService.getTenantWhereClause(),
      },
      relations: { shift: true },
    });

    if (!employee) throw new NotFoundException('Employee not found');

    const salary = await this.salaryRepo.findOne({
      where: {
        employeeId,
        isActive: true,
        ...this.tenantQueryService.getTenantWhereClause(),
      },
      relations: { components: { salaryComponent: true } },
    });

    if (!salary) throw new NotFoundException('Salary structure not found');

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // WORKING DAYS CALCULATION
    const weekends =
      precalculatedWeekends ??
      (await this.weekendRepo.find({ where: { isOff: true,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    } }));

    // HOLIDAYS & LEAVES
    const holidays = await this.holidayRepo.find({
      where: { date: Between(startDate, endDate),
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
    });
    const holidayDates = holidays.map((h) => h.date);
    const weekendDays = weekends.map((w) => w.day.toLowerCase());

    // Calculate for FULL month to get accurate perDaySalary
    const fullMonthWorkingDays = this.calculateWorkingDays(
      year,
      month,
      weekends,
      holidayDates,
      null,
    );
    const actualWorkingDays = this.calculateWorkingDays(
      year,
      month,
      weekends,
      holidayDates,
      employee.joiningDate,
    );
    const preJoinMissedDays = Math.max(
      0,
      fullMonthWorkingDays - actualWorkingDays,
    );
    const effectiveWorkingDays =
      fullMonthWorkingDays > 0 ? fullMonthWorkingDays : lastDay;

    const approvedLeaves = await this.leaveRequestRepo
      .createQueryBuilder('leave')
      .leftJoinAndSelect('leave.leaveType', 'leaveType')
      .where('leave.employeeId = :employeeId', { employeeId })
      .andWhere('leave.status = :status', { status: 'APPROVED' })
      .andWhere(
        '(leave.startDate <= :endDate AND leave.endDate >= :startDate)',
        { startDate, endDate },
      )
      .getMany();

    // ATTENDANCE
    const attendances = await this.attendanceRepo.find({
      where: {
        employeeId,
        date: Between(startDate, endDate),
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
    });

    const presentDays = attendances.filter(
      (item) => item.status === AttendanceStatus.PRESENT,
    ).length;
    const lateDays = attendances.filter(
      (item) => item.status === AttendanceStatus.LATE,
    ).length;
    const halfDays = attendances.filter(
      (item) => item.status === AttendanceStatus.HALF_DAY,
    ).length;

    const absentDays = attendances.filter((item) => {
      if (item.status !== AttendanceStatus.ABSENT) return false;
      const date = new Date(item.date);
      const dateStr = date.toISOString().split('T')[0];
      const dayOfWeekStr = date
        .toLocaleDateString('en-US', { weekday: 'long' })
        .toUpperCase();
      const occurrence = Math.ceil(date.getDate() / 7);
      const occurrenceStr =
        occurrence === 1
          ? 'FIRST'
          : occurrence === 2
            ? 'SECOND'
            : occurrence === 3
              ? 'THIRD'
              : occurrence === 4
                ? 'FOURTH'
                : occurrence === 5
                  ? 'FIFTH'
                  : 'UNKNOWN';
      const isWeekend = weekends.some(
        (w) =>
          w.day === dayOfWeekStr &&
          (w.weekNumber === 'ALL' || w.weekNumber === occurrenceStr),
      );
      if (isWeekend) return false;

      const isHoliday = holidayDates.includes(dateStr);
      if (isHoliday) return false;

      const hasApprovedLeave = approvedLeaves.some((l) => {
        const t = date.getTime();
        return (
          t >= new Date(l.startDate).getTime() &&
          t <= new Date(l.endDate).getTime()
        );
      });
      if (hasApprovedLeave) return false;

      return true;
    }).length;

    const leaveDays = attendances.filter((item) => {
      if (item.status !== AttendanceStatus.LEAVE) return false;
      const date = new Date(item.date);
      const dateStr = date.toISOString().split('T')[0];
      const dayOfWeekStr = date
        .toLocaleDateString('en-US', { weekday: 'long' })
        .toUpperCase();
      const occurrence = Math.ceil(date.getDate() / 7);
      const occurrenceStr =
        occurrence === 1
          ? 'FIRST'
          : occurrence === 2
            ? 'SECOND'
            : occurrence === 3
              ? 'THIRD'
              : occurrence === 4
                ? 'FOURTH'
                : occurrence === 5
                  ? 'FIFTH'
                  : 'UNKNOWN';
      const isWeekend = weekends.some(
        (w) =>
          w.day === dayOfWeekStr &&
          (w.weekNumber === 'ALL' || w.weekNumber === occurrenceStr),
      );
      if (isWeekend) return false;

      const isHoliday = holidayDates.includes(dateStr);
      if (isHoliday) return false;

      return true;
    }).length;

    // LEAVE RECONCILIATION
    let paidLeaves = 0;
    let unpaidLeaves = 0;

    // Variables are declared at the top already

    for (const req of approvedLeaves) {
      // Find overlap days in this month
      const startOverlap = dayjs(
        Math.max(
          new Date(req.startDate).getTime(),
          new Date(startDate).getTime(),
        ),
      );
      const endOverlap = dayjs(
        Math.min(new Date(req.endDate).getTime(), new Date(endDate).getTime()),
      );

      const policy = await this.leavePolicyRepo.findOne({
        where: { leaveTypeId: req.leaveTypeId, isActive: true,
            tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
        },
      });

      let overlapDays = 0;
      if (policy) {
        for (
          let current = startOverlap.clone();
          current.isBefore(endOverlap) || current.isSame(endOverlap, 'day');
          current = current.add(1, 'day')
        ) {
          const dateStr = current.format('YYYY-MM-DD');
          const dayName = current.format('dddd').toLowerCase();

          // NOTE: for advanced week occurrence logic this could be improved, but this matches leave.service logic
          const isWeekend = weekendDays.includes(dayName);
          const isHoliday = holidayDates.includes(dateStr);

          if (isWeekend && !policy.countWeekend) continue;
          if (isHoliday && !policy.countHoliday) continue;

          overlapDays++;
        }
      }

      if (policy && policy.isPaid) {
        paidLeaves += overlapDays;
      } else {
        unpaidLeaves += overlapDays;
      }
    }

    // UNIFIED RECONCILIATION FORMULA
    const totalAttendanceMissing = absentDays + leaveDays + halfDays * 0.5;
    const totalApprovedLeaves = paidLeaves + unpaidLeaves;
    const unapprovedMissingDays = Math.max(
      0,
      totalAttendanceMissing - totalApprovedLeaves,
    );

    // DYNAMIC PRORATION LOGIC
    const earnedDays = Math.max(
      0,
      effectiveWorkingDays -
        preJoinMissedDays -
        unapprovedMissingDays -
        unpaidLeaves,
    );
    const prorationFactor =
      effectiveWorkingDays > 0 ? earnedDays / effectiveWorkingDays : 0;

    const proratedBasic = this.roundCurrency(
      Number(salary.basicSalary) * prorationFactor,
    );
    let proratedGross = proratedBasic;

    const componentsData: any[] = [];

    // Process Earnings
    const earningComps =
      salary.components?.filter(
        (c) => c.salaryComponent?.type === SalaryComponentTypeEnum.EARNING,
      ) || [];
    for (const c of earningComps) {
      let amount = Number(c.calculatedAmount);
      if (
        c.calculationType === CalculationTypeEnum.FIXED_AMOUNT &&
        c.salaryComponent?.isProratable
      ) {
        amount = this.roundCurrency(amount * prorationFactor);
      }
      proratedGross += amount;
      componentsData.push({
        componentId: c.salaryComponentId,
        componentCode: c.salaryComponent?.code || null,
        componentName: c.componentName,
        type: SalaryComponentTypeEnum.EARNING,
        calculationType: c.calculationType,
        percentageValue: c.percentageValue ? Number(c.percentageValue) : null,
        amount,
      });
    }

    // Process Deductions
    let proratedDeductions = 0;
    const deductionComps =
      salary.components?.filter(
        (c) => c.salaryComponent?.type === SalaryComponentTypeEnum.DEDUCTION,
      ) || [];
    for (const c of deductionComps) {
      let amount = Number(c.calculatedAmount);
      if (c.calculationType === CalculationTypeEnum.PERCENTAGE) {
        const baseAmount =
          c.salaryComponent?.percentageBase === PercentageBaseEnum.GROSS
            ? proratedGross
            : proratedBasic;
        amount = this.roundCurrency(
          baseAmount * (Number(c.percentageValue) / 100),
        );
      } else if (
        c.calculationType === CalculationTypeEnum.FIXED_AMOUNT &&
        c.salaryComponent?.isProratable
      ) {
        amount = this.roundCurrency(amount * prorationFactor);
      }
      proratedDeductions += amount;
      componentsData.push({
        componentId: c.salaryComponentId,
        componentCode: c.salaryComponent?.code || null,
        componentName: c.componentName,
        type: SalaryComponentTypeEnum.DEDUCTION,
        calculationType: c.calculationType,
        percentageValue: c.percentageValue ? Number(c.percentageValue) : null,
        amount,
      });
    }

    // Per day calculations based on FULL Basic Salary (used for overtime/late rate)
    const perDaySalary = this.roundCurrency(
      Number(salary.basicSalary) / effectiveWorkingDays,
    );
    const shiftMinutes = employee.shift?.standardWorkingMinutes || 480;
    const perHourSalary = this.roundCurrency(
      perDaySalary / (shiftMinutes / 60),
    );

    // Audit metrics (tracking the "missing" amounts)
    const preJoinDeduction = this.roundCurrency(
      preJoinMissedDays * perDaySalary,
    );

    // ENCASHMENT RECONCILIATION
    const encashments = await this.leaveLedgerRepo.find({
      where: {
        employeeId,
        transactionType: LeaveTransactionType.ENCASHMENT,
        createdAt: Between(
          new Date(startDate + 'T00:00:00Z'),
          new Date(endDate + 'T23:59:59Z'),
        ),
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
    });

    const encashedDays = encashments.reduce(
      (sum, e) => sum + Number(e.days),
      0,
    );
    const encashmentAmount = this.roundCurrency(encashedDays * perDaySalary);

    // Allocate deductions gracefully for audit
    let remainingUnapproved = unapprovedMissingDays;

    const allocatedHalfDays = Math.min(remainingUnapproved, halfDays * 0.5);
    const halfDayDeduction = this.roundCurrency(
      allocatedHalfDays * perDaySalary,
    );
    remainingUnapproved -= allocatedHalfDays;

    const absentDeduction = this.roundCurrency(
      remainingUnapproved * perDaySalary,
    );
    const leaveDeduction = this.roundCurrency(unpaidLeaves * perDaySalary);

    // OVERTIME
    const overtimeMinutes = attendances.reduce(
      (acc, curr) => acc + (curr.overtimeMinutes ?? 0),
      0,
    );
    const overtimeHours = this.roundCurrency(overtimeMinutes / 60);
    const overtimeAmount = this.roundCurrency(overtimeHours * perHourSalary);

    // LATE DEDUCTION (Per Minute)
    const lateMinutes = attendances
      .filter((item) => item.status !== AttendanceStatus.HALF_DAY)
      .reduce((acc, curr) => acc + (curr.lateMinutes ?? 0), 0);
    const lateHours = this.roundCurrency(lateMinutes / 60);
    const lateDeduction = this.roundCurrency(lateHours * perHourSalary);

    // OVERRIDES
    const bonusAmount = this.roundCurrency(
      options?.bonusAmount ? Number(options.bonusAmount) : 0,
    );
    const bonusReason = options?.bonusReason || null;
    const deductionAmount = this.roundCurrency(
      options?.deductionAmount ? Number(options.deductionAmount) : 0,
    );
    const deductionReason = options?.deductionReason || null;

    const finalSalary = this.roundCurrency(
      proratedGross -
        proratedDeductions +
        overtimeAmount +
        bonusAmount -
        deductionAmount +
        encashmentAmount -
        lateDeduction,
    );

    // SAVE / RECALCULATE
    const payroll = await this.payrollRepo.save({
      ...(existing ? { id: existing.id } : {}),
      employeeId,
      tenantId: this.tenantQueryService.getTenantWhereClause().tenantId,

      month,

      year,

      grossSalary: proratedGross,
      netSalary: this.roundCurrency(proratedGross - proratedDeductions),

      baseBasicSalary: salary.basicSalary ? Number(salary.basicSalary) : 0,

      presentDays,

      lateDays,
      halfDays,
      absentDays,
      paidLeaves,
      unpaidLeaves,
      absentDeduction,
      halfDayDeduction,
      leaveDeduction,
      lateDeduction,
      overtimeAmount,
      bonusAmount,
      bonusReason,
      deductionAmount,
      deductionReason,
      encashmentAmount,
      finalSalary,
      componentsData,
    });

    const monthNames = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    await this.notificationService.createNotification({
      employeeId: payroll.employeeId,
      type: NotificationType.PAYROLL,
      title: `Payslip Generated`,
      message: `Your payslip for ${monthNames[month - 1]} ${year} has been generated. Net Salary: ₹${finalSalary}`,
      referenceId: payroll.id,
    });

    return {
      id: payroll.id,
      employeeId: payroll.employeeId,
      month: payroll.month,
      year: payroll.year,

      basicSalary: Number(proratedBasic),
      totalEarnings: Number(proratedGross),
      totalDeductions: Number(proratedDeductions),

      grossSalary: Number(payroll.grossSalary),
      finalSalary: Number(payroll.finalSalary),

      attendance: {
        presentDays: payroll.presentDays,
        absentDays: payroll.absentDays,
        halfDays: payroll.halfDays,
        lateDays: payroll.lateDays,
        paidLeaves: payroll.paidLeaves,
        unpaidLeaves: payroll.unpaidLeaves,
      },

      deductions: {
        absent: Number(payroll.absentDeduction),
        halfDay: Number(payroll.halfDayDeduction),
        leave: Number(payroll.leaveDeduction),
        late: Number(payroll.lateDeduction),
        other: Number(payroll.deductionAmount),
      },

      additions: {
        overtime: Number(payroll.overtimeAmount),
        bonus: Number(payroll.bonusAmount),
        encashment: Number(payroll.encashmentAmount),
      },

      components: payroll.componentsData || [],

      isPaid: payroll.isPaid,
      paidAt: payroll.paidAt,
      createdAt: payroll.createdAt,
    };
  }

  async getMyPayroll(employeeId: string) {
    const data = await this.payrollRepo.find({
      where: {
        employeeId,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },

      order: {
        year: 'DESC',

        month: 'DESC',
      },
    });

    return {
      data,
      total: data.length,
    };
  }

  async findAll(query: any, currentUser: Employee) {
    const {
      month,
      year,
      employeeId,

      page = 1,
      limit = 10,
    } = query;

    const parsedPage = Math.max(1, isNaN(Number(page)) ? 1 : Number(page));
    const parsedLimit = Math.max(1, isNaN(Number(limit)) ? 10 : Number(limit));

    const qb = this.payrollRepo.createQueryBuilder('payroll');

    qb.leftJoinAndSelect('payroll.employee', 'employee');

    if (employeeId) {
      qb.andWhere(
        `
      payroll.employee_id = :employeeId
      `,
        {
          employeeId,
        },
      );
    }

    if (month) {
      qb.andWhere(
        `
      payroll.month = :month
      `,
        {
          month: Number(month),
        },
      );
    }

    if (year) {
      qb.andWhere(
        `
      payroll.year = :year
      `,
        {
          year: Number(year),
        },
      );
    }

    this.tenantQueryService.applyTenantFilter(qb, 'payroll');

    this.dataScopeService.applyScope(qb, currentUser, {
      branch: 'employee.branchId',
      department: 'employee.departmentId',
      employee: 'employee.id',
    });

    qb.orderBy('payroll.createdAt', 'DESC');

    qb.skip((parsedPage - 1) * parsedLimit);

    qb.take(parsedLimit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,

      meta: {
        total,

        page: parsedPage,

        limit: parsedLimit,

        totalPages: Math.ceil(total / parsedLimit),
      },
    };
  }

  async markAsPaid(id: string) {
    const payroll = await this.payrollRepo.findOne({
      where: {
        id,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
    });

    if (!payroll) {
      throw new NotFoundException('Payroll not found');
    }

    if (payroll.isPaid) {
      throw new BadRequestException('Payroll already paid');
    }

    payroll.isPaid = true;

    payroll.paidAt = new Date();

    await this.payrollRepo.save(payroll);

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];

    await this.notificationService.createNotification({
      employeeId: payroll.employeeId,
      type: NotificationType.PAYROLL,
      title: 'Salary Disbursed',
      message: `Your salary for ${monthNames[payroll.month - 1]} ${payroll.year} has been disbursed and marked as paid.`,
      referenceId: payroll.id,
    });

    return payroll;
  }

  async payAll(month: number, year: number) {
    const payrolls = await this.payrollRepo.find({
      where: { month, year, isPaid: false,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
    });

    if (payrolls.length === 0) {
      return {
        message: 'No unpaid payrolls found for the specified month and year',
        paidCount: 0,
      };
    }

    const paidAt = new Date();
    payrolls.forEach((p) => {
      p.isPaid = true;
      p.paidAt = paidAt;
    });

    await this.payrollRepo.save(payrolls);

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];

    for (const p of payrolls) {
      await this.notificationService.createNotification({
        employeeId: p.employeeId,
        type: NotificationType.PAYROLL,
        title: 'Salary Disbursed',
        message: `Your salary for ${monthNames[p.month - 1]} ${p.year} has been disbursed and marked as paid.`,
        referenceId: p.id,
      });
    }

    return {
      message: `Successfully marked ${payrolls.length} payroll(s) as paid`,
      paidCount: payrolls.length,
    };
  }

  async generateAllPayroll(month: number, year: number) {
    const employees = await this.employeeRepo.find({
      where: { isActive: true,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
      select: { id: true },
    });

    const weekends = await this.weekendRepo.find({ where: { isOff: true,
        tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    } });

    let generated = 0;
    let skipped = 0;
    let failed = 0;
    const errors: { employeeId: string; reason: string }[] = [];

    // Batch process 50 at a time
    const batchSize = 50;
    for (let i = 0; i < employees.length; i += batchSize) {
      const batch = employees.slice(i, i + batchSize);

      const promises = batch.map(async (employee) => {
        try {
          await this.generatePayroll(
            employee.id,
            month,
            year,
            undefined,
            weekends,
          );
          generated++;
        } catch (error: any) {
          if (
            error.message?.includes('already paid') ||
            error.message?.includes('already generated')
          ) {
            skipped++;
          } else {
            failed++;
            errors.push({ employeeId: employee.id, reason: error.message });
          }
        }
      });

      await Promise.allSettled(promises);
    }

    return {
      month,
      year,
      totalEmployees: employees.length,
      generated,
      skipped,
      failed,
      errors,
    };
  }

  @Cron('59 23 28-31 * *', { timeZone: 'Asia/Kolkata' })
  async handleCronGenerateAllPayroll() {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    // If tomorrow is the 1st, then today is the last day of the month
    if (tomorrow.getDate() === 1) {
      const month = today.getMonth() + 1;
      const year = today.getFullYear();
      
      await this.tenantExecutionService.forEachActiveTenant('Monthly Payroll Generation', async () => {
        await this.generateAllPayroll(month, year);
      });
    }
  }

  private calculateWorkingDays(
    year: number,
    month: number,
    weekends: WeekendSetting[],
    holidayDates: string[],
    joiningDate?: Date | null,
  ) {
    const lastDay = new Date(year, month, 0).getDate();

    let startDay = 1;
    if (joiningDate) {
      const jDate = new Date(joiningDate);
      if (jDate.getFullYear() === year && jDate.getMonth() + 1 === month) {
        startDay = jDate.getDate();
      } else if (
        jDate.getFullYear() > year ||
        (jDate.getFullYear() === year && jDate.getMonth() + 1 > month)
      ) {
        return 0; // Joined after this month
      }
    }

    let workingDays = 0;

    for (let day = startDay; day <= lastDay; day++) {
      const date = new Date(year, month - 1, day);
      const dayOfWeekStr = date
        .toLocaleDateString('en-US', { weekday: 'long' })
        .toUpperCase();
      const dateStr = date.toISOString().split('T')[0];

      const occurrence = Math.ceil(day / 7);
      const occurrenceStr =
        occurrence === 1
          ? 'FIRST'
          : occurrence === 2
            ? 'SECOND'
            : occurrence === 3
              ? 'THIRD'
              : occurrence === 4
                ? 'FOURTH'
                : occurrence === 5
                  ? 'FIFTH'
                  : 'UNKNOWN';

      const isWeekend = weekends.some(
        (w) =>
          w.day === dayOfWeekStr &&
          (w.weekNumber === 'ALL' || w.weekNumber === occurrenceStr),
      );
      const isHoliday = holidayDates.includes(dateStr);

      if (!isWeekend && !isHoliday) {
        workingDays++;
      }
    }

    return workingDays;
  }
}
