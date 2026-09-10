import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { IsNull, Repository } from 'typeorm';
import { todayIST, dayjsIST } from 'src/utils/time.util';
import { Employee } from '../../employees/entities/employee.entity';
import dayjs from 'dayjs';
import { Attendance } from '../entities/attendance.entity';
import { LeaveStatusEnum } from '../../../common/enums/leave-status.enum';

import { AttendanceStatus } from '../../../common/enums/AttendanceStatus.enum';
import { Holiday } from '../../holiday/entities/holiday.entity';
import { WeekendSetting } from '../../weekend_settings/entities/weekend_setting.entity';
import { Leave } from '../entities/leave.entity';
import { WeekNumberEnum } from 'src/common/enums/WeekNumberEnum.enum';
import { WeekDayEnum } from 'src/common/enums/WeekDayEnum.enum';
import { Shift } from '../../shift/entities/shift.entity';
import { TenantQueryService } from "../../../common/services/tenant-query.service";

@Injectable()
export class AttendanceValidationService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(Holiday)
    private readonly holidayRepo: Repository<Holiday>,

    @InjectRepository(WeekendSetting)
    private readonly weekendRepo: Repository<WeekendSetting>,

    @InjectRepository(Leave)
    private readonly leaveRepo: Repository<Leave>, private readonly tenantQueryService: TenantQueryService
  ) {}

  // =====================
  // VALIDATE EMPLOYEE
  // =====================

  async validateEmployee(employeeId: string) {
    const employee = await this.employeeRepo.findOne({
      where: {
        id: employeeId,
        isActive: true,
        deletedAt: IsNull(),
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
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

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return employee;
  }

  // =====================
  // GET EFFECTIVE SHIFT
  // =====================
  getEffectiveShift(employee: Employee) {
    if (employee.shift) return employee.shift;
    if (employee.branch?.defaultShift) return employee.branch.defaultShift;
    if (employee.branch?.organization?.defaultShift)
      return employee.branch.organization.defaultShift;
    throw new BadRequestException(
      'No shift assigned to employee, branch, or organization',
    );
  }

  // =====================
  // CHECK-IN VALIDATION
  // =====================

  validateCheckIn(
    attendance: Attendance | null | undefined,
    employee: Employee,
    nowDate: Date,
  ) {
    // ALREADY CHECKED IN
    if (attendance?.checkIn) {
      throw new BadRequestException('Already checked in');
    }

    // HOLIDAY / WEEKEND / LEAVE BLOCK
    if (
      attendance?.status === AttendanceStatus.HOLIDAY ||
      attendance?.status === AttendanceStatus.WEEKEND ||
      attendance?.status === AttendanceStatus.LEAVE
    ) {
      throw new BadRequestException(
        `Today is ${attendance.status.toLowerCase().replace('_', ' ')}`,
      );
    }

    // SHIFT CHECK-IN WINDOW
    const shift = this.getEffectiveShift(employee);
    if (!shift.isFlexible) {
      const [startHour, startMinute] = shift.startTime.split(':').map(Number);
      const [endHour] = shift.endTime.split(':').map(Number);
      const now = dayjsIST(nowDate);

      let shiftStartTime = dayjsIST(nowDate)
        .hour(startHour)
        .minute(startMinute)
        .second(0)
        .millisecond(0);

      const isCrossMidnight = shift.crossMidnight || endHour < startHour;
      if (isCrossMidnight && now.hour() < startHour && now.hour() < 12) {
        shiftStartTime = shiftStartTime.subtract(1, 'day');
      }

      const earliestTime = shiftStartTime.subtract(
        shift.earliestCheckInMinutes,
        'minute',
      );
      const latestTime = shiftStartTime.add(
        shift.latestCheckInMinutes,
        'minute',
      );

      if (now.isBefore(earliestTime)) {
        throw new BadRequestException(
          `Too early to check-in. Earliest check-in time is ${earliestTime.format('HH:mm')}`,
        );
      }

      if (now.isAfter(latestTime)) {
        throw new BadRequestException(
          `Too late to check-in. Latest check-in time was ${latestTime.format('HH:mm')}`,
        );
      }
    }
  }

  // =====================
  // CHECK-OUT VALIDATION
  // =====================

  validateCheckOut(attendance?: Attendance | null) {
    // CHECK-IN REQUIRED
    if (!attendance || !attendance.checkIn) {
      throw new BadRequestException('Check-in not found');
    }

    // ALREADY CHECKED OUT
    if (attendance.checkOut) {
      throw new BadRequestException('Already checked out');
    }
  }

  // =====================
  // EARLY CHECKOUT
  // =====================

  validateEarlyCheckout(
    shift: Shift,
    workedMinutes: number,
    nowDate: Date,
    reason?: string,
  ) {
    const cleanedReason = reason?.trim();

    let isEarly = false;

    if (shift.isFlexible) {
      if (workedMinutes < shift.standardWorkingMinutes) {
        isEarly = true;
      }
    } else {
      const [endHour, endMinute] = shift.endTime.split(':').map(Number);
      const [startHour] = shift.startTime.split(':').map(Number);
      
      let shiftEndTime = dayjsIST(nowDate)
        .hour(endHour)
        .minute(endMinute)
        .second(0)
        .millisecond(0);

      const isCrossMidnight = shift.crossMidnight || endHour < startHour;
      if (isCrossMidnight) {
        if (dayjsIST(nowDate).hour() >= startHour) {
          shiftEndTime = shiftEndTime.add(1, 'day');
        }
      }

      const earlyLeaveThreshold = shiftEndTime.subtract(
        shift.earlyLeaveGraceMinutes || 0,
        'minute',
      );

      if (dayjsIST(nowDate).isBefore(earlyLeaveThreshold)) {
        isEarly = true;
      }
    }

    if (isEarly) {
      if (!cleanedReason) {
        throw new BadRequestException(
          'Early checkout detected. Please provide a reason.',
        );
      }

      return {
        isEarly: true,
        reason: cleanedReason,
        message: 'Early checkout recorded',
      };
    }

    return {
      isEarly: false,
      reason: null,
      message: 'Checkout successful.',
    };
  }

  async validateWorkingDay(employeeId: string) {
    const today = todayIST();

    const now = dayjsIST(todayIST());

    const holiday = await this.holidayRepo.findOne({
      where: {
        date: today,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
    });

    if (holiday) {
      throw new BadRequestException(`Today is holiday (${holiday.name})`);
    }

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
            tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
        },

        {
          day: currentDay,

          weekNumber: weekMap[weekOfMonth],

          isOff: true,
            tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
        },
      ],
    });

    if (weekend) {
      throw new BadRequestException('Today is weekend');
    }

    // LEAVE
    const leaveQb = this.leaveRepo
      .createQueryBuilder('leave')
      .where(
        `
        leave.employee_id = :employeeId
      `,
        {
          employeeId,
        },
      )
      .andWhere(
        `
        leave.status = :status
      `,
        {
          status: LeaveStatusEnum.APPROVED,
        },
      )
      .andWhere(
        `
        leave.start_date <= :today
        AND
        leave.end_date >= :today
      `,
        {
          today,
        },
      );
    this.tenantQueryService.applyTenantFilter(leaveQb, 'leave');
    const leave = await leaveQb.getOne();

    if (leave) {
      throw new BadRequestException('Leave approved for today');
    }
  }
}
