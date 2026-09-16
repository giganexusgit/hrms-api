import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository, Between, IsNull, MoreThanOrEqual } from 'typeorm';

import dayjs from 'dayjs';

import { Employee } from '../employees/entities/employee.entity';

import { Department } from '../departments/entities/department.entity';

import { Attendance } from '../attendance/entities/attendance.entity';

import { Leave } from '../attendance/entities/leave.entity';

import { CandidateApplication } from '../interview/entities/candidate-application.entity';

import { Course } from '../training/entities/course.entity';

import { Payroll } from '../payroll/entities/payroll.entity';
import { LeaveBalance } from '../leave-balance/entities/leave-balance.entity';
import { Holiday } from '../holiday/entities/holiday.entity';

import { CandidateStatusEnum } from '../../common/enums/candidate-status.enum';

import { AttendanceStatus } from '../../common/enums/AttendanceStatus.enum';

import { LeaveStatusEnum } from '../../common/enums/leave-status.enum';

import { todayIST } from '../../utils/time.util';
import { DataScopeService } from '../../common/services/data-scope.service';
import { DataScopeEnum } from '../../common/enums/data-scope.enum';
import { TenantQueryService } from "../../common/services/tenant-query.service";

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,

    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,

    @InjectRepository(Attendance)
    private readonly attendanceRepo: Repository<Attendance>,

    @InjectRepository(Leave)
    private readonly leaveRepo: Repository<Leave>,

    @InjectRepository(CandidateApplication)
    private readonly applicationRepo: Repository<CandidateApplication>,

    @InjectRepository(Course)
    private readonly trainingRepo: Repository<Course>,

    @InjectRepository(Payroll)
    private readonly payrollRepo: Repository<Payroll>,

    @InjectRepository(LeaveBalance)
    private readonly leaveBalanceRepo: Repository<LeaveBalance>,

    @InjectRepository(Holiday)
    private readonly holidayRepo: Repository<Holiday>,

    private readonly dataScopeService: DataScopeService,

    @Inject(CACHE_MANAGER) private cacheManager: Cache, private readonly tenantQueryService: TenantQueryService
  ) {}

  async getSuperAdminDashboard(currentUser: any) {
    const cacheKey = `tenant:${currentUser.tenantId}:dashboard:super_admin`;
    const cachedData = await this.cacheManager.get(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    // Use tenant filters for raw repository calls
    const tenantWhere = { tenantId: currentUser.tenantId };

    const [
      totalEmployees,
      activeEmployees,
      departments,
      pendingInterviews,
      selectedCandidates,
      trainings,
      todayAttendance,
      weeklyAttendance,
      monthlyAttendance,
      allLeaves,
      pendingLeaves,
      approvedLeaves,
      upcomingHolidays,
      currentMonthPayrolls,
    ] = await Promise.all([
      this.employeeRepo.count({ where: tenantWhere }),

      this.employeeRepo.count({
        where: {
          ...tenantWhere,
          isActive: true,
            tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
        },
      }),

      this.departmentRepo.count({ where: tenantWhere }),

      this.applicationRepo.count({
        where: {
          ...tenantWhere,
          status: CandidateStatusEnum.INTERVIEW_SCHEDULED,
            tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
        },
      }),

      this.applicationRepo.count({
        where: {
          ...tenantWhere,
          status: CandidateStatusEnum.SELECTED,
            tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
        },
      }),

      this.trainingRepo.count({ where: tenantWhere }),

      this.attendanceRepo.find({
        where: {
          ...tenantWhere,
          date: todayIST(),
            tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
        },
      }),

      this.getWeeklyAttendance({
        ...currentUser,
        role: { dataScope: DataScopeEnum.ORGANIZATION },
      }),

      this.getMonthlyAttendance({
        ...currentUser,
        role: { dataScope: DataScopeEnum.ORGANIZATION },
      }),

      this.leaveRepo.count({ where: tenantWhere }),

      this.leaveRepo.count({
        where: {
          ...tenantWhere,
          status: LeaveStatusEnum.PENDING,
            tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
        },
      }),

      this.leaveRepo.count({
        where: {
          ...tenantWhere,
          status: LeaveStatusEnum.APPROVED,
            tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
        },
      }),

      this.holidayRepo.find({
        where: { date: MoreThanOrEqual(todayIST()),
            tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
        },
        order: { date: 'ASC' },
        take: 5,
      }),

      this.payrollRepo.find({
        where: { ...tenantWhere, month: dayjs().month() + 1, year: dayjs().year(),
            tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
        },
      }),
    ]);

    const totalPayrollCost = currentMonthPayrolls.reduce(
      (sum, p) => sum + Number(p.netSalary),
      0,
    );

    const todayAttendanceStats = this.calculateAttendanceStats(todayAttendance);

    const result = {
      employees: {
        total: totalEmployees,
        active: activeEmployees,
        inactive: totalEmployees - activeEmployees,
      },

      departments,

      recruitment: {
        pendingInterviews,
        selectedCandidates,
      },

      trainings,

      attendance: {
        today: todayAttendanceStats,
        weekly: weeklyAttendance,
        monthly: monthlyAttendance,
      },

      leaves: {
        total: allLeaves,
        pending: pendingLeaves,
        approved: approvedLeaves,
        rejected: await this.leaveRepo.count({
          where: {
            status: LeaveStatusEnum.REJECTED,
              tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
        },
        }),
      },

      holidays: {
        upcoming: upcomingHolidays,
      },

      payroll: {
        totalCurrentMonth: totalPayrollCost,
      },
    };

    await this.cacheManager.set(cacheKey, result);
    return result;
  }

  async getHrDashboard(currentUser: any) {
    const cacheKey = `tenant:${currentUser.tenantId}:dashboard:hr:${currentUser.id}`;
    const cachedData = await this.cacheManager.get(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    // 1. Employee Count
    const employeeQb = this.employeeRepo.createQueryBuilder('employee');
    this.tenantQueryService.applyTenantFilter(employeeQb, 'employee');
    this.dataScopeService.applyScope(employeeQb, currentUser, {
      branch: 'employee.branchId',
      department: 'employee.departmentId',
    });
    const totalEmployeesPromise = employeeQb.getCount();

    // 2. Application Counts
    const getAppCount = (status: CandidateStatusEnum) => {
      const qb = this.applicationRepo
        .createQueryBuilder('application')
        .innerJoin('application.job', 'job')
        .where('application.status = :status', { status });
      this.tenantQueryService.applyTenantFilter(qb, 'application');
      this.dataScopeService.applyScope(qb, currentUser, {
        branch: 'job.branchId',
        department: 'job.departmentId',
      });
      return qb.getCount();
    };

    const pendingCandidatesPromise = getAppCount(CandidateStatusEnum.APPLIED);
    const selectedCandidatesPromise = getAppCount(CandidateStatusEnum.SELECTED);
    const rejectedCandidatesPromise = getAppCount(CandidateStatusEnum.REJECTED);
    const scheduledInterviewsPromise = getAppCount(
      CandidateStatusEnum.INTERVIEW_SCHEDULED,
    );

    // 3. Today Attendance
    const todayAttendanceQb = this.attendanceRepo
      .createQueryBuilder('attendance')
      .leftJoinAndSelect('attendance.employee', 'employee')
      .leftJoinAndSelect('employee.department', 'department')
      .where('attendance.date = :today', { today: todayIST() });
    this.tenantQueryService.applyTenantFilter(todayAttendanceQb, 'attendance');
    this.dataScopeService.applyScope(todayAttendanceQb, currentUser, {
      branch: 'employee.branchId',
      department: 'employee.departmentId',
    });
    const todayAttendancePromise = todayAttendanceQb.getMany();

    // 4. Payrolls
    const payrollQb = this.payrollRepo
      .createQueryBuilder('payroll')
      .innerJoin('payroll.employee', 'employee')
      .where('payroll.month = :month', { month: dayjs().month() + 1 })
      .andWhere('payroll.year = :year', { year: dayjs().year() });
    this.tenantQueryService.applyTenantFilter(payrollQb, 'payroll');
    this.dataScopeService.applyScope(payrollQb, currentUser, {
      branch: 'employee.branchId',
      department: 'employee.departmentId',
    });
    const currentMonthPayrollsPromise = payrollQb.getMany();

    const [
      totalEmployees,
      pendingCandidates,
      selectedCandidates,
      rejectedCandidates,
      scheduledInterviews,
      todayAttendance,
      weeklyAttendance,
      monthlyAttendance,
      departmentWiseAttendance,
      leaveStats,
      upcomingHolidays,
      currentMonthPayrolls,
    ] = await Promise.all([
      totalEmployeesPromise,
      pendingCandidatesPromise,
      selectedCandidatesPromise,
      rejectedCandidatesPromise,
      scheduledInterviewsPromise,
      todayAttendancePromise,
      this.getWeeklyAttendance(currentUser),
      this.getMonthlyAttendance(currentUser),
      this.getDepartmentWiseAttendance(currentUser),
      this.getLeaveStats(currentUser),
      this.holidayRepo.find({
        where: { date: MoreThanOrEqual(todayIST()),
            tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
        },
        order: { date: 'ASC' },
        take: 5,
      }), // Holidays remain global
      currentMonthPayrollsPromise,
    ]);

    const totalPayrollCost = currentMonthPayrolls.reduce(
      (sum, p) => sum + Number(p.netSalary),
      0,
    );

    const todayAttendanceStats = this.calculateAttendanceStats(todayAttendance);

    const result = {
      recruitment: {
        totalEmployees,
        pendingCandidates,
        selectedCandidates,
        rejectedCandidates,
        scheduledInterviews,
      },

      attendance: {
        today: {
          ...todayAttendanceStats,
          attendanceRate: totalEmployees
            ? Number(
                ((todayAttendance.length / totalEmployees) * 100).toFixed(2),
              )
            : 0,
        },
        weekly: weeklyAttendance,
        monthly: monthlyAttendance,
        byDepartment: departmentWiseAttendance,
      },

      leaves: leaveStats,

      holidays: {
        upcoming: upcomingHolidays,
      },

      payroll: {
        totalCurrentMonth: totalPayrollCost,
      },
    };

    await this.cacheManager.set(cacheKey, result);
    return result;
  }

  async getEmployeeDashboard(employeeId: string) {
    const employee = await this.employeeRepo.findOne({
      where: {
        id: employeeId,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
      relations: {
        department: true,
        designation: true,
      },
    });

    if (!employee) {
      return null;
    }

    const [
      todayAttendance,
      weeklyAttendance,
      monthlyAttendance,
      leaveBalance,
      pendingLeaves,
      approvedLeaves,
      rejectedLeaves,
      upcomingHolidays,
      latestPayroll,
    ] = await Promise.all([
      this.attendanceRepo.findOne({
        where: {
          employeeId,
          date: todayIST(),
            tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
        },
      }),

      this.getEmployeeWeeklyAttendance(employeeId),

      this.getEmployeeMonthlyAttendance(employeeId),

      this.getLeaveBalance(employeeId),

      this.leaveRepo.count({
        where: {
          employeeId,
          status: LeaveStatusEnum.PENDING,
            tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
        },
      }),

      this.leaveRepo.count({
        where: {
          employeeId,
          status: LeaveStatusEnum.APPROVED,
            tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
        },
      }),

      this.leaveRepo.count({
        where: {
          employeeId,
          status: LeaveStatusEnum.REJECTED,
            tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
        },
      }),

      this.holidayRepo.find({
        where: { date: MoreThanOrEqual(todayIST()),
            tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
        },
        order: { date: 'ASC' },
        take: 5,
      }),

      this.payrollRepo.findOne({
        where: { employeeId,
            tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
        },
        order: { year: 'DESC', month: 'DESC' },
      }),
    ]);

    return {
      employee: {
        name: `${employee.firstName} ${employee.lastName}`,
        firstName: employee.firstName,
        lastName: employee.lastName,
        middleName: employee.middleName,
        displayName: employee.displayName,
        profilePhoto: employee.profilePhoto,
        employeeCode: employee.employeeCode,
        department: employee.department?.name,
        designation: employee.designation?.name,
        isActive: employee.isActive,
      },

      attendance: {
        today: todayAttendance
          ? {
              status: todayAttendance.status,
              checkIn: todayAttendance.checkIn,
              checkOut: todayAttendance.checkOut,
              workedMinutes: todayAttendance.workedMinutes,
              workedHours: Number(
                (todayAttendance.workedMinutes / 60).toFixed(2),
              ),
            }
          : null,
        weekly: weeklyAttendance,
        monthly: monthlyAttendance,
      },

      leaves: {
        leaveBalance,
        pending: pendingLeaves,
        approved: approvedLeaves,
        rejected: rejectedLeaves,
      },

      holidays: {
        upcoming: upcomingHolidays,
      },

      payroll: {
        latest: latestPayroll,
      },
    };
  }

  // ============================================
  // HELPER METHODS FOR ATTENDANCE CALCULATIONS
  // ============================================

  private calculateAttendanceStats(attendanceRecords: Attendance[]) {
    const stats = {
      total: attendanceRecords.length,
      present: 0,
      late: 0,
      halfDay: 0,
      leave: 0,
      absent: 0,
      holiday: 0,
      weekend: 0,
    };

    attendanceRecords.forEach((record) => {
      switch (record.status) {
        case AttendanceStatus.PRESENT:
          stats.present++;
          break;
        case AttendanceStatus.LATE:
          stats.late++;
          break;
        case AttendanceStatus.HALF_DAY:
          stats.halfDay++;
          break;
        case AttendanceStatus.LEAVE:
          stats.leave++;
          break;
        case AttendanceStatus.ABSENT:
          stats.absent++;
          break;
        case AttendanceStatus.HOLIDAY:
          stats.holiday++;
          break;
        case AttendanceStatus.WEEKEND:
          stats.weekend++;
          break;
      }
    });

    return stats;
  }

  private async getWeeklyAttendance(currentUser: any) {
    const startOfWeek = dayjs().startOf('week').format('YYYY-MM-DD');
    const endOfWeek = dayjs().endOf('week').format('YYYY-MM-DD');

    const qb = this.attendanceRepo
      .createQueryBuilder('attendance')
      .select('attendance.status', 'status')
      .addSelect('COUNT(attendance.id)', 'count')
      .leftJoin('attendance.employee', 'employee')
      .where('attendance.date BETWEEN :start AND :end', {
        start: startOfWeek,
        end: endOfWeek,
      })
      .groupBy('attendance.status');

    this.tenantQueryService.applyTenantFilter(qb, 'attendance');
    this.dataScopeService.applyScope(qb, currentUser, {
      branch: 'employee.branchId',
      department: 'employee.departmentId',
    });

    const rawStats = await qb.getRawMany();

    // Map raw SQL results to the expected stats format
    const stats = {
      total: 0,
      present: 0,
      late: 0,
      halfDay: 0,
      leave: 0,
      absent: 0,
      holiday: 0,
      weekend: 0,
    };
    rawStats.forEach((row) => {
      const count = Number(row.count);
      stats.total += count;
      switch (row.status) {
        case AttendanceStatus.PRESENT:
          stats.present = count;
          break;
        case AttendanceStatus.LATE:
          stats.late = count;
          break;
        case AttendanceStatus.HALF_DAY:
          stats.halfDay = count;
          break;
        case AttendanceStatus.LEAVE:
          stats.leave = count;
          break;
        case AttendanceStatus.ABSENT:
          stats.absent = count;
          break;
        case AttendanceStatus.HOLIDAY:
          stats.holiday = count;
          break;
        case AttendanceStatus.WEEKEND:
          stats.weekend = count;
          break;
      }
    });

    return {
      period: `${startOfWeek} to ${endOfWeek}`,
      ...stats,
    };
  }

  private async getMonthlyAttendance(currentUser: any) {
    const startOfMonth = dayjs().startOf('month').format('YYYY-MM-DD');
    const endOfMonth = dayjs().endOf('month').format('YYYY-MM-DD');

    const qb = this.attendanceRepo
      .createQueryBuilder('attendance')
      .select('attendance.status', 'status')
      .addSelect('COUNT(attendance.id)', 'count')
      .leftJoin('attendance.employee', 'employee')
      .where('attendance.date BETWEEN :start AND :end', {
        start: startOfMonth,
        end: endOfMonth,
      })
      .groupBy('attendance.status');

    this.tenantQueryService.applyTenantFilter(qb, 'attendance');
    this.dataScopeService.applyScope(qb, currentUser, {
      branch: 'employee.branchId',
      department: 'employee.departmentId',
    });

    const rawStats = await qb.getRawMany();

    const stats = {
      total: 0,
      present: 0,
      late: 0,
      halfDay: 0,
      leave: 0,
      absent: 0,
      holiday: 0,
      weekend: 0,
    };
    rawStats.forEach((row) => {
      const count = Number(row.count);
      stats.total += count;
      switch (row.status) {
        case AttendanceStatus.PRESENT:
          stats.present = count;
          break;
        case AttendanceStatus.LATE:
          stats.late = count;
          break;
        case AttendanceStatus.HALF_DAY:
          stats.halfDay = count;
          break;
        case AttendanceStatus.LEAVE:
          stats.leave = count;
          break;
        case AttendanceStatus.ABSENT:
          stats.absent = count;
          break;
        case AttendanceStatus.HOLIDAY:
          stats.holiday = count;
          break;
        case AttendanceStatus.WEEKEND:
          stats.weekend = count;
          break;
      }
    });

    return {
      period: dayjs().format('MMMM YYYY'),
      ...stats,
    };
  }

  private async getDepartmentWiseAttendance(currentUser: any) {
    const today = todayIST();
    const departments = await this.departmentRepo.find({ where: { tenantId: this.tenantQueryService.getTenantWhereClause().tenantId } });

    const qb = this.attendanceRepo
      .createQueryBuilder('attendance')
      .select('employee.departmentId', 'departmentId')
      .addSelect('attendance.status', 'status')
      .addSelect('COUNT(attendance.id)', 'count')
      .leftJoin('attendance.employee', 'employee')
      .where('attendance.date = :today', { today })
      .groupBy('employee.departmentId')
      .addGroupBy('attendance.status');

    this.tenantQueryService.applyTenantFilter(qb, 'attendance');
    this.dataScopeService.applyScope(qb, currentUser, {
      branch: 'employee.branchId',
      department: 'employee.departmentId',
    });

    const rawStats = await qb.getRawMany();

    const departmentStats = departments.map((dept) => {
      const deptStats = rawStats.filter((r) => r.departmentId === dept.id);

      const stats = {
        total: 0,
        present: 0,
        late: 0,
        halfDay: 0,
        leave: 0,
        absent: 0,
        holiday: 0,
        weekend: 0,
      };

      deptStats.forEach((row) => {
        const count = Number(row.count);
        stats.total += count;
        switch (row.status) {
          case AttendanceStatus.PRESENT:
            stats.present = count;
            break;
          case AttendanceStatus.LATE:
            stats.late = count;
            break;
          case AttendanceStatus.HALF_DAY:
            stats.halfDay = count;
            break;
          case AttendanceStatus.LEAVE:
            stats.leave = count;
            break;
          case AttendanceStatus.ABSENT:
            stats.absent = count;
            break;
          case AttendanceStatus.HOLIDAY:
            stats.holiday = count;
            break;
          case AttendanceStatus.WEEKEND:
            stats.weekend = count;
            break;
        }
      });

      return {
        departmentId: dept.id,
        departmentName: dept.name,
        ...stats,
      };
    });

    return departmentStats;
  }

  private async getLeaveStats(currentUser: any) {
    const getCount = (status: LeaveStatusEnum) => {
      const qb = this.leaveRepo
        .createQueryBuilder('leave')
        .leftJoin('leave.employee', 'employee')
        .where('leave.status = :status', { status });
      this.tenantQueryService.applyTenantFilter(qb, 'leave');
      this.dataScopeService.applyScope(qb, currentUser, {
        branch: 'employee.branchId',
        department: 'employee.departmentId',
      });
      return qb.getCount();
    };

    const [pending, approved, rejected, cancelled] = await Promise.all([
      getCount(LeaveStatusEnum.PENDING),
      getCount(LeaveStatusEnum.APPROVED),
      getCount(LeaveStatusEnum.REJECTED),
      getCount(LeaveStatusEnum.CANCELLED),
    ]);

    const today = todayIST();
    const upcomingQb = this.leaveRepo
      .createQueryBuilder('leave')
      .leftJoin('leave.employee', 'employee')
      .where('leave.status = :status', { status: LeaveStatusEnum.APPROVED })
      .andWhere('leave.startDate = :date', {
        date: dayjs(today).add(1, 'day').format('YYYY-MM-DD'),
      });

    this.tenantQueryService.applyTenantFilter(upcomingQb, 'leave');
    this.dataScopeService.applyScope(upcomingQb, currentUser, {
      branch: 'employee.branchId',
      department: 'employee.departmentId',
    });

    const upcomingLeaves = await upcomingQb.getMany();

    return {
      pending,
      approved,
      rejected,
      cancelled,
      upcoming: upcomingLeaves.length,
      total: pending + approved + rejected + cancelled,
    };
  }

  private async getEmployeeWeeklyAttendance(employeeId: string) {
    const startOfWeek = dayjs().startOf('week').format('YYYY-MM-DD');
    const endOfWeek = dayjs().endOf('week').format('YYYY-MM-DD');

    const records = await this.attendanceRepo.find({
      where: {
        employeeId,
        date: Between(startOfWeek, endOfWeek),
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
    });

    const stats = this.calculateAttendanceStats(records);
    const totalWorkedMinutes = records.reduce(
      (acc, curr) => acc + (curr.workedMinutes || 0),
      0,
    );

    return {
      period: `${startOfWeek} to ${endOfWeek}`,
      ...stats,
      workedHours: Number((totalWorkedMinutes / 60).toFixed(2)),
    };
  }

  private async getEmployeeMonthlyAttendance(employeeId: string) {
    const startOfMonth = dayjs().startOf('month').format('YYYY-MM-DD');
    const endOfMonth = dayjs().endOf('month').format('YYYY-MM-DD');

    const records = await this.attendanceRepo.find({
      where: {
        employeeId,
        date: Between(startOfMonth, endOfMonth),
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
    });

    const stats = this.calculateAttendanceStats(records);
    const totalWorkedMinutes = records.reduce(
      (acc, curr) => acc + (curr.workedMinutes || 0),
      0,
    );

    const expectedHours = stats.present * 8 + stats.halfDay * 4;
    const completionPercentage =
      expectedHours > 0
        ? Number(((totalWorkedMinutes / 60 / expectedHours) * 100).toFixed(2))
        : 0;

    return {
      period: dayjs().format('MMMM YYYY'),
      ...stats,
      workedHours: Number((totalWorkedMinutes / 60).toFixed(2)),
      expectedHours,
      completionPercentage,
    };
  }

  private async getLeaveBalance(employeeId: string) {
    const currentMonth = dayjs().month() + 1;
    const currentYear = dayjs().year();

    const balanceRecord = await this.leaveBalanceRepo.findOne({
      where: { employeeId, year: currentYear,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
    });

    const approvedLeaves = await this.leaveRepo.find({
      where: {
        employeeId,
        status: LeaveStatusEnum.APPROVED,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
    });

    const totalLeaveDays = approvedLeaves.reduce((acc, leave) => {
      const days = dayjs(leave.endDate).diff(dayjs(leave.startDate), 'day') + 1;
      return acc + days;
    }, 0);

    return {
      totalApprovedDays: totalLeaveDays,
      leavesTaken: approvedLeaves.length,
      currentBalance: balanceRecord || null,
    };
  }
}
