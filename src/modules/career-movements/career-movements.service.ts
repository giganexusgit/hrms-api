import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EmployeeCareerMovement } from './entities/career-movement.entity';
import { CreateCareerMovementDto } from './dto/create-career-movement.dto';
import { Employee } from '../employees/entities/employee.entity';
import { CareerMovementStatusEnum } from '../../common/enums/career-movement-status.enum';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { ActivityAction } from '../activity-log/enums/activity-action.enum';
import { SalaryStructure } from '../salary-structure/entities/salary-structure.entity';
import { TenantQueryService } from "../../common/services/tenant-query.service";
import { DataScopeService } from '../../common/services/data-scope.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../../common/enums/NotificationType.enum';

@Injectable()
export class CareerMovementsService {
  constructor(
    @InjectRepository(EmployeeCareerMovement)
    private readonly movementRepository: Repository<EmployeeCareerMovement>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    private readonly activityLogService: ActivityLogService,
    private readonly dataSource: DataSource, 
    private readonly tenantQueryService: TenantQueryService,
    private readonly dataScopeService: DataScopeService,
    private readonly notificationService: NotificationService,
  ) {}

  async create(
    employeeId: string,
    dto: CreateCareerMovementDto,
    currentUser?: any,
    correlationId?: string,
  ) {
    const currentUserId = currentUser?.id;

    const qb = this.employeeRepository.createQueryBuilder('employee')
      .leftJoinAndSelect('employee.salaryStructures', 'salaryStructures')
      .where('employee.id = :employeeId', { employeeId })
      .andWhere('employee.tenantId = :tenantId', { tenantId: this.tenantQueryService.getTenantWhereClause().tenantId });

    if (currentUser) {
      this.dataScopeService.applyScope(qb, currentUser, {
        branch: 'employee.branchId',
        department: 'employee.departmentId',
      });
    }

    const employee = await qb.getOne();

    if (dto.impactPayroll && !dto.newSalaryStructureId) {
      throw new BadRequestException(
        'If impactPayroll is true, newSalaryStructureId must be provided.',
      );
    }
    if (dto.newSalaryStructureId && !dto.impactPayroll) {
      throw new BadRequestException(
        'If newSalaryStructureId is provided, impactPayroll must be true.',
      );
    }

    if (dto.impactPermissions && !dto.newRoleId) {
      throw new BadRequestException(
        'If impactPermissions is true, newRoleId must be provided.',
      );
    }
    if (dto.newRoleId && !dto.impactPermissions) {
      throw new BadRequestException(
        'If newRoleId is provided, impactPermissions must be true.',
      );
    }

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const activeSalary = employee.salaryStructures?.find((s) => s.isActive);

    const movement = this.movementRepository.create({
      employeeId,
      movementType: dto.movementType,
      effectiveDate: new Date(dto.effectiveDate),
      reason: dto.reason,
      remarks: dto.remarks,
      referenceNumber: dto.referenceNumber,
      attachmentDocumentId: dto.attachmentDocumentId,
      impactPayroll: dto.impactPayroll ?? false,
      impactPermissions: dto.impactPermissions ?? false,
      status: CareerMovementStatusEnum.PENDING,

      // OLD VALUES
      oldBranchId: employee.branchId,
      oldDepartmentId: employee.departmentId,
      oldDesignationId: employee.designationId,
      oldRoleId: employee.roleId,
      oldShiftId: employee.shiftId,
      oldSalaryStructureId: activeSalary ? activeSalary.id : null,

      // NEW VALUES
      newBranchId: dto.newBranchId,
      newDepartmentId: dto.newDepartmentId,
      newDesignationId: dto.newDesignationId,
      newRoleId: dto.newRoleId,
      newShiftId: dto.newShiftId,
      newSalaryStructureId: dto.newSalaryStructureId,

      requestedBy: currentUserId,
      requestedAt: new Date(),
    });

    const savedMovement = await this.movementRepository.save(movement);

    if (currentUserId) {
      await this.activityLogService.logAction({
        userId: currentUserId,
        module: 'Career Movements',
        action: ActivityAction.CREATE,
        description: `Requested ${dto.movementType} for Employee ID ${employeeId}`,
        entityType: 'EmployeeCareerMovement',
        entityId: savedMovement.id,
        correlationId,
      });
    }

    return savedMovement;
  }

  async findAll(employeeId: string, currentUser?: any) {
    const qb = this.movementRepository.createQueryBuilder('movement')
      .leftJoin('movement.employee', 'employee')
      .where('movement.employeeId = :employeeId', { employeeId })
      .andWhere('movement.tenantId = :tenantId', { tenantId: this.tenantQueryService.getTenantWhereClause().tenantId })
      .orderBy('movement.createdAt', 'DESC');

    if (currentUser) {
      this.dataScopeService.applyScope(qb, currentUser, {
        branch: 'employee.branchId',
        department: 'employee.departmentId',
      });
    }

    return qb.getMany();
  }

  async findOne(id: string, currentUser?: any) {
    const qb = this.movementRepository.createQueryBuilder('movement')
      .leftJoin('movement.employee', 'employee')
      .where('movement.id = :id', { id })
      .andWhere('movement.tenantId = :tenantId', { tenantId: this.tenantQueryService.getTenantWhereClause().tenantId });

    if (currentUser) {
      this.dataScopeService.applyScope(qb, currentUser, {
        branch: 'employee.branchId',
        department: 'employee.departmentId',
      });
    }

    const movement = await qb.getOne();
    if (!movement) {
      throw new NotFoundException('Career movement not found');
    }
    return movement;
  }

  async approve(id: string, currentUser?: any, correlationId?: string) {
    const movement = await this.findOne(id, currentUser);
    const currentUserId = currentUser?.id;

    if (movement.status !== CareerMovementStatusEnum.PENDING) {
      throw new BadRequestException('Can only approve PENDING movements');
    }

    movement.status = CareerMovementStatusEnum.APPROVED;
    movement.approvedBy = currentUserId || null;
    movement.approvedAt = new Date();

    const savedMovement = await this.movementRepository.save(movement);

    if (currentUserId) {
      await this.activityLogService.logAction({
        userId: currentUserId,
        module: 'Career Movements',
        action: ActivityAction.UPDATE,
        description: `Approved ${movement.movementType} for Employee ID ${movement.employeeId}`,
        entityType: 'EmployeeCareerMovement',
        entityId: savedMovement.id,
      });
    }

    return savedMovement;
  }

  async execute(id: string, currentUser?: any, correlationId?: string) {
    const movement = await this.findOne(id, currentUser);
    const currentUserId = currentUser?.id;

    if (movement.status !== CareerMovementStatusEnum.APPROVED) {
      throw new BadRequestException(
        'Movement must be APPROVED before execution',
      );
    }

    // Validate Effective Date
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today

    const effectiveDate = new Date(movement.effectiveDate);
    effectiveDate.setHours(0, 0, 0, 0);

    if (effectiveDate > today) {
      throw new BadRequestException('Cannot execute before effective date');
    }

    const qb = this.employeeRepository.createQueryBuilder('employee')
      .leftJoinAndSelect('employee.salaryStructures', 'salaryStructures')
      .where('employee.id = :employeeId', { employeeId: movement.employeeId })
      .andWhere('employee.tenantId = :tenantId', { tenantId: this.tenantQueryService.getTenantWhereClause().tenantId });

    if (currentUser) {
      this.dataScopeService.applyScope(qb, currentUser, {
        branch: 'employee.branchId',
        department: 'employee.departmentId',
      });
    }

    const employee = await qb.getOne();

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Apply New Values (if present)
      if (movement.newBranchId) employee.branchId = movement.newBranchId;
      if (movement.newDepartmentId)
        employee.departmentId = movement.newDepartmentId;
      if (movement.newDesignationId)
        employee.designationId = movement.newDesignationId;
      if (movement.newRoleId) employee.roleId = movement.newRoleId;
      if (movement.newShiftId) employee.shiftId = movement.newShiftId;

      // Handle Salary Structure Swap transactionally
      if (movement.newSalaryStructureId) {
        if (employee.salaryStructures && employee.salaryStructures.length > 0) {
          for (const salary of employee.salaryStructures) {
            salary.isActive = false;
            await queryRunner.manager.save(SalaryStructure, salary);
          }
        }

        const newSalary = await queryRunner.manager.findOne(SalaryStructure, {
          where: { id: movement.newSalaryStructureId },
        });

        if (!newSalary) {
          throw new NotFoundException(
            `New salary structure ${movement.newSalaryStructureId} not found`,
          );
        }

        newSalary.isActive = true;
        newSalary.employeeId = employee.id;
        await queryRunner.manager.save(SalaryStructure, newSalary);

        // INVARIANT CHECK: Enforce that the employee has EXACTLY 1 active salary structure post-execution
        const activeSalaryCount = await queryRunner.manager.count(SalaryStructure, {
          where: { employeeId: employee.id, isActive: true },
        });

        if (activeSalaryCount !== 1) {
          throw new UnprocessableEntityException(
            `Active salary invariant violated for employee ${employee.id}. Expected 1 active structure, found ${activeSalaryCount}. Rolling back transaction.`,
          );
        }
      }

      await queryRunner.manager.save(Employee, employee);

      // Update Movement Status
      movement.status = CareerMovementStatusEnum.EXECUTED;
      movement.executedBy = currentUserId || null;
      movement.executedAt = new Date();

      const savedMovement = await queryRunner.manager.save(
        EmployeeCareerMovement,
        movement,
      );

      await queryRunner.commitTransaction();

      // Notify employee on career movement execution
      await this.notificationService.createNotification({
        employeeId: movement.employeeId,
        type: NotificationType.ANNOUNCEMENT,
        title: 'Career Movement Update',
        message: `Your career movement (${movement.movementType}) has been approved and successfully executed.`,
        referenceId: savedMovement.id,
      });

      if (currentUserId) {
        await this.activityLogService.logAction({
          userId: currentUserId,
          module: 'Career Movements',
          action: ActivityAction.UPDATE,
          description: `Executed ${movement.movementType} for Employee ID ${movement.employeeId}`,
          entityType: 'EmployeeCareerMovement',
          entityId: savedMovement.id,
        });
      }

      return savedMovement;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
