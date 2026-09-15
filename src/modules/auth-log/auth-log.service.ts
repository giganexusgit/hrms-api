import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthLog, AuthEvent, AuthStatus } from './entities/auth-log.entity';
import { TenantQueryService } from '../../common/services/tenant-query.service';
import { DataScopeService } from '../../common/services/data-scope.service';
import { Employee } from '../employees/entities/employee.entity';

@Injectable()
export class AuthLogService {
  private readonly logger = new Logger(AuthLogService.name);

  constructor(
    @InjectRepository(AuthLog)
    private readonly authLogRepository: Repository<AuthLog>,
    private readonly tenantQueryService: TenantQueryService,
    private readonly dataScopeService: DataScopeService,
  ) {}

  logEvent(data: {
    userId?: string;
    sessionId?: string;
    tenantId?: string;
    branchId?: string;
    event: AuthEvent;
    status: AuthStatus;
    ipAddress?: string;
    device?: string;
    reason?: string;
  }): void {
    setImmediate(async () => {
      try {
        const newLog = this.authLogRepository.create(data);
        await this.authLogRepository.save(newLog);
      } catch (error) {
        this.logger.error(
          `Failed to save auth log: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  }

  async findAll(query: any = {}, currentUser?: Employee) {
    const { page = 1, limit = 10, search, userId, event, status } = query;
    const qb = this.authLogRepository.createQueryBuilder('authLog');

    this.tenantQueryService.applyTenantFilter(qb, 'authLog');
    qb.leftJoinAndMapOne('authLog.employee', Employee, 'employee', 'employee.id = authLog.userId');

    if (currentUser) {
      this.dataScopeService.applyScope(qb, currentUser, {
        branch: 'authLog.branchId',
        employee: 'authLog.userId',
      });
    }

    if (search) {
      qb.andWhere(
        '(authLog.ipAddress ILIKE :search OR authLog.device ILIKE :search OR authLog.reason ILIKE :search OR employee.first_name ILIKE :search OR employee.last_name ILIKE :search OR employee.email ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (userId) {
      qb.andWhere('authLog.userId = :userId', { userId });
    }
    if (event && event !== 'ALL') {
      qb.andWhere('authLog.event = :event', { event });
    }
    if (status && status !== 'ALL') {
      qb.andWhere('authLog.status = :status', { status });
    }

    qb.orderBy('authLog.createdAt', 'DESC');

    qb.skip((Number(page) - 1) * Number(limit));
    qb.take(Number(limit));

    const [data, total] = await qb.getManyAndCount();

    const mappedItems = data.map((item: any) => {
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
        userName: emp ? `${emp.firstName || ''} ${emp.lastName || ''}`.trim() : (item.userId || 'System User'),
        employeeCode: emp?.employeeCode || 'EMP-101',
      };
    });

    return {
      data: mappedItems,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
    };
  }
}
