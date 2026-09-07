import { Injectable } from '@nestjs/common';

import { Cron } from '@nestjs/schedule';

import { InjectRepository } from '@nestjs/typeorm';

import { DataSource, IsNull, Repository } from 'typeorm';

import { Attendance } from '../entities/attendance.entity';

import { Employee } from '../../employees/entities/employee.entity';

import { Holiday } from '../../holiday/entities/holiday.entity';

import { WeekendSetting } from '../../weekend_settings/entities/weekend_setting.entity';

import { Leave } from '../entities/leave.entity';

import { AttendanceStatus } from '../../../common/enums/AttendanceStatus.enum';
import { EmployeeWorkStatus } from '../../../common/enums/employee-work-status.enum';

import { LeaveStatusEnum } from '../../../common/enums/leave-status.enum';

import { nowIST, todayIST, dayjsIST } from '../../../utils/time.util';
import { WeekNumberEnum } from '../../../common/enums/WeekNumberEnum.enum';
import { WeekDayEnum } from '../../../common/enums/WeekDayEnum.enum';
import dayjs from 'dayjs';
import { AttendanceValidationService } from './attendance-validation.service';
import { NotificationService } from '../../notification/notification.service';
import { NotificationType } from '../../../common/enums/NotificationType.enum';
import { TenantQueryService } from "../../../common/services/tenant-query.service";
import { TenantExecutionService } from "../../../common/services/tenant-execution.service";

@Injectable()
export class AttendanceCronService {
  constructor(
    @InjectRepository(Attendance)
    private readonly attendanceRepo: Repository<Attendance>,

    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,

    @InjectRepository(Holiday)
    private readonly holidayRepo: Repository<Holiday>,

    @InjectRepository(WeekendSetting)
    private readonly weekendRepo: Repository<WeekendSetting>,

    @InjectRepository(Leave)
    private readonly leaveRepo: Repository<Leave>,

    private readonly dataSource: DataSource,
    private readonly validationService: AttendanceValidationService,
    private readonly notificationService: NotificationService,
    private readonly tenantQueryService: TenantQueryService,
    private readonly tenantExecutionService: TenantExecutionService,
  ) {}

  // =====================
  // AUTO CHECKOUT
  // HOURLY CHECK
  // =====================

  @Cron('0 * * * *', {
    timeZone: 'Asia/Kolkata',
  })
  async autoCheckOut() {
    await this.tenantExecutionService.forEachActiveTenant('Auto Checkout', async () => {
      const today = todayIST();
      const now = nowIST();
      const currentTenantId = this.tenantQueryService.getTenantWhereClause().tenantId;

      await this.dataSource.transaction(async (manager) => {
        const records = await manager
          .createQueryBuilder(Attendance, 'attendance')
          .leftJoinAndSelect('attendance.employee', 'employee')
          .leftJoinAndSelect('employee.shift', 'shift')
          .leftJoinAndSelect('employee.branch', 'branch')
          .leftJoinAndSelect('branch.defaultShift', 'branchShift')
          .leftJoinAndSelect('branch.organization', 'organization')
          .leftJoinAndSelect('organization.defaultShift', 'orgShift')
          .setLock('pessimistic_write')
          .where('attendance.check_out IS NULL')
          .andWhere('attendance.check_in IS NOT NULL')
          .andWhere('attendance.tenantId = :currentTenantId', { currentTenantId })
          .andWhere('attendance.status NOT IN (:...excluded)', {
            excluded: [
              AttendanceStatus.HOLIDAY,
              AttendanceStatus.WEEKEND,
              AttendanceStatus.LEAVE,
              AttendanceStatus.ABSENT,
            ],
          })
          .getMany();

        for (const attendance of records) {
          if (!attendance.employee) continue;

          const shift = this.validationService.getEffectiveShift(
            attendance.employee,
          );

          let absoluteMaxTime: dayjs.Dayjs;
          let officialShiftEndTime: dayjs.Dayjs;

          const graceMinutes = shift.maxAllowedOvertimeMinutes || 240;

          if (shift.isFlexible) {
            officialShiftEndTime = dayjsIST(attendance.checkIn).add(
              shift.standardWorkingMinutes,
              'minute',
            );
            absoluteMaxTime = officialShiftEndTime.add(
              graceMinutes,
              'minute',
            );
          } else {
            const [endHour, endMinute] = shift.endTime.split(':').map(Number);
            const [startHour] = shift.startTime.split(':').map(Number);
            officialShiftEndTime = dayjsIST(attendance.date)
              .hour(endHour)
              .minute(endMinute)
              .second(0)
              .millisecond(0);

            const isCrossMidnight = shift.crossMidnight || endHour < startHour;
            if (isCrossMidnight) {
              officialShiftEndTime = officialShiftEndTime.add(1, 'day');
            }

            absoluteMaxTime = officialShiftEndTime.add(
              graceMinutes,
              'minute',
            );
          }

          if (now.isAfter(absoluteMaxTime)) {
            const autoCheckoutTime = officialShiftEndTime;

            // Finalize break if employee was left on break
            if (attendance.workStatus === EmployeeWorkStatus.ON_BREAK && attendance.lastBreakStart) {
              attendance.lastBreakEnd = autoCheckoutTime.toDate();
              const breakDuration = Math.max(0, Math.floor(autoCheckoutTime.diff(dayjsIST(attendance.lastBreakStart), 'minute')));
              attendance.totalBreakMinutes = (attendance.totalBreakMinutes || 0) + breakDuration;
            }

            let breakDeduction = 0;
            if (!shift.includeBreakInWorkingHours) {
              breakDeduction = attendance.totalBreakMinutes || 0;
            }

            const totalWorkedMinutes = Math.max(
              0,
              autoCheckoutTime.diff(dayjsIST(attendance.checkIn), 'minute') - breakDeduction,
            );

            attendance.checkOut = autoCheckoutTime.toDate();
            attendance.workedMinutes = totalWorkedMinutes;
            attendance.isAutoCheckout = true;
            attendance.workStatus = EmployeeWorkStatus.NOT_WORKING;

            await manager.save(attendance);
          }
        }
      });
    });
  }

  // =====================
  // AUTO HOLIDAY
  // 12:01 AM
  // =====================

  @Cron('1 0 * * *', {
    timeZone: 'Asia/Kolkata',
  })
  async autoMarkHoliday() {
    await this.tenantExecutionService.forEachActiveTenant('Auto Holiday', async () => {
      const today = todayIST();
      const currentTenantId = this.tenantQueryService.getTenantWhereClause().tenantId;

      const holiday = await this.holidayRepo.findOne({
        where: {
          date: today,
          tenantId: currentTenantId,
        },
      });

      if (!holiday) {
        return;
      }

      const employees = await this.employeeRepo.find({
        where: {
          isActive: true,
          deletedAt: IsNull(),
          tenantId: currentTenantId,
        },
        select: {
          id: true,
        },
      });

      for (const employee of employees) {
        const existing = await this.attendanceRepo.findOne({
          where: {
            employeeId: employee.id,
            date: today,
            tenantId: currentTenantId,
          },
        });

        if (existing) {
          continue;
        }

        await this.attendanceRepo.save({
          employeeId: employee.id,
          date: today,
          status: AttendanceStatus.HOLIDAY,
        });
      }
    });
  }

  // =====================
  // AUTO WEEKEND
  // 12:05 AM
  // =====================

  @Cron('5 0 * * *', {
    timeZone: 'Asia/Kolkata',
  })
  async autoMarkWeekend() {
    await this.tenantExecutionService.forEachActiveTenant('Auto Weekend', async () => {
      const now = nowIST();
      const today = todayIST();
      const currentTenantId = this.tenantQueryService.getTenantWhereClause().tenantId;

      const dayMap = {
        0: WeekDayEnum.SUNDAY,
        1: WeekDayEnum.MONDAY,
        2: WeekDayEnum.TUESDAY,
        3: WeekDayEnum.WEDNESDAY,
        4: WeekDayEnum.THURSDAY,
        5: WeekDayEnum.FRIDAY,
        6: WeekDayEnum.SATURDAY,
      };

      const currentDay = dayMap[now.day()];
      const weekOfMonth = Math.ceil(now.date() / 7);

      const weekMap = {
        1: WeekNumberEnum.FIRST,
        2: WeekNumberEnum.SECOND,
        3: WeekNumberEnum.THIRD,
        4: WeekNumberEnum.FOURTH,
        5: WeekNumberEnum.FIFTH,
      };

      const weekendRule = await this.weekendRepo.findOne({
        where: [
          {
            day: currentDay,
            weekNumber: WeekNumberEnum.ALL,
            isOff: true,
            tenantId: currentTenantId,
          },
          {
            day: currentDay,
            weekNumber: weekMap[weekOfMonth],
            isOff: true,
            tenantId: currentTenantId,
          },
        ],
      });

      // HOLIDAY HAS PRIORITY
      const holiday = await this.holidayRepo.findOne({
        where: {
          date: today,
          tenantId: currentTenantId,
        },
      });

      if (holiday || !weekendRule) {
        return;
      }

      const employees = await this.employeeRepo.find({
        where: {
          isActive: true,
          deletedAt: IsNull(),
          tenantId: currentTenantId,
        },
        select: {
          id: true,
        },
      });

      for (const employee of employees) {
        const existing = await this.attendanceRepo.findOne({
          where: {
            employeeId: employee.id,
            date: today,
            tenantId: currentTenantId,
          },
        });

        if (existing) {
          continue;
        }

        await this.attendanceRepo.save({
          employeeId: employee.id,
          date: today,
          status: AttendanceStatus.WEEKEND,
        });
      }
    });
  }

  // =====================
  // AUTO ABSENT
  // 11:00 PM
  // =====================

  @Cron('0 * * * *', {
    timeZone: 'Asia/Kolkata',
  })
  async autoMarkAbsent() {
    await this.tenantExecutionService.forEachActiveTenant('Auto Absent', async () => {
      const today = todayIST();
      const now = nowIST();
      const currentTenantId = this.tenantQueryService.getTenantWhereClause().tenantId;

      const employees = await this.employeeRepo.find({
        where: {
          isActive: true,
          deletedAt: IsNull(),
          tenantId: currentTenantId,
        },
        relations: {
          shift: true,
          branch: {
            defaultShift: true,
            organization: {
              defaultShift: true,
            },
          },
        },
      });

      // HOLIDAY CHECK
      const holiday = await this.holidayRepo.findOne({
        where: {
          date: today,
          tenantId: currentTenantId,
        },
      });

      // WEEKEND CHECK
      const dayMap = {
        0: WeekDayEnum.SUNDAY,
        1: WeekDayEnum.MONDAY,
        2: WeekDayEnum.TUESDAY,
        3: WeekDayEnum.WEDNESDAY,
        4: WeekDayEnum.THURSDAY,
        5: WeekDayEnum.FRIDAY,
        6: WeekDayEnum.SATURDAY,
      };

      const currentDay = dayMap[now.day()];
      const weekOfMonth = Math.ceil(now.date() / 7);

      const weekMap = {
        1: WeekNumberEnum.FIRST,
        2: WeekNumberEnum.SECOND,
        3: WeekNumberEnum.THIRD,
        4: WeekNumberEnum.FOURTH,
        5: WeekNumberEnum.FIFTH,
      };

      const weekend = await this.weekendRepo.findOne({
        where: [
          {
            day: currentDay,
            weekNumber: WeekNumberEnum.ALL,
            isOff: true,
            tenantId: currentTenantId,
          },
          {
            day: currentDay,
            weekNumber: weekMap[weekOfMonth],
            isOff: true,
            tenantId: currentTenantId,
          },
        ],
      });

      for (const employee of employees) {
        const existingAttendance = await this.attendanceRepo.findOne({
          where: {
            employeeId: employee.id,
            date: today,
            tenantId: currentTenantId,
          },
        });

        if (existingAttendance) {
          continue;
        }

        let shift;
        try {
          shift = this.validationService.getEffectiveShift(employee);
        } catch (e) {
          continue;
        }

        const [startHour, startMinute] = shift.startTime.split(':').map(Number);
        const shiftStartTime = dayjsIST(today)
          .hour(startHour)
          .minute(startMinute)
          .second(0)
          .millisecond(0);
        const absoluteLatestCheckIn = shiftStartTime.add(
          shift.latestCheckInMinutes,
          'minute',
        );

        if (now.isBefore(absoluteLatestCheckIn)) {
          continue;
        }

        if (holiday) {
          await this.attendanceRepo.save({
            employeeId: employee.id,
            date: today,
            status: AttendanceStatus.HOLIDAY,
          });
          continue;
        }

        if (weekend) {
          await this.attendanceRepo.save({
            employeeId: employee.id,
            date: today,
            status: AttendanceStatus.WEEKEND,
          });
          continue;
        }

        const leave = await this.leaveRepo
          .createQueryBuilder('leave')
          .where('leave.employee_id = :employeeId', { employeeId: employee.id })
          .andWhere('leave.status = :status', { status: LeaveStatusEnum.APPROVED })
          .andWhere('leave.start_date <= :today AND leave.end_date >= :today', { today })
          .getOne();

        if (leave) {
          await this.attendanceRepo.save({
            employeeId: employee.id,
            date: today,
            status: AttendanceStatus.LEAVE,
          });
          continue;
        }

        await this.attendanceRepo.save({
          employeeId: employee.id,
          date: today,
          status: AttendanceStatus.ABSENT,
          workedMinutes: 0,
          overtimeMinutes: 0,
        });
      }
    });
  }

  // =====================
  // NOTIFY SHIFT END
  // =====================

  @Cron('*/15 * * * *', {
    timeZone: 'Asia/Kolkata',
  })
  async notifyShiftEnd() {
    await this.tenantExecutionService.forEachActiveTenant('Notify Shift End', async () => {
      const today = todayIST();
      const now = nowIST();
      const currentTenantId = this.tenantQueryService.getTenantWhereClause().tenantId;

      const records = await this.attendanceRepo
        .createQueryBuilder('attendance')
        .leftJoinAndSelect('attendance.employee', 'employee')
        .leftJoinAndSelect('employee.shift', 'shift')
        .leftJoinAndSelect('employee.branch', 'branch')
        .leftJoinAndSelect('branch.defaultShift', 'branchShift')
        .leftJoinAndSelect('branch.organization', 'organization')
        .leftJoinAndSelect('organization.defaultShift', 'orgShift')
        .where('attendance.check_out IS NULL')
        .andWhere('attendance.check_in IS NOT NULL')
        .andWhere('attendance.tenantId = :currentTenantId', { currentTenantId })
        .andWhere('attendance.status NOT IN (:...excluded)', {
          excluded: [
            AttendanceStatus.HOLIDAY,
            AttendanceStatus.WEEKEND,
            AttendanceStatus.LEAVE,
            AttendanceStatus.ABSENT,
          ],
        })
        .getMany();

      for (const attendance of records) {
        if (!attendance.employee) continue;

        let shift;
        try {
          shift = this.validationService.getEffectiveShift(attendance.employee);
        } catch (e) {
          continue;
        }

        let officialShiftEndTime: dayjs.Dayjs;

        if (shift.isFlexible) {
          officialShiftEndTime = dayjsIST(attendance.checkIn).add(
            shift.standardWorkingMinutes,
            'minute',
          );
        } else {
          const [endHour, endMinute] = shift.endTime.split(':').map(Number);
          const [startHour] = shift.startTime.split(':').map(Number);
          officialShiftEndTime = dayjsIST(attendance.date)
            .hour(endHour)
            .minute(endMinute)
            .second(0)
            .millisecond(0);

          const isCrossMidnight = shift.crossMidnight || endHour < startHour;
          if (isCrossMidnight) {
            officialShiftEndTime = officialShiftEndTime.add(1, 'day');
          }
        }

        if (
          now.isAfter(officialShiftEndTime) &&
          now.isBefore(officialShiftEndTime.add(16, 'minute'))
        ) {
          await this.notificationService.createNotification({
            employeeId: attendance.employee.id,
            type: NotificationType.ATTENDANCE,
            title: `Shift Completed`,
            message: `Your working hours are complete. You can now check out.`,
            referenceId: attendance.id,
          });
        }
      }
    });
  }
}
