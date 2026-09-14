import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Between, Repository, IsNull } from 'typeorm';

import { Holiday } from './entities/holiday.entity';
import { Employee } from '../employees/entities/employee.entity';
import { CreateHolidayDto } from './dto/create-holiday.dto';
import { UpdateHolidayDto } from './dto/update-holiday.dto';
import { TenantQueryService } from "../../common/services/tenant-query.service";
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../../common/enums/NotificationType.enum';

@Injectable()
export class HolidayService {
  constructor(
    @InjectRepository(Holiday)
    private readonly holidayRepo: Repository<Holiday>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    private readonly tenantQueryService: TenantQueryService,
    private readonly notificationService: NotificationService,
  ) {}

  async create(dto: CreateHolidayDto) {
    const existing = await this.holidayRepo.findOne({
      where: {
        date: dto.date,
        tenantId: this.tenantQueryService.getTenantWhereClause().tenantId,
      },
    });

    if (existing) {
      throw new BadRequestException('Holiday already exists on this date');
    }

    const { tenantId } = this.tenantQueryService.getTenantWhereClause();

    const savedHoliday = await this.holidayRepo.save({
      name: dto.name.trim(),
      date: dto.date,
      type: dto.type,
      isPaid: dto.isPaid,
      description: dto.description?.trim() || null,
      tenantId,
    });

    // Broadcast new holiday announcement to active employees
    try {
      const employees = await this.employeeRepo.find({
        where: {
          isActive: true,
          deletedAt: IsNull(),
          tenantId,
        },
        select: { id: true },
      });

      for (const emp of employees) {
        await this.notificationService.createNotification({
          employeeId: emp.id,
          type: NotificationType.HOLIDAY,
          title: 'Upcoming Holiday Added',
          message: `A new holiday "${savedHoliday.name}" has been scheduled for ${savedHoliday.date}.`,
          referenceId: savedHoliday.id,
        });
      }
    } catch (e) {
      // Non-blocking notification
    }

    return savedHoliday;
  }

  async findAll(query: any) {
    const { month, year, type } = query;

    const qb = this.holidayRepo.createQueryBuilder('holiday');
    this.tenantQueryService.applyTenantFilter(qb, 'holiday');

    if (month && year) {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;

      const endDate = `${year}-${String(month).padStart(2, '0')}-31`;

      qb.andWhere('holiday.date BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    }

    if (type) {
      qb.andWhere('holiday.type = :type', {
        type,
      });
    }

    qb.orderBy('holiday.date', 'ASC');

    return qb.getMany();
  }

  async findOne(id: string) {
    const holiday = await this.holidayRepo.findOne({
      where: {
        id,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
    });

    if (!holiday) {
      throw new NotFoundException('Holiday not found');
    }

    return holiday;
  }

  async update(id: string, dto: UpdateHolidayDto) {
    const holiday = await this.findOne(id);

    if (dto.date && dto.date !== holiday.date) {
      const existing = await this.holidayRepo.findOne({
        where: {
          date: dto.date,
            tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
        },
      });

      if (existing) {
        throw new BadRequestException('Holiday already exists on this date');
      }
    }

    Object.assign(holiday, {
      ...dto,

      name: dto.name?.trim() ?? holiday.name,

      description: dto.description?.trim() ?? holiday.description,
    });

    return this.holidayRepo.save(holiday);
  }

  async remove(id: string) {
    const holiday = await this.findOne(id);

    await this.holidayRepo.remove(holiday);

    return {
      message: 'Holiday deleted successfully',
    };
  }
}
