import { Injectable } from '@nestjs/common';

import { UpdateNotificationPreferenceDto } from './dto/update-notification-preference.dto';
import { CreateNotificationPreferenceDto } from './dto/create-notification-preference.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { NotificationPreference } from './entities/notification-preference.entity';
import { Repository } from 'typeorm';
import { TenantQueryService } from "../../common/services/tenant-query.service";

@Injectable()
export class NotificationPreferenceService {
  constructor(
    @InjectRepository(NotificationPreference)
    private preferenceRepo: Repository<NotificationPreference>, private readonly tenantQueryService: TenantQueryService
  ) {}
  async getPreferences(employee: any) {
    const tenantId = employee.tenantId || this.tenantQueryService.getTenantWhereClause()?.tenantId;
    let preference = await this.preferenceRepo.findOne({
      where: {
        employeeId: employee.id,
        ...(tenantId ? { tenantId } : {}),
      },
    });

    if (!preference) {
      preference = await this.preferenceRepo.save(
        this.preferenceRepo.create({
          employeeId: employee.id,
          ...(tenantId ? { tenantId } : {}),
        }),
      );
    }

    return preference;
  }

  async updatePreferences(
    employee: any,
    dto: UpdateNotificationPreferenceDto,
  ) {
    const tenantId = employee.tenantId || this.tenantQueryService.getTenantWhereClause()?.tenantId;
    let preference = await this.preferenceRepo.findOne({
      where: {
        employeeId: employee.id,
        ...(tenantId ? { tenantId } : {}),
      },
    });

    if (!preference) {
      preference = this.preferenceRepo.create({
        employeeId: employee.id,
        ...(tenantId ? { tenantId } : {}),
      });
    }

    Object.assign(preference, dto);

    const saved = await this.preferenceRepo.save(preference);

    return saved;
  }
}
