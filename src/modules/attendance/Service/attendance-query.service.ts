import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, IsNull, Repository } from 'typeorm';
import dayjs from 'dayjs';

import { Attendance } from '../entities/attendance.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { AttendanceStatus } from '../../../common/enums/AttendanceStatus.enum';
import { formatAttendanceResponse } from '../helpers/attendance-response.helper';
import { formatIST, todayIST } from '../../../utils/time.util';
import { buildAttendanceCalendar } from '../helpers/attendance-calendar.helper';
import { DataScopeService } from '../../../common/services/data-scope.service';
import { TenantQueryService } from '../../../common/services/tenant-query.service';
import { AttendanceValidationService } from './attendance-validation.service';
import { Shift } from '../../shift/entities/shift.entity';

@Injectable()
export class AttendanceQueryService {
  constructor(
    @InjectRepository(Attendance)
    private readonly attendanceRepo: Repository<Attendance>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    private readonly dataScopeService: DataScopeService,
    private readonly tenantQueryService: TenantQueryService,
    private readonly validationService: AttendanceValidationService,
  ) {}

  async getMyAttendance(employeeId: string) {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();

    const employee = await this.employeeRepo.findOne({
      where: {
        id: employeeId,
        deletedAt: IsNull(),
        tenantId,
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

    let effectiveShift: Shift | null = null;
    try {
      effectiveShift = this.validationService.getEffectiveShift(employee);
    } catch {
      effectiveShift = null;
    }

    const data = await this.attendanceRepo.find({
      where: {
        employeeId,
        tenantId,
      },
      relations: {
        employee: {
          department: true,
          designation: true,
        },
      },
      order: {
        date: 'DESC',
      },
    });

    return {
      data: data.map((item) => formatAttendanceResponse(item)),
      shift: effectiveShift,
      total: data.length,
    };
  }

  async getFilteredAttendance(query: any, currentUser: Employee) {
    const {
      date,
      month,
      year,
      employeeId,
      branchId,
      status,
      page = 1,
      limit = 10,
    } = query;

    const pageNumber = Number(page);
    const limitNumber = Number(limit);

    const qb = this.attendanceRepo.createQueryBuilder('attendance');

    this.tenantQueryService.applyTenantFilter(qb, 'attendance');

    qb.leftJoinAndSelect('attendance.employee', 'employee');
    qb.leftJoinAndSelect('employee.department', 'department');
    qb.leftJoinAndSelect('employee.designation', 'designation');

    if (employeeId) {
      qb.andWhere('attendance.employee_id = :employeeId', { employeeId });
    }

    if (branchId) {
      qb.andWhere('employee.branch_id = :branchId', { branchId });
    }

    if (status) {
      qb.andWhere('attendance.status = :status', { status });
    }

    if (query.workStatus) {
      qb.andWhere('attendance.work_status = :workStatus', { workStatus: query.workStatus });
    }

    if (date) {
      qb.andWhere('attendance.date = :date', { date });
    }

    if (month && year) {
      qb.andWhere(
        `
        EXTRACT(MONTH FROM attendance.date) = :month
        AND
        EXTRACT(YEAR FROM attendance.date) = :year
      `,
        {
          month: Number(month),
          year: Number(year),
        },
      );
    }

    this.dataScopeService.applyScope(qb, currentUser, {
      branch: 'employee.branchId',
      department: 'employee.departmentId',
      employee: 'employee.id',
    });

    qb.orderBy('attendance.date', 'DESC');
    qb.skip((pageNumber - 1) * limitNumber);
    qb.take(limitNumber);

    const [data, total] = await qb.getManyAndCount();

    return {
      data: data.map((item) => formatAttendanceResponse(item)),
      meta: {
        total,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(total / limitNumber),
      },
    };
  }

  async getAttendanceCalendar(employeeId: string, month: number, year: number) {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();

    const startDate = dayjs()
      .year(year)
      .month(month - 1)
      .startOf('month')
      .format('YYYY-MM-DD');

    const endDate = dayjs()
      .year(year)
      .month(month - 1)
      .endOf('month')
      .format('YYYY-MM-DD');

    const records = await this.attendanceRepo.find({
      where: {
        employeeId,
        date: Between(startDate, endDate),
        tenantId,
      },
      order: {
        date: 'ASC',
      },
    });

    return buildAttendanceCalendar(records, employeeId, month, year);
  }

  async getTodayAttendance(query: any, currentUser: Employee) {
    const { departmentId, branchId, status, search } = query;
    const today = todayIST();

    const qb = this.attendanceRepo.createQueryBuilder('attendance');

    this.tenantQueryService.applyTenantFilter(qb, 'attendance');

    qb.leftJoinAndSelect('attendance.employee', 'employee');
    qb.leftJoinAndSelect('employee.department', 'department');
    qb.leftJoinAndSelect('employee.designation', 'designation');

    qb.where('attendance.date = :today', { today });

    if (branchId) {
      qb.andWhere('employee.branch_id = :branchId', { branchId });
    }

    if (departmentId) {
      qb.andWhere('employee.department_id = :departmentId', { departmentId });
    }

    if (status) {
      qb.andWhere('attendance.status = :status', { status });
    }

    if (query.workStatus) {
      qb.andWhere('attendance.work_status = :workStatus', { workStatus: query.workStatus });
    }

    if (search) {
      qb.andWhere(
        `
        (
          employee.first_name ILIKE :search
          OR employee.last_name ILIKE :search
          OR employee.employee_code ILIKE :search
        )
      `,
        {
          search: `%${search}%`,
        },
      );
    }

    this.dataScopeService.applyScope(qb, currentUser, {
      branch: 'employee.branchId',
      department: 'employee.departmentId',
      employee: 'employee.id',
    });

    const data = await qb.getMany();

    return {
      data: data.map((item) => ({
        employeeId: item.employeeId,
        employeeCode: item.employee?.employeeCode,
        name: `${item.employee?.firstName} ${item.employee?.lastName}`,
        department: item.employee?.department?.name ?? null,
        designation: item.employee?.designation?.name ?? null,
        profilePhoto: item.employee?.profilePhoto,
        status: item.status,
        checkIn: formatIST(item.checkIn),
        checkOut: formatIST(item.checkOut),
        workedHours: Number((item.workedMinutes / 60).toFixed(2)),
      })),
      summary: {
        present: data.filter((a) => a.status === AttendanceStatus.PRESENT).length,
        late: data.filter((a) => a.status === AttendanceStatus.LATE).length,
        halfDay: data.filter((a) => a.status === AttendanceStatus.HALF_DAY).length,
        leave: data.filter((a) => a.status === AttendanceStatus.LEAVE).length,
        absent: data.filter((a) => a.status === AttendanceStatus.ABSENT).length,
      },
    };
  }
}
