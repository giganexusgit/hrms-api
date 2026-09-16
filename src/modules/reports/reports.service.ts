import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual, Brackets } from 'typeorm';
import dayjs from 'dayjs';

import { Employee } from '../employees/entities/employee.entity';
import { Attendance } from '../attendance/entities/attendance.entity';
import { Leave } from '../attendance/entities/leave.entity';
import { Shift } from '../shift/entities/shift.entity';
import { Holiday } from '../holiday/entities/holiday.entity';
import { Department } from '../departments/entities/department.entity';
import { TenantQueryService } from '../../common/services/tenant-query.service';
import { DataScopeService } from '../../common/services/data-scope.service';
import { AttendanceStatus } from '../../common/enums/AttendanceStatus.enum';
import { LeaveStatusEnum } from '../../common/enums/leave-status.enum';
import { PermissionEnum } from '../../common/enums/permission.enum';
import { GetAttendanceReportDto } from './dto/get-attendance-report.dto';

export interface DailyAttendanceRecord {
  date: string;
  dayName: string;
  status: 'PRESENT' | 'LATE' | 'HALF_DAY' | 'ABSENT' | 'LEAVE' | 'HOLIDAY' | 'WEEKEND' | 'UPCOMING' | 'NO_RECORD';
  checkIn: string | null;
  checkOut: string | null;
  workedMinutes: number;
  workedHours: string;
  lateMinutes: number;
  overtimeMinutes: number;
  overtimeHours: string;
  undertimeMinutes: number;
  undertimeHours: string;
  breakMinutes: number;
  leaveType?: string | null;
  holidayName?: string | null;
  isAutoCheckout?: boolean;
}

export interface EmployeeAttendanceReport {
  employee: {
    id: string;
    employeeCode: string;
    name: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    profilePhoto: string | null;
    department: string;
    designation: string;
    branch: string;
  };
  summary: {
    totalDays: number;
    workingDays: number;
    presentDays: number;
    absentDays: number;
    lateDays: number;
    halfDays: number;
    leaveDays: number;
    holidayDays: number;
    weekendDays: number;
    totalWorkedMinutes: number;
    totalWorkedHours: string;
    totalLateMinutes: number;
    totalOvertimeMinutes: number;
    totalOvertimeHours: string;
    totalUndertimeMinutes: number;
    totalUndertimeHours: string;
    attendancePercentage: number;
    punctualityPercentage: number;
  };
  dailyLogs: DailyAttendanceRecord[];
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(Attendance)
    private readonly attendanceRepo: Repository<Attendance>,
    @InjectRepository(Leave)
    private readonly leaveRepo: Repository<Leave>,
    @InjectRepository(Shift)
    private readonly shiftRepo: Repository<Shift>,
    @InjectRepository(Holiday)
    private readonly holidayRepo: Repository<Holiday>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    private readonly tenantQueryService: TenantQueryService,
    private readonly dataScopeService: DataScopeService,
  ) {}

  async getAttendanceReport(query: GetAttendanceReportDto, currentUser: any) {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();

    const startDate = query.startDate || dayjs().startOf('month').format('YYYY-MM-DD');
    const endDate = query.endDate || dayjs().format('YYYY-MM-DD');
    const today = dayjs().format('YYYY-MM-DD');

    const userPermissions = currentUser?.role?.permissions?.map((p: any) => p.name) || [];
    const hasAllRead = userPermissions.includes(PermissionEnum.REPORT_ALL_READ);
    const isSuperAdmin =
      currentUser?.role?.name === 'SUPER_ADMIN' ||
      currentUser?.role?.name === 'ADMIN' ||
      currentUser?.role?.isProtected === true;

    // 1. Fetch filtered employees
    const empQb = this.employeeRepo
      .createQueryBuilder('employee')
      .leftJoinAndSelect('employee.department', 'department')
      .leftJoinAndSelect('employee.designation', 'designation')
      .leftJoinAndSelect('employee.branch', 'branch')
      .leftJoinAndSelect('employee.shift', 'shift')
      .leftJoinAndSelect('employee.role', 'role')
      .where('employee.deleted_at IS NULL');

    this.tenantQueryService.applyTenantFilter(empQb, 'employee');

    // If the user does NOT have report_all.read and is NOT Super Admin, restrict strictly to their own employee account
    if (!hasAllRead && !isSuperAdmin && currentUser?.id) {
      empQb.andWhere('employee.id = :selfEmployeeId', { selfEmployeeId: currentUser.id });
    } else {
      this.dataScopeService.applyScope(empQb, currentUser, {
        branch: 'employee.branchId',
        department: 'employee.departmentId',
        employee: 'employee.id',
      });
    }

    if (query.employeeId) {
      empQb.andWhere('employee.id = :employeeId', { employeeId: query.employeeId });
    }
    if (query.departmentId) {
      empQb.andWhere('employee.departmentId = :departmentId', { departmentId: query.departmentId });
    }
    if (query.branchId) {
      empQb.andWhere('employee.branchId = :branchId', { branchId: query.branchId });
    }
    if (query.designationId) {
      empQb.andWhere('employee.designationId = :designationId', { designationId: query.designationId });
    }
    if (query.search) {
      empQb.andWhere(
        new Brackets((qb) => {
          qb.where('employee.first_name ILIKE :s')
            .orWhere('employee.last_name ILIKE :s')
            .orWhere('employee.employee_code ILIKE :s')
            .orWhere('employee.email ILIKE :s');
        }),
        { s: `%${query.search.trim()}%` },
      );
    }

    empQb.orderBy('employee.employee_code', 'ASC');
    const employees = await empQb.getMany();

    if (employees.length === 0) {
      return {
        dateRange: { startDate, endDate },
        kpis: {
          totalEmployees: 0,
          totalWorkingDays: 0,
          totalPresent: 0,
          totalAbsent: 0,
          totalLate: 0,
          totalHalfDays: 0,
          totalLeaves: 0,
          totalOvertimeHours: '0.0',
          totalUndertimeHours: '0.0',
          averageAttendanceRate: 0,
        },
        reports: [],
      };
    }

    const employeeIds = employees.map((e) => e.id);

    // 2. Fetch all attendance records in range for these employees
    const attendanceRecords = await this.attendanceRepo
      .createQueryBuilder('attendance')
      .where('attendance.tenantId = :tenantId', { tenantId })
      .andWhere('attendance.employeeId IN (:...employeeIds)', { employeeIds })
      .andWhere('attendance.date BETWEEN :startDate AND :endDate', { startDate, endDate })
      .getMany();

    // 3. Fetch approved leaves in range for these employees
    const leaveRecords = await this.leaveRepo
      .createQueryBuilder('leave')
      .leftJoinAndSelect('leave.leaveType', 'leaveType')
      .where('leave.tenantId = :tenantId', { tenantId })
      .andWhere('leave.employeeId IN (:...employeeIds)', { employeeIds })
      .andWhere('leave.status = :status', { status: LeaveStatusEnum.APPROVED })
      .andWhere('leave.startDate <= :endDate AND leave.endDate >= :startDate', { startDate, endDate })
      .getMany();

    // 4. Fetch holidays in range
    const holidays = await this.holidayRepo
      .createQueryBuilder('holiday')
      .where('holiday.tenantId = :tenantId', { tenantId })
      .andWhere('holiday.date BETWEEN :startDate AND :endDate', { startDate, endDate })
      .getMany();

    const holidayMap = new Map<string, string>();
    holidays.forEach((h) => {
      const dateStr = dayjs(h.date).format('YYYY-MM-DD');
      holidayMap.set(dateStr, h.name);
    });

    // Map attendances: employeeId -> date -> record
    const attendanceMap = new Map<string, Map<string, Attendance>>();
    attendanceRecords.forEach((att) => {
      if (!attendanceMap.has(att.employeeId)) {
        attendanceMap.set(att.employeeId, new Map());
      }
      attendanceMap.get(att.employeeId)!.set(att.date, att);
    });

    // Map leaves: employeeId -> list of leaves
    const leaveMap = new Map<string, Leave[]>();
    leaveRecords.forEach((l) => {
      if (!leaveMap.has(l.employeeId)) {
        leaveMap.set(l.employeeId, []);
      }
      leaveMap.get(l.employeeId)!.push(l);
    });

    // Generate date sequence
    const dates: string[] = [];
    let curDate = dayjs(startDate);
    const stopDate = dayjs(endDate);
    while (curDate.isBefore(stopDate) || curDate.isSame(stopDate, 'day')) {
      dates.push(curDate.format('YYYY-MM-DD'));
      curDate = curDate.add(1, 'day');
    }

    // 5. Aggregate per employee
    const reports: EmployeeAttendanceReport[] = employees.map((emp) => {
      const empAttendances = attendanceMap.get(emp.id) || new Map();
      const empLeaves = leaveMap.get(emp.id) || [];
      const standardMinutes = emp.shift?.standardWorkingMinutes || 480;

      let presentDays = 0;
      let absentDays = 0;
      let lateDays = 0;
      let halfDays = 0;
      let leaveDays = 0;
      let holidayDays = 0;
      let weekendDays = 0;
      let upcomingDays = 0;
      let totalWorkedMinutes = 0;
      let totalLateMinutes = 0;
      let totalOvertimeMinutes = 0;
      let totalUndertimeMinutes = 0;

      const dailyLogs: DailyAttendanceRecord[] = dates.map((dStr) => {
        const dObj = dayjs(dStr);
        const dayOfWeek = dObj.day(); // 0 is Sunday, 6 is Saturday
        const dayName = dObj.format('ddd');
        const isSunday = dayOfWeek === 0;
        const isSaturday = dayOfWeek === 6;
        const isHoliday = holidayMap.has(dStr);
        const isFuture = dObj.isAfter(dayjs(today), 'day');

        const att = empAttendances.get(dStr);

        // Check if date falls inside any approved leave
        const matchingLeave = empLeaves.find((l) => {
          const lStart = dayjs(l.startDate);
          const lEnd = dayjs(l.endDate);
          return (dObj.isAfter(lStart, 'day') || dObj.isSame(lStart, 'day')) &&
                 (dObj.isBefore(lEnd, 'day') || dObj.isSame(lEnd, 'day'));
        });

        if (att) {
          let worked = Number(att.workedMinutes || 0);
          if (worked === 0 && att.checkIn && att.checkOut) {
            const diffMin = dayjs(att.checkOut).diff(dayjs(att.checkIn), 'minute');
            worked = Math.max(0, diffMin - Number(att.totalBreakMinutes || 0));
          }

          const late = Number(att.lateMinutes || 0);
          const overtime = Number(att.overtimeMinutes || 0);
          const isLate = att.status === AttendanceStatus.LATE || late > 0;
          const isHalf = att.status === AttendanceStatus.HALF_DAY;
          
          let statusStr: DailyAttendanceRecord['status'] = 'PRESENT';
          if (att.status === AttendanceStatus.ABSENT) {
            statusStr = 'ABSENT';
            absentDays++;
          } else if (isHalf) {
            statusStr = 'HALF_DAY';
            halfDays++;
            presentDays++;
          } else if (isLate) {
            statusStr = 'LATE';
            lateDays++;
            presentDays++;
          } else {
            presentDays++;
          }

          totalWorkedMinutes += worked;
          totalLateMinutes += late;
          totalOvertimeMinutes += overtime;

          // Undertime calculation: ONLY count for working shifts (PRESENT, LATE, HALF_DAY)
          let undertime = 0;
          if (statusStr !== 'ABSENT' && worked < standardMinutes) {
            undertime = standardMinutes - worked;
            totalUndertimeMinutes += undertime;
          }

          return {
            date: dStr,
            dayName,
            status: statusStr,
            checkIn: att.checkIn ? dayjs(att.checkIn).format('hh:mm A') : null,
            checkOut: att.checkOut ? dayjs(att.checkOut).format('hh:mm A') : null,
            workedMinutes: worked,
            workedHours: (worked / 60).toFixed(1) + 'h',
            lateMinutes: late,
            overtimeMinutes: overtime,
            overtimeHours: (overtime / 60).toFixed(1) + 'h',
            undertimeMinutes: undertime,
            undertimeHours: (undertime / 60).toFixed(1) + 'h',
            breakMinutes: Number(att.totalBreakMinutes || 0),
            isAutoCheckout: att.isAutoCheckout,
          };
        }

        // No attendance record found
        if (matchingLeave) {
          leaveDays++;
          return {
            date: dStr,
            dayName,
            status: 'LEAVE',
            checkIn: null,
            checkOut: null,
            workedMinutes: 0,
            workedHours: '0h',
            lateMinutes: 0,
            overtimeMinutes: 0,
            overtimeHours: '0h',
            undertimeMinutes: 0,
            undertimeHours: '0h',
            breakMinutes: 0,
            leaveType: matchingLeave.leaveType?.name || 'Leave',
          };
        }

        if (isHoliday) {
          holidayDays++;
          return {
            date: dStr,
            dayName,
            status: 'HOLIDAY',
            checkIn: null,
            checkOut: null,
            workedMinutes: 0,
            workedHours: '0h',
            lateMinutes: 0,
            overtimeMinutes: 0,
            overtimeHours: '0h',
            undertimeMinutes: 0,
            undertimeHours: '0h',
            breakMinutes: 0,
            holidayName: holidayMap.get(dStr),
          };
        }

        if (isSunday || isSaturday) {
          weekendDays++;
          return {
            date: dStr,
            dayName,
            status: 'WEEKEND',
            checkIn: null,
            checkOut: null,
            workedMinutes: 0,
            workedHours: '0h',
            lateMinutes: 0,
            overtimeMinutes: 0,
            overtimeHours: '0h',
            undertimeMinutes: 0,
            undertimeHours: '0h',
            breakMinutes: 0,
          };
        }

        if (isFuture) {
          upcomingDays++;
          return {
            date: dStr,
            dayName,
            status: 'UPCOMING',
            checkIn: null,
            checkOut: null,
            workedMinutes: 0,
            workedHours: '0h',
            lateMinutes: 0,
            overtimeMinutes: 0,
            overtimeHours: '0h',
            undertimeMinutes: 0,
            undertimeHours: '0h',
            breakMinutes: 0,
          };
        }

        // Past working day without any attendance punch record
        return {
          date: dStr,
          dayName,
          status: 'NO_RECORD',
          checkIn: null,
          checkOut: null,
          workedMinutes: 0,
          workedHours: '0h',
          lateMinutes: 0,
          overtimeMinutes: 0,
          overtimeHours: '0h',
          undertimeMinutes: 0,
          undertimeHours: '0h',
          breakMinutes: 0,
        };
      });

      const totalDays = dates.length;
      const workingDays = Math.max(1, totalDays - weekendDays - holidayDays);
      const elapsedWorkingDays = Math.max(1, workingDays - upcomingDays);
      const attendancePercentage = Number(Math.min(100, (presentDays / elapsedWorkingDays) * 100).toFixed(1));
      const onTimeDays = Math.max(0, presentDays - lateDays);
      const punctualityPercentage = presentDays > 0 ? Number(((onTimeDays / presentDays) * 100).toFixed(1)) : 0;

      return {
        employee: {
          id: emp.id,
          employeeCode: emp.employeeCode,
          name: `${emp.firstName} ${emp.lastName || ''}`.trim(),
          firstName: emp.firstName,
          lastName: emp.lastName,
          email: emp.email,
          role: emp.role?.name || 'EMPLOYEE',
          profilePhoto: emp.profilePhoto,
          department: emp.department?.name || 'N/A',
          designation: emp.designation?.name || 'N/A',
          branch: emp.branch?.name || 'Main Branch',
        },
        summary: {
          totalDays,
          workingDays,
          presentDays,
          absentDays,
          lateDays,
          halfDays,
          leaveDays,
          holidayDays,
          weekendDays,
          totalWorkedMinutes,
          totalWorkedHours: (totalWorkedMinutes / 60).toFixed(1),
          totalLateMinutes,
          totalOvertimeMinutes,
          totalOvertimeHours: (totalOvertimeMinutes / 60).toFixed(1),
          totalUndertimeMinutes,
          totalUndertimeHours: (totalUndertimeMinutes / 60).toFixed(1),
          attendancePercentage,
          punctualityPercentage,
        },
        dailyLogs,
      };
    });

    // Compute top-level summary KPIs
    const totalPresent = reports.reduce((s, r) => s + r.summary.presentDays, 0);
    const totalAbsent = reports.reduce((s, r) => s + r.summary.absentDays, 0);
    const totalLate = reports.reduce((s, r) => s + r.summary.lateDays, 0);
    const totalHalfDays = reports.reduce((s, r) => s + r.summary.halfDays, 0);
    const totalLeaves = reports.reduce((s, r) => s + r.summary.leaveDays, 0);
    const totalOvertimeMinutes = reports.reduce((s, r) => s + r.summary.totalOvertimeMinutes, 0);
    const totalUndertimeMinutes = reports.reduce((s, r) => s + r.summary.totalUndertimeMinutes, 0);
    const avgAttendance = reports.length > 0
      ? Number((reports.reduce((s, r) => s + r.summary.attendancePercentage, 0) / reports.length).toFixed(1))
      : 0;

    return {
      dateRange: { startDate, endDate },
      kpis: {
        totalEmployees: reports.length,
        totalWorkingDays: reports[0]?.summary?.workingDays || 0,
        totalPresent,
        totalAbsent,
        totalLate,
        totalHalfDays,
        totalLeaves,
        totalOvertimeHours: (totalOvertimeMinutes / 60).toFixed(1),
        totalUndertimeHours: (totalUndertimeMinutes / 60).toFixed(1),
        averageAttendanceRate: avgAttendance,
      },
      reports,
    };
  }

  async getEmployeeAttendanceDetails(employeeId: string, startDate?: string, endDate?: string, currentUser?: any) {
    const userPermissions = currentUser?.role?.permissions?.map((p: any) => p.name) || [];
    const hasAllRead = userPermissions.includes(PermissionEnum.REPORT_ALL_READ);
    const isSuperAdmin =
      currentUser?.role?.name === 'SUPER_ADMIN' ||
      currentUser?.role?.name === 'ADMIN' ||
      currentUser?.role?.isProtected === true;

    if (!hasAllRead && !isSuperAdmin && currentUser?.id && employeeId !== currentUser.id) {
      throw new ForbiddenException('You only have permission to view your own attendance report');
    }

    const reportRes = await this.getAttendanceReport(
      {
        employeeId,
        startDate,
        endDate,
      },
      currentUser,
    );

    return reportRes.reports[0] || null;
  }
}
