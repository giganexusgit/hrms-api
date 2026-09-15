import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import { AttendanceCorrection } from '../entities/correction.entity';
import { Attendance } from '../entities/attendance.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { CorrectionRequestDto } from '../dto/correction-request.dto';
import { CorrectionStatus } from '../../../common/enums/CorrectionStatus.enum';
import { AttendanceStatus } from '../../../common/enums/AttendanceStatus.enum';
import { formatIST, dayjsIST, parseISTDate } from '../../../utils/time.util';
import { DataScopeService } from '../../../common/services/data-scope.service';
import { NotificationService } from '../../notification/notification.service';
import { NotificationType } from '../../../common/enums/NotificationType.enum';
import { TenantQueryService } from '../../../common/services/tenant-query.service';
import { AttendanceValidationService } from './attendance-validation.service';

dayjs.extend(isBetween);

@Injectable()
export class CorrectionService {
  constructor(
    @InjectRepository(AttendanceCorrection)
    private correctionRepo: Repository<AttendanceCorrection>,
    @InjectRepository(Attendance)
    private attendanceRepo: Repository<Attendance>,
    private dataSource: DataSource,
    private readonly dataScopeService: DataScopeService,
    private readonly notificationService: NotificationService,
    private readonly tenantQueryService: TenantQueryService,
    private readonly validationService: AttendanceValidationService,
  ) {}

  async requestCorrection(employeeId: string, dto: CorrectionRequestDto) {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();

    const attendance = await this.attendanceRepo.findOne({
      where: {
        employeeId,
        date: dto.date,
        tenantId,
      },
    });

    if (!attendance) {
      throw new BadRequestException('Attendance not found');
    }

    const existing = await this.correctionRepo.findOne({
      where: {
        employeeId,
        attendanceId: attendance.id,
        status: CorrectionStatus.PENDING,
        tenantId,
      },
    });

    if (existing) {
      throw new BadRequestException('Correction already requested');
    }

    const requestedCheckIn = dto.requestedCheckIn
      ? parseISTDate(dto.requestedCheckIn, dto.date)
      : null;

    const requestedCheckOut = dto.requestedCheckOut
      ? parseISTDate(dto.requestedCheckOut, dto.date)
      : null;

    const reason = dto.reason?.trim();

    if (!requestedCheckIn && !requestedCheckOut) {
      throw new BadRequestException(
        'Please provide requested check-in or check-out time',
      );
    }

    if (!reason) {
      throw new BadRequestException('Reason is required');
    }

    const isCheckInIdentical =
      requestedCheckIn &&
      attendance.checkIn &&
      attendance.checkIn.getTime() === requestedCheckIn.getTime();

    const isCheckOutIdentical =
      requestedCheckOut &&
      attendance.checkOut &&
      attendance.checkOut.getTime() === requestedCheckOut.getTime();

    const isNoCheckInChange = !requestedCheckIn || Boolean(isCheckInIdentical);
    const isNoCheckOutChange = !requestedCheckOut || Boolean(isCheckOutIdentical);

    if (isNoCheckInChange && isNoCheckOutChange) {
      throw new BadRequestException(
        'Requested times are identical to current attendance record',
      );
    }

    const correction = this.correctionRepo.create({
      employeeId,
      attendanceId: attendance.id,
      currentCheckIn: attendance.checkIn,
      currentCheckOut: attendance.checkOut,
      requestedCheckIn,
      requestedCheckOut,
      reason,
      status: CorrectionStatus.PENDING,
      tenantId, // Fixed: tenantId was missing, causing NOT NULL constraint error on insert
    });

    const saved = await this.correctionRepo.save(correction);

    return {
      ...saved,
      currentCheckIn: formatIST(saved.currentCheckIn),
      currentCheckOut: formatIST(saved.currentCheckOut),
      requestedCheckIn: formatIST(saved.requestedCheckIn),
      requestedCheckOut: formatIST(saved.requestedCheckOut),
    };
  }

  private calculateStatus(checkIn: Date, employee?: Employee): AttendanceStatus {
    const time = dayjsIST(checkIn);

    if (employee) {
      try {
        const shift = this.validationService.getEffectiveShift(employee);
        const [startHour, startMinute] = shift.startTime.split(':').map(Number);
        const [endHour] = shift.endTime.split(':').map(Number);

        let shiftStartTime = time
          .clone()
          .hour(startHour)
          .minute(startMinute)
          .second(0)
          .millisecond(0);

        const isCrossMidnight = shift.crossMidnight || endHour < startHour;
        if (isCrossMidnight && time.hour() < startHour && time.hour() < 12) {
          shiftStartTime = shiftStartTime.subtract(1, 'day');
        }

        const graceTime = shiftStartTime.add(shift.lateGraceMinutes, 'minute');
        const halfDayTime = shiftStartTime.add(
          shift.halfDayThresholdMinutes,
          'minute',
        );

        if (time.isAfter(halfDayTime)) {
          return AttendanceStatus.HALF_DAY;
        } else if (time.isAfter(graceTime)) {
          return AttendanceStatus.LATE;
        } else {
          return AttendanceStatus.PRESENT;
        }
      } catch {
        // Fallback to standard time thresholds if employee has no shift assigned
      }
    }

    const presentEnd = time.clone().startOf('day').hour(11).minute(0).second(0);
    const lateEnd = time.clone().startOf('day').hour(12).minute(30).second(0);

    if (time.isBefore(presentEnd) || time.isSame(presentEnd)) {
      return AttendanceStatus.PRESENT;
    }

    if (time.isBefore(lateEnd) || time.isSame(lateEnd)) {
      return AttendanceStatus.LATE;
    }

    return AttendanceStatus.HALF_DAY;
  }

  async review(id: string, status: CorrectionStatus, reviewerId: string) {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();

    return this.dataSource.transaction(async (manager) => {
      const correction = await manager.findOne(AttendanceCorrection, {
        where: {
          id,
          tenantId,
        },
        lock: {
          mode: 'pessimistic_write',
        },
      });

      if (!correction) {
        throw new BadRequestException('Correction not found');
      }

      if (correction.status !== CorrectionStatus.PENDING) {
        throw new BadRequestException('Already reviewed');
      }

      correction.status = status;
      correction.reviewedById = reviewerId;
      correction.reviewedAt = new Date();

      let updatedAttendance: Attendance | null = null;

      if (status === CorrectionStatus.APPROVED) {
        const attendance = await manager.findOne(Attendance, {
          where: {
            id: correction.attendanceId,
            tenantId,
          },
          relations: {
            employee: {
              shift: true,
              branch: {
                defaultShift: true,
                organization: {
                  defaultShift: true,
                },
              },
            },
          },
          lock: {
            mode: 'pessimistic_write',
          },
        });

        if (!attendance) {
          throw new BadRequestException('Attendance not found');
        }

        if (correction.requestedCheckIn) {
          attendance.checkIn = new Date(correction.requestedCheckIn);
        }

        if (correction.requestedCheckOut) {
          attendance.checkOut = new Date(correction.requestedCheckOut);
        }

        if (
          attendance.checkIn &&
          attendance.checkOut &&
          attendance.checkIn > attendance.checkOut
        ) {
          throw new BadRequestException('Invalid time range');
        }

        if (attendance.checkIn && attendance.checkOut) {
          const breakMins = attendance.totalBreakMinutes || 0;
          const grossMinutes = Math.floor(
            (attendance.checkOut.getTime() - attendance.checkIn.getTime()) /
              60000,
          );
          const workedMinutes = Math.max(0, grossMinutes - breakMins);

          attendance.workedMinutes = workedMinutes;
          attendance.overtimeMinutes =
            workedMinutes > 480 ? workedMinutes - 480 : 0;
          attendance.status = this.calculateStatus(attendance.checkIn, attendance.employee);

          if (workedMinutes < 480) {
            attendance.earlyCheckoutReason = correction.reason;
          } else {
            attendance.earlyCheckoutReason = null;
          }
        } else if (attendance.checkIn) {
          attendance.status = this.calculateStatus(attendance.checkIn, attendance.employee);
        }

        updatedAttendance = await manager.save(attendance, {
          reload: true,
        });
      }

      await manager.save(correction);

      const message =
        status === CorrectionStatus.APPROVED
          ? `Your attendance correction request has been approved.`
          : `Your attendance correction request has been rejected.`;

      await this.notificationService.createNotification({
        employeeId: correction.employeeId,
        type: NotificationType.ATTENDANCE,
        title: `Attendance Correction ${status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()}`,
        message,
        referenceId: correction.id,
      });

      return {
        correction,
        attendance: updatedAttendance,
      };
    });
  }

  async findAll(query: any, currentUser: Employee) {
    const {
      status,
      employeeId,
      branchId,
      page = 1,
      limit = 10,
    } = query;

    const pageNumber = Number(page);
    const limitNumber = Number(limit);

    const qb = this.correctionRepo.createQueryBuilder('correction');

    this.tenantQueryService.applyTenantFilter(qb, 'correction');

    qb.leftJoinAndSelect('correction.employee', 'employee');
    qb.leftJoinAndSelect('correction.reviewer', 'reviewer');
    qb.leftJoinAndSelect('correction.attendance', 'attendance');

    if (status) {
      qb.andWhere('correction.status = :status', { status });
    }

    if (employeeId) {
      qb.andWhere('correction.employee_id = :employeeId', { employeeId });
    }

    if (branchId) {
      qb.andWhere('employee.branch_id = :branchId', { branchId });
    }

    this.dataScopeService.applyScope(qb, currentUser, {
      branch: 'employee.branchId',
      department: 'employee.departmentId',
      employee: 'employee.id',
    });

    qb.orderBy('correction.created_at', 'DESC');
    qb.skip((pageNumber - 1) * limitNumber);
    qb.take(limitNumber);

    const [data, total] = await qb.getManyAndCount();

    return {
      data: data.map((correction) => ({
        id: correction.id,
        employee: correction.employee
          ? {
              id: correction.employee.id,
              employeeCode: correction.employee.employeeCode,
              name: `${correction.employee.firstName} ${correction.employee.lastName}`,
            }
          : null,
        attendanceId: correction.attendanceId,
        currentCheckIn: formatIST(correction.currentCheckIn),
        currentCheckOut: formatIST(correction.currentCheckOut),
        requestedCheckIn: formatIST(correction.requestedCheckIn),
        requestedCheckOut: formatIST(correction.requestedCheckOut),
        reason: correction.reason,
        status: correction.status,
        reviewedBy: correction.reviewer
          ? {
              id: correction.reviewer.id,
              name: `${correction.reviewer.firstName} ${correction.reviewer.lastName}`,
            }
          : null,
        reviewComment: correction.reviewComment,
        reviewedAt: formatIST(correction.reviewedAt),
        createdAt: formatIST(correction.createdAt),
      })),
      meta: {
        total,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(total / limitNumber),
      },
    };
  }
}
