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
import { formatIST, dayjsIST } from '../../../utils/time.util';
import { DataScopeService } from '../../../common/services/data-scope.service';
import { NotificationService } from '../../notification/notification.service';
import { NotificationType } from '../../../common/enums/NotificationType.enum';
import { TenantQueryService } from '../../../common/services/tenant-query.service';

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
      ? new Date(dto.requestedCheckIn)
      : null;

    const requestedCheckOut = dto.requestedCheckOut
      ? new Date(dto.requestedCheckOut)
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

    const sameCheckIn =
      attendance.checkIn &&
      requestedCheckIn &&
      attendance.checkIn.getTime() === requestedCheckIn.getTime();

    const sameCheckOut =
      attendance.checkOut &&
      requestedCheckOut &&
      attendance.checkOut.getTime() === requestedCheckOut.getTime();

    if (sameCheckIn || sameCheckOut) {
      throw new BadRequestException(
        'Requested time is same as current attendance',
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

  private calculateStatus(checkIn: Date): AttendanceStatus {
    const time = dayjsIST(checkIn);

    const presentEnd = time.startOf('day').hour(10).minute(30).second(0);
    const lateEnd = time.startOf('day').hour(12).minute(30).second(0);

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
          const workedMinutes = Math.floor(
            (attendance.checkOut.getTime() - attendance.checkIn.getTime()) /
              60000,
          );

          attendance.workedMinutes = workedMinutes;
          attendance.overtimeMinutes =
            workedMinutes > 480 ? workedMinutes - 480 : 0;
          attendance.status = this.calculateStatus(attendance.checkIn);

          if (workedMinutes < 480) {
            attendance.earlyCheckoutReason = correction.reason;
          } else {
            attendance.earlyCheckoutReason = null;
          }
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
        currentCheckIn: correction.currentCheckIn,
        currentCheckOut: correction.currentCheckOut,
        requestedCheckIn: correction.requestedCheckIn,
        requestedCheckOut: correction.requestedCheckOut,
        reason: correction.reason,
        status: correction.status,
        reviewedBy: correction.reviewer
          ? {
              id: correction.reviewer.id,
              name: `${correction.reviewer.firstName} ${correction.reviewer.lastName}`,
            }
          : null,
        reviewComment: correction.reviewComment,
        reviewedAt: correction.reviewedAt,
        createdAt: correction.createdAt,
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
