import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Resignation } from './entities/resignation.entity';
import { Employee } from '../employees/entities/employee.entity';
import { OrganizationSettings } from '../organization/entities/organization-settings.entity';
import { CreateResignationDto } from './dto/create-resignation.dto';
import { ApproveResignationDto } from './dto/approve-resignation.dto';
import { ResignationStatusEnum } from '../../common/enums/resignation-status.enum';
import { EmploymentStatusEnum } from '../../common/enums/employment-status.enum';
import { RoleEnum } from '../../common/enums/role.enum';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { ActivityAction } from '../activity-log/enums/activity-action.enum';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import dayjs from 'dayjs';
import { TenantQueryService } from '../../common/services/tenant-query.service';
import { DataScopeService } from '../../common/services/data-scope.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../../common/enums/NotificationType.enum';

@Injectable()
export class ResignationsService {
  constructor(
    @InjectRepository(Resignation)
    private readonly resignationRepository: Repository<Resignation>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(OrganizationSettings)
    private readonly orgSettingsRepository: Repository<OrganizationSettings>,
    private readonly activityLogService: ActivityLogService,
    private readonly dataSource: DataSource,
    private readonly tenantQueryService: TenantQueryService,
    private readonly dataScopeService: DataScopeService,
    private readonly notificationService: NotificationService,
  ) {}

  async create(
    employeeId: string,
    dto: CreateResignationDto,
    currentUserId?: string,
    correlationId?: string,
  ) {
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId },
      relations: { branch: true },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    if (currentUserId) {
       const currentUser = await this.employeeRepository.findOne({ where: { id: currentUserId }, relations: { role: true } });
       if (currentUser) {
         const qb = this.employeeRepository.createQueryBuilder('employee').where('employee.id = :employeeId', { employeeId });
         this.dataScopeService.applyScope(qb, currentUser, {
            branch: 'employee.branchId',
            department: 'employee.departmentId',
            employee: 'employee.id'
         });
         const isAllowed = await qb.getOne();
         if (!isAllowed) throw new ForbiddenException('You are not authorized to submit a resignation for this employee.');
       }
    }

    if (
      employee.employmentStatus === EmploymentStatusEnum.RESIGNED ||
      employee.employmentStatus === EmploymentStatusEnum.TERMINATED
    ) {
      throw new BadRequestException(
        'Employee is already resigned or terminated.',
      );
    }

    // Notice Period Logic
    let isShortfall = false;
    let shortfallReason: string | null = null;

    if (employee.branch?.organizationId) {
      const settings = await this.orgSettingsRepository.findOne({
        where: { organizationId: employee.branch.organizationId },
      });
      if (settings?.noticePeriodDays) {
        const minimumLastWorkingDate = dayjs()
          .add(settings.noticePeriodDays, 'day')
          .startOf('day');
        const requestedDate = dayjs(dto.requestedLastWorkingDate).startOf(
          'day',
        );

        if (requestedDate.isBefore(minimumLastWorkingDate)) {
          isShortfall = true;
          shortfallReason = `Requested date is before the mandatory ${settings.noticePeriodDays} days notice period.`;
        }
      }
    }

    const resignation = this.resignationRepository.create({
      employeeId,
      resignationDate: new Date(),
      requestedLastWorkingDate: new Date(dto.requestedLastWorkingDate),
      reason: dto.reason,
      remarks: dto.remarks,
      status: ResignationStatusEnum.PENDING,
      isShortfall,
      shortfallReason,
    });

    const savedResignation = await this.resignationRepository.save(resignation);

    // Notify employee confirming submission
    await this.notificationService.createNotification({
      employeeId: employee.id,
      type: NotificationType.GENERAL,
      title: 'Resignation Submitted',
      message: `Your resignation request has been received and is currently under review.`,
      referenceId: savedResignation.id,
    });

    if (currentUserId) {
      this.activityLogService.logAction({
        userId: currentUserId,
        module: 'Resignations',
        action: ActivityAction.CREATE,
        description: `Submitted resignation request for Employee ${employeeId}`,
        entityType: 'Resignation',
        entityId: savedResignation.id,
        correlationId,
      });
    }

    return savedResignation;
  }

  async findAll(currentUser?: any) {
    const qb = this.resignationRepository.createQueryBuilder('resignation')
      .leftJoinAndSelect('resignation.employee', 'employee')
      .orderBy('resignation.createdAt', 'DESC');
      
    this.tenantQueryService.applyTenantFilter(qb, 'resignation');
    
    if (currentUser) {
      this.dataScopeService.applyScope(qb, currentUser, {
        branch: 'employee.branchId',
        department: 'employee.departmentId',
        employee: 'employee.id'
      });
    }
    
    return qb.getMany();
  }

  async findByEmployee(employeeId: string, currentUser?: any) {
    const qb = this.resignationRepository.createQueryBuilder('resignation')
      .leftJoinAndSelect('resignation.employee', 'employee')
      .where('resignation.employeeId = :employeeId', { employeeId })
      .orderBy('resignation.createdAt', 'DESC');
      
    this.tenantQueryService.applyTenantFilter(qb, 'resignation');
    
    if (currentUser) {
      this.dataScopeService.applyScope(qb, currentUser, {
        branch: 'employee.branchId',
        department: 'employee.departmentId',
        employee: 'employee.id'
      });
    }
    
    return qb.getMany();
  }

  async findOne(id: string, currentUser?: any) {
    const qb = this.resignationRepository.createQueryBuilder('resignation')
      .leftJoinAndSelect('resignation.employee', 'employee')
      .leftJoinAndSelect('employee.branch', 'branch')
      .where('resignation.id = :id', { id });
      
    this.tenantQueryService.applyTenantFilter(qb, 'resignation');
    
    if (currentUser) {
      this.dataScopeService.applyScope(qb, currentUser, {
        branch: 'employee.branchId',
        department: 'employee.departmentId',
        employee: 'employee.id'
      });
    }
    
    const resignation = await qb.getOne();

    if (!resignation) {
      throw new NotFoundException('Resignation request not found');
    }
    return resignation;
  }

  async approve(
    id: string,
    dto: ApproveResignationDto,
    currentUserId: string,
    correlationId?: string,
  ) {
    const currentUser = await this.employeeRepository.findOne({
      where: { id: currentUserId },
      relations: { role: true },
    });

    const resignation = await this.findOne(id, currentUser);

    if (resignation.status !== ResignationStatusEnum.PENDING) {
      throw new BadRequestException(
        'Only PENDING resignations can be approved.',
      );
    }

    if (resignation.employeeId === currentUserId) {
      throw new ForbiddenException(
        'You cannot approve your own resignation request.',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      resignation.status = ResignationStatusEnum.APPROVED;
      resignation.approvedLastWorkingDate = dto.approvedLastWorkingDate
        ? new Date(dto.approvedLastWorkingDate)
        : resignation.requestedLastWorkingDate;

      if (dto.shortfallReason) {
        resignation.shortfallReason = dto.shortfallReason;
      }

      resignation.approvedBy = currentUserId;
      resignation.approvedAt = new Date();

      const savedResignation = await queryRunner.manager.save(
        Resignation,
        resignation,
      );

      const employee = await queryRunner.manager.findOne(Employee, {
        where: { id: resignation.employeeId },
      });
      if (employee) {
        employee.employmentStatus = EmploymentStatusEnum.NOTICE_PERIOD;
        await queryRunner.manager.save(Employee, employee);
      }

      await queryRunner.commitTransaction();

      // Notify employee on approval
      await this.notificationService.createNotification({
        employeeId: resignation.employeeId,
        type: NotificationType.GENERAL,
        title: 'Resignation Request Approved',
        message: `Your resignation request has been approved. Approved last working date: ${savedResignation.approvedLastWorkingDate ? dayjs(savedResignation.approvedLastWorkingDate).format('YYYY-MM-DD') : 'N/A'}.`,
        referenceId: savedResignation.id,
      });

      if (currentUserId) {
        this.activityLogService.logAction({
          userId: currentUserId,
          module: 'Resignations',
          action: ActivityAction.APPROVE,
          description: `Approved resignation for Employee ${resignation.employeeId}`,
          entityType: 'Resignation',
          entityId: savedResignation.id,
          correlationId,
        });
      }

      return this.findOne(id);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async execute(id: string, currentUserId: string, correlationId?: string) {
    const currentUser = await this.employeeRepository.findOne({
      where: { id: currentUserId },
      relations: { role: true },
    });

    const resignation = await this.findOne(id, currentUser);

    if (resignation.status !== ResignationStatusEnum.APPROVED) {
      throw new BadRequestException(
        'Only APPROVED resignations can be executed.',
      );
    }

    if (
      resignation.approvedLastWorkingDate &&
      dayjs()
        .startOf('day')
        .isBefore(dayjs(resignation.approvedLastWorkingDate).startOf('day'))
    ) {
      throw new BadRequestException(
        'Cannot execute resignation before the approved last working date.',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      resignation.status = ResignationStatusEnum.EXECUTED;
      resignation.executedBy = currentUserId;
      resignation.executedAt = new Date();

      const savedResignation = await queryRunner.manager.save(
        Resignation,
        resignation,
      );

      const employee = await queryRunner.manager.findOne(Employee, {
        where: { id: resignation.employeeId },
      });
      if (employee) {
        employee.employmentStatus = EmploymentStatusEnum.RESIGNED;
        employee.isActive = false; // Disable login / active status
        await queryRunner.manager.save(Employee, employee);

        // Revoke active refresh tokens
        await queryRunner.manager.update(
          RefreshToken,
          { employeeId: employee.id, isRevoked: false },
          { isRevoked: true },
        );
      }

      await queryRunner.commitTransaction();

      // Notify employee on exit completion
      await this.notificationService.createNotification({
        employeeId: resignation.employeeId,
        type: NotificationType.GENERAL,
        title: 'Exit Completed',
        message: `Your exit process has been finalized. Thank you for your contributions.`,
        referenceId: savedResignation.id,
      });

      if (currentUserId) {
        this.activityLogService.logAction({
          userId: currentUserId,
          module: 'Resignations',
          action: ActivityAction.UPDATE, // Using UPDATE as EXECUTED isn't in ActivityAction
          description: `Executed exit process for Employee ${resignation.employeeId}`,
          entityType: 'Resignation',
          entityId: savedResignation.id,
          correlationId,
        });
      }

      return this.findOne(id);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}
