import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { ActivityLog } from './entities/activity-log.entity';
import { SearchActivityLogDto } from './dto/search-activity-log.dto';
import { TenantQueryService } from '../../common/services/tenant-query.service';
import { DataScopeService } from '../../common/services/data-scope.service';
import { Employee } from '../employees/entities/employee.entity';

@Injectable()
export class ActivityLogService {
  private readonly logger = new Logger(ActivityLogService.name);

  constructor(
    @InjectRepository(ActivityLog)
    private readonly activityLogRepository: Repository<ActivityLog>,
    private readonly tenantQueryService: TenantQueryService,
    private readonly dataScopeService: DataScopeService,
  ) {}

  /**
   * Logs a new activity asynchronously (fire-and-forget).
   */
  logAction(data: Partial<ActivityLog>): void {
    setImmediate(async () => {
      try {
        const newLog = this.activityLogRepository.create(data);
        await this.activityLogRepository.save(newLog);
      } catch (error) {
        this.logger.error(
          `Failed to save activity log: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  }

  /**
   * Searches and filters activity logs with pagination.
   */
  async searchLogs(searchDto: SearchActivityLogDto & { search?: string }, currentUser?: Employee) {
    const {
      search,
      userId,
      module,
      entityType,
      entityId,
      action,
      status,
      requestMethod,
      ipAddress,
      startDate,
      endDate,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = searchDto;

    const queryBuilder: SelectQueryBuilder<ActivityLog> =
      this.activityLogRepository.createQueryBuilder('log');

    this.tenantQueryService.applyTenantFilter(queryBuilder, 'log');
    queryBuilder.leftJoinAndMapOne('log.employee', Employee, 'employee', 'employee.id = log.userId OR employee.id = log.employeeId');

    if (currentUser) {
      this.dataScopeService.applyScope(queryBuilder, currentUser, {
        branch: 'log.branchId',
        employee: 'log.userId',
      });
    }

    if (search) {
      queryBuilder.andWhere(
        '(log.description ILIKE :search OR log.requestPath ILIKE :search OR log.module ILIKE :search OR log.ipAddress ILIKE :search OR employee.first_name ILIKE :search OR employee.last_name ILIKE :search OR employee.email ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (userId) {
      queryBuilder.andWhere('log.userId = :userId', { userId });
    }
    if (module) {
      queryBuilder.andWhere('log.module ILIKE :module', { module: `%${module}%` });
    }
    if (entityType) {
      queryBuilder.andWhere('log.entityType = :entityType', { entityType });
    }
    if (entityId) {
      queryBuilder.andWhere('log.entityId = :entityId', { entityId });
    }
    if (action) {
      queryBuilder.andWhere('log.action = :action', { action });
    }
    if (status) {
      queryBuilder.andWhere('log.status = :status', { status });
    }
    if (requestMethod) {
      queryBuilder.andWhere('log.requestMethod = :requestMethod', {
        requestMethod,
      });
    }
    if (ipAddress) {
      queryBuilder.andWhere('log.ipAddress = :ipAddress', { ipAddress });
    }
    if (startDate) {
      queryBuilder.andWhere('log.createdAt >= :startDate', { startDate });
    }
    if (endDate) {
      queryBuilder.andWhere('log.createdAt <= :endDate', { endDate });
    }

    // Pagination
    const skip = (Number(page) - 1) * Number(limit);
    queryBuilder.skip(skip).take(Number(limit));

    // Sorting
    queryBuilder.orderBy(`log.${sortBy}`, sortOrder as 'ASC' | 'DESC');

    const [items, total] = await queryBuilder.getManyAndCount();

    // Map employee into user field for frontend compatibility
    const mappedItems = items.map((item: any) => {
      const emp = item.employee;
      return {
        ...item,
        user: emp ? {
          id: emp.id,
          firstName: emp.firstName,
          lastName: emp.lastName,
          email: emp.email,
          employeeCode: emp.employeeCode,
        } : null,
        userEmail: emp?.email || null,
        userName: emp ? `${emp.firstName || ''} ${emp.lastName || ''}`.trim() : null,
      };
    });

    return {
      data: mappedItems,
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    };
  }

  async getApprovalLogs(searchDto: any, currentUser?: Employee) {
    const qb = this.activityLogRepository.createQueryBuilder('log');
    this.tenantQueryService.applyTenantFilter(qb, 'log');

    qb.leftJoinAndMapOne('log.employee', Employee, 'employee', 'employee.id = log.userId OR employee.id = log.employeeId');
    qb.andWhere("(log.action IN ('APPROVE', 'REJECT', 'EXECUTE') OR log.description ILIKE '%approve%' OR log.description ILIKE '%reject%' OR log.description ILIKE '%resignation%' OR log.description ILIKE '%movement%')");

    if (currentUser) {
      this.dataScopeService.applyScope(qb, currentUser, {
        branch: 'log.branchId',
        employee: 'log.userId',
      });
    }

    const page = Number(searchDto.page || 1);
    const limit = Number(searchDto.limit || 10);
    qb.skip((page - 1) * limit).take(limit);
    qb.orderBy('log.createdAt', 'DESC');

    const [items, total] = await qb.getManyAndCount();

    const mappedItems = items.map((item: any) => {
      const emp = item.employee;
      return {
        ...item,
        user: emp ? {
          id: emp.id,
          firstName: emp.firstName,
          lastName: emp.lastName,
          email: emp.email,
        } : null,
        userName: emp ? `${emp.firstName || ''} ${emp.lastName || ''}`.trim() : 'System Evaluator',
      };
    });

    return {
      data: mappedItems,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}

