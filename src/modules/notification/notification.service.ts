import { Injectable, NotFoundException } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { Notification } from './entities/notification.entity';

import { CreateNotificationDto } from './dto/create-notification.dto';

import { NotificationQueryDto } from './dto/notification-query.dto';
import { NotificationType } from '../../common/enums/NotificationType.enum';
import { NotificationPreference } from '../notification-preference/entities/notification-preference.entity';
import { TenantQueryService } from '../../common/services/tenant-query.service';

import { Employee } from '../employees/entities/employee.entity';
import { PermissionEnum } from '../../common/enums/permission.enum';

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private notificationRepo: Repository<Notification>,

    @InjectRepository(NotificationPreference)
    private preferenceRepo: Repository<NotificationPreference>,
    private readonly tenantQueryService: TenantQueryService,
  ) {}

  private mapNotification(notification: Notification) {
    return {
      id: notification.id,

      title: notification.title,

      message: notification.message,

      type: notification.type,

      referenceId: notification.referenceId,

      isRead: notification.isRead,

      createdAt: notification.createdAt,
    };
  }

  async createNotification(dto: CreateNotificationDto) {
    const canSend = await this.canSendNotification(
      dto.employeeId,

      dto.type,
    );

    // preference disabled
    if (!canSend) {
      return null;
    }

    const notification = this.notificationRepo.create({
      ...dto,
      tenantId: this.tenantQueryService.getTenantWhereClause().tenantId,
    });

    const saved = await this.notificationRepo.save(notification);

    return this.mapNotification(saved);
  }

  async notifyUsersWithPermission(params: {
    permission: PermissionEnum | PermissionEnum[] | string | string[];
    title: string;
    message: string;
    type: NotificationType;
    referenceId?: string;
    excludeEmployeeId?: string;
  }) {
    try {
      const { tenantId } = this.tenantQueryService.getTenantWhereClause();
      const permissions = Array.isArray(params.permission)
        ? params.permission
        : [params.permission];

      const qb = this.notificationRepo.manager
        .getRepository(Employee)
        .createQueryBuilder('employee')
        .innerJoin('employee.role', 'role')
        .leftJoin('role.permissions', 'permission')
        .where('employee.tenantId = :tenantId', { tenantId })
        .andWhere('employee.isActive = true')
        .andWhere('employee.deletedAt IS NULL')
        .andWhere(
          '(role.name = :superAdminRole OR role.isProtected = true OR permission.name IN (:...permissions))',
          {
            superAdminRole: 'SUPER_ADMIN',
            permissions,
          },
        );

      if (params.excludeEmployeeId) {
        qb.andWhere('employee.id != :excludeEmployeeId', {
          excludeEmployeeId: params.excludeEmployeeId,
        });
      }

      const employees = await qb.getMany();

      const notificationPromises = employees.map((emp) =>
        this.createNotification({
          employeeId: emp.id,
          title: params.title,
          message: params.message,
          type: params.type,
          referenceId: params.referenceId,
        }),
      );

      await Promise.allSettled(notificationPromises);
    } catch (error) {
      console.error('Failed to notify users with permission:', error);
    }
  }

  async findAll(employee: any, query: NotificationQueryDto) {
    const page = query.page ?? 1;

    const limit = Math.min(query.limit ?? 10, 50);

    const where: any = {
      employeeId: employee.id,
      tenantId: this.tenantQueryService.getTenantWhereClause().tenantId,
    };

    // unread filter
    if (query.unreadOnly === 'true') {
      where.isRead = false;
    }

    const [notifications, total] = await this.notificationRepo.findAndCount({
      where,

      order: {
        createdAt: 'DESC',
      },

      skip: (page - 1) * limit,

      take: limit,
    });

    return {
      data: notifications.map((notification) =>
        this.mapNotification(notification),
      ),

      meta: {
        total,
        page,
        limit,

        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, employee: any) {
    const notification = await this.notificationRepo.findOne({
      where: {
        id,

        employeeId: employee.id,
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return this.mapNotification(notification);
  }

  async markAsRead(id: string, employee: any) {
    const notification = await this.notificationRepo.findOne({
      where: {
        id,

        employeeId: employee.id,
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.isRead) {
      return {
        message: 'Notification already read',
      };
    }

    notification.isRead = true;

    await this.notificationRepo.save(notification);

    return {
      message: 'Notification marked as read',
    };
  }

  async markAllAsRead(employee: any) {
    await this.notificationRepo.update(
      {
        employeeId: employee.id,

        isRead: false,
        tenantId: this.tenantQueryService.getTenantWhereClause().tenantId,
      },

      {
        isRead: true,
      },
    );

    return {
      message: 'All notifications marked as read',
    };
  }

  async getUnreadCount(employee: any) {
    const count = await this.notificationRepo.count({
      where: {
        employeeId: employee.id,

        isRead: false,
      },
    });

    return {
      unreadCount: count,
    };
  }

  async remove(id: string, employee: any) {
    const notification = await this.notificationRepo.findOne({
      where: {
        id,

        employeeId: employee.id,
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    await this.notificationRepo.remove(notification);

    return {
      message: 'Notification deleted successfully',
    };
  }

  private async canSendNotification(
    employeeId: string,

    type: NotificationType,
  ) {
    const preference = await this.preferenceRepo.findOne({
      where: {
        employeeId,
      },
    });

    // no preference found
    // allow by default
    if (!preference) {
      return true;
    }

    const typeMap = {
      TASK: preference.task,

      LEAVE: preference.leave,

      ATTENDANCE: preference.attendance,

      PAYROLL: preference.payroll,

      PROJECT: preference.project,

      TEAM: preference.team,

      STANDUP: preference.standup,

      HOLIDAY: preference.holiday,

      TRAINING: preference.training,

      INTERVIEW: preference.interview,

      ANNOUNCEMENT: preference.announcement,

      GENERAL: true,
    };

    return typeMap[type] ?? true;
  }
}
