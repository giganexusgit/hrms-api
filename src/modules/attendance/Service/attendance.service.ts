import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, IsNull } from 'typeorm';
import dayjs from 'dayjs';

import { nowIST, todayIST, dayjsIST } from '../../../utils/time.util';
import { Attendance } from '../entities/attendance.entity';
import { AttendanceValidationService } from './attendance-validation.service';
import { AttendanceStatus } from '../../../common/enums/AttendanceStatus.enum';
import { EmployeeWorkStatus } from '../../../common/enums/employee-work-status.enum';
import { formatAttendanceResponse } from '../helpers/attendance-response.helper';
import { TenantQueryService } from '../../../common/services/tenant-query.service';
import { NotificationService } from '../../notification/notification.service';
import { NotificationType } from '../../../common/enums/NotificationType.enum';
import { ActivityLogService } from '../../activity-log/activity-log.service';
import { ActivityAction } from '../../activity-log/enums/activity-action.enum';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(Attendance)
    private readonly attendanceRepo: Repository<Attendance>,
    private readonly dataSource: DataSource,
    private readonly validationService: AttendanceValidationService,
    private readonly tenantQueryService: TenantQueryService,
    private readonly notificationService: NotificationService,
    private readonly activityLogService: ActivityLogService,
  ) {}

  private readonly employeeRelations = {
    employee: {
      department: true,
      designation: true,
    },
  };

  async checkIn(employeeId: string, location?: string) {
    const employee = await this.validationService.validateEmployee(employeeId);
    await this.validationService.validateWorkingDay(employeeId);

    const { tenantId } = this.tenantQueryService.getTenantWhereClause();

    return this.dataSource.transaction(async (manager) => {
      const today = todayIST();
      const now = nowIST();
      const nowDate = now.toDate();

      let attendance = await manager.findOne(Attendance, {
        where: {
          employeeId,
          date: today,
          tenantId,
        },
        lock: {
          mode: 'pessimistic_write',
        },
      });

      this.validationService.validateCheckIn(attendance, employee, nowDate);

      if (!attendance) {
        attendance = manager.create(Attendance, {
          employeeId,
          date: today,
          tenantId, // Fixed: tenantId was missing, causing NOT NULL constraint violation
        });
      }

      attendance.checkIn = nowDate;
      attendance.checkOut = null;
      attendance.checkInLocation = location?.trim() || null;
      attendance.checkOutLocation = null;
      attendance.earlyCheckoutReason = null;
      attendance.workedMinutes = 0;
      attendance.overtimeMinutes = 0;
      attendance.isAutoCheckout = false;
      attendance.workStatus = EmployeeWorkStatus.WORKING;

      const shift = this.validationService.getEffectiveShift(employee);
      const [startHour, startMinute] = shift.startTime.split(':').map(Number);
      const [endHour] = shift.endTime.split(':').map(Number);
      const nowDayjs = dayjsIST(nowDate);

      let shiftStartTime = dayjsIST(nowDate)
        .hour(startHour)
        .minute(startMinute)
        .second(0)
        .millisecond(0);

      const isCrossMidnight = shift.crossMidnight || endHour < startHour;
      if (isCrossMidnight && nowDayjs.hour() < startHour && nowDayjs.hour() < 12) {
        shiftStartTime = shiftStartTime.subtract(1, 'day');
      }

      const graceTime = shiftStartTime.add(shift.lateGraceMinutes, 'minute');
      const halfDayTime = shiftStartTime.add(
        shift.halfDayThresholdMinutes,
        'minute',
      );

      if (nowDayjs.isAfter(halfDayTime)) {
        attendance.status = AttendanceStatus.HALF_DAY;
        attendance.lateMinutes = nowDayjs.diff(shiftStartTime, 'minute');
      } else if (nowDayjs.isAfter(graceTime)) {
        attendance.status = AttendanceStatus.LATE;
        attendance.lateMinutes = nowDayjs.diff(shiftStartTime, 'minute');
      } else {
        attendance.status = AttendanceStatus.PRESENT;
        attendance.lateMinutes = 0;
      }

      const saved = await manager.save(attendance, {
        reload: true,
      });

      this.activityLogService.logAction({
        tenantId,
        userId: employeeId,
        module: 'ATTENDANCE',
        entityType: 'ATTENDANCE',
        entityId: saved.id,
        action: ActivityAction.CREATE,
        description: `Employee checked in at ${location || 'unknown location'}`,
      });

      const fullAttendance = await manager.findOne(Attendance, {
        where: {
          id: saved.id,
          tenantId,
        },
        relations: this.employeeRelations,
      });

      return formatAttendanceResponse(fullAttendance ?? saved);
    });
  }

  async checkOut(employeeId: string, location?: string, reason?: string) {
    const employee = await this.validationService.validateEmployee(employeeId);
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();

    return this.dataSource.transaction(async (manager) => {
      const today = todayIST();
      const now = nowIST();
      const nowDate = now.toDate();
      const todayString = todayIST();
      const yesterdayString = now.subtract(1, 'day').format('YYYY-MM-DD');

      const attendance = await manager.findOne(Attendance, {
        where: [
          { employeeId, date: todayString, checkOut: IsNull(), tenantId },
          { employeeId, date: yesterdayString, checkOut: IsNull(), tenantId },
        ],
        order: {
          date: 'DESC',
        },
        lock: {
          mode: 'pessimistic_write',
        },
      });

      this.validationService.validateCheckOut(attendance);

      // Auto-finalize break if employee checked out while still on break
      if (attendance!.workStatus === EmployeeWorkStatus.ON_BREAK && attendance!.lastBreakStart) {
        attendance!.lastBreakEnd = nowDate;
        const breakDuration = Math.max(0, Math.floor(now.diff(dayjsIST(attendance!.lastBreakStart), 'minute')));
        attendance!.totalBreakMinutes = (attendance!.totalBreakMinutes || 0) + breakDuration;
      }

      const checkInTime = dayjsIST(attendance!.checkIn);
      const shift = this.validationService.getEffectiveShift(employee);

      let breakMinutes = 0;
      if (!shift.includeBreakInWorkingHours) {
        breakMinutes = attendance!.totalBreakMinutes || 0;
      }

      const workedMinutes =
        Math.floor(now.diff(checkInTime, 'minute')) - breakMinutes;
      const workedHours = workedMinutes / 60;

      attendance!.workedMinutes = workedMinutes;

      const checkoutValidation = this.validationService.validateEarlyCheckout(
        shift,
        workedMinutes,
        nowDate,
        reason,
      );

      attendance!.earlyCheckoutReason = checkoutValidation.reason;

      // Half-day logic on checkout
      if (workedMinutes < shift.halfDayThresholdMinutes) {
        attendance!.status = AttendanceStatus.HALF_DAY;
      }

      // Overtime Logic
      let overtimeMinutes = 0;
      if (workedMinutes > shift.overtimeThresholdMinutes) {
        const potentialOt = workedMinutes - shift.overtimeThresholdMinutes;
        if (potentialOt >= shift.minimumOvertimeMinutes) {
          overtimeMinutes = potentialOt;
        }
      }
      attendance!.overtimeMinutes = overtimeMinutes;
      attendance!.checkOut = nowDate;
      attendance!.checkOutLocation = location?.trim() || null;
      attendance!.isAutoCheckout = false;
      attendance!.workStatus = EmployeeWorkStatus.NOT_WORKING;

      const saved = await manager.save(attendance!, {
        reload: true,
      });

      this.activityLogService.logAction({
        tenantId,
        userId: employeeId,
        module: 'ATTENDANCE',
        entityType: 'ATTENDANCE',
        entityId: saved.id,
        action: ActivityAction.UPDATE,
        description: `Employee checked out at ${location || 'unknown location'}`,
      });

      const fullAttendance = await manager.findOne(Attendance, {
        where: {
          id: saved.id,
          tenantId,
        },
        relations: this.employeeRelations,
      });

      return {
        ...formatAttendanceResponse(fullAttendance ?? saved),
        workedHours: Number(workedHours.toFixed(2)),
        workedMinutes,
        overtimeMinutes: attendance!.overtimeMinutes,
        message: checkoutValidation.message,
      };
    });
  }

  async startBreak(employeeId: string) {
    const employee = await this.validationService.validateEmployee(employeeId);
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();

    return this.dataSource.transaction(async (manager) => {
      const today = todayIST();
      const now = nowIST();
      const nowDate = now.toDate();

      const attendance = await manager.findOne(Attendance, {
        where: { employeeId, date: today, checkOut: IsNull(), tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!attendance) {
        throw new BadRequestException('Must check in before starting a break.');
      }

      if (attendance.workStatus === EmployeeWorkStatus.ON_BREAK) {
        throw new BadRequestException('Employee is already on break.');
      }

      const shift = this.validationService.getEffectiveShift(employee);
      if (shift.allowBreakTime === false) {
        throw new BadRequestException('Break time is not allowed for your assigned shift.');
      }

      const maxBreak = shift.maxAllowedBreakMinutes ?? 60;
      if ((attendance.totalBreakMinutes || 0) >= maxBreak) {
        throw new BadRequestException(`Maximum allowed break time (${maxBreak} mins) reached for today.`);
      }

      attendance.workStatus = EmployeeWorkStatus.ON_BREAK;
      attendance.lastBreakStart = nowDate;

      const saved = await manager.save(attendance);

      const remainingBreak = maxBreak - (attendance.totalBreakMinutes || 0);

      // Trigger Notification
      await this.notificationService.createNotification({
        employeeId,
        title: 'Break Started',
        message: `Your break has started at ${dayjsIST(nowDate).format('HH:mm')}. You have ${remainingBreak} minutes remaining for today.`,
        type: NotificationType.ATTENDANCE,
        referenceId: saved.id,
      });

      // Audit / Activity Log
      this.activityLogService.logAction({
        tenantId,
        userId: employeeId,
        module: 'ATTENDANCE',
        entityType: 'ATTENDANCE',
        entityId: saved.id,
        action: ActivityAction.UPDATE,
        description: 'Employee started break',
      });

      return {
        message: 'Break started successfully',
        workStatus: saved.workStatus,
        lastBreakStart: saved.lastBreakStart,
        totalBreakMinutes: saved.totalBreakMinutes,
        maxAllowedBreakMinutes: maxBreak,
      };
    });
  }

  async endBreak(employeeId: string) {
    const employee = await this.validationService.validateEmployee(employeeId);
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();

    return this.dataSource.transaction(async (manager) => {
      const today = todayIST();
      const now = nowIST();
      const nowDate = now.toDate();

      const attendance = await manager.findOne(Attendance, {
        where: { employeeId, date: today, checkOut: IsNull(), tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!attendance || attendance.workStatus !== EmployeeWorkStatus.ON_BREAK) {
        throw new BadRequestException('Employee is not currently on break.');
      }

      attendance.lastBreakEnd = nowDate;
      const sessionMinutes = attendance.lastBreakStart
        ? Math.max(0, Math.floor(now.diff(dayjsIST(attendance.lastBreakStart), 'minute')))
        : 0;

      attendance.totalBreakMinutes = (attendance.totalBreakMinutes || 0) + sessionMinutes;
      attendance.workStatus = EmployeeWorkStatus.WORKING;

      const saved = await manager.save(attendance);

      const shift = this.validationService.getEffectiveShift(employee);
      const maxBreak = shift.maxAllowedBreakMinutes ?? 60;
      const overBreakMsg = (saved.totalBreakMinutes > maxBreak)
        ? ` Note: Total break duration (${saved.totalBreakMinutes} mins) has exceeded your shift allowance of ${maxBreak} mins.`
        : '';

      // Trigger Notification
      await this.notificationService.createNotification({
        employeeId,
        title: 'Break Ended',
        message: `Your break has ended. Session duration: ${sessionMinutes} minutes.${overBreakMsg} Work session resumed.`,
        type: NotificationType.ATTENDANCE,
        referenceId: saved.id,
      });

      // Audit / Activity Log
      this.activityLogService.logAction({
        tenantId,
        userId: employeeId,
        module: 'ATTENDANCE',
        entityType: 'ATTENDANCE',
        entityId: saved.id,
        action: ActivityAction.UPDATE,
        description: `Employee ended break after ${sessionMinutes} minutes`,
      });

      return {
        message: 'Break ended successfully',
        workStatus: saved.workStatus,
        lastBreakEnd: saved.lastBreakEnd,
        totalBreakMinutes: saved.totalBreakMinutes,
        sessionBreakMinutes: sessionMinutes,
      };
    });
  }
}
