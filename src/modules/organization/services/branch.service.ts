import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Branch } from '../entities/branch.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { CreateBranchDto } from '../dto/create-branch.dto';
import { UpdateBranchDto } from '../dto/update-branch.dto';
import { OrganizationService } from './organization.service';
import { TenantQueryService } from '../../../common/services/tenant-query.service';
import { DataScopeService } from '../../../common/services/data-scope.service';

@Injectable()
export class BranchService {
  constructor(
    @InjectRepository(Branch)
    private readonly branchRepo: Repository<Branch>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    private readonly organizationService: OrganizationService,
    private readonly tenantQueryService: TenantQueryService,
    private readonly dataScopeService: DataScopeService,
  ) {}

  async create(createDto: CreateBranchDto, userId?: string) {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();
    const org = await this.organizationService.get();

    // Validate single head office per tenant/org
    if (createDto.isHeadOffice) {
      const existingHeadOffice = await this.branchRepo.findOne({
        where: { organizationId: org.id, tenantId, isHeadOffice: true },
      });
      if (existingHeadOffice) {
        throw new BadRequestException(
          'A Head Office already exists for this organization. Only one Head Office is allowed.',
        );
      }
    }

    // Auto-generate code if not provided
    if (!createDto.code) {
      const prefix = createDto.isHeadOffice ? 'HQ' : 'BR';
      const branchCount = await this.branchRepo.count({
        where: { tenantId },
      });
      createDto.code = `${prefix}-${String(branchCount + 1).padStart(3, '0')}`;
    }

    const branch = this.branchRepo.create({
      ...createDto,
      organizationId: org.id,
      tenantId,                // ← was missing — root cause of the null constraint error
      createdByUserId: userId,
    });

    try {
      return await this.branchRepo.save(branch);
    } catch (error: any) {
      if (error.code === '23505') {
        throw new ConflictException(
          'A branch with this code or email already exists.',
        );
      }
      throw error;
    }
  }

  async update(id: string, updateDto: UpdateBranchDto, userId?: string) {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();
    const branch = await this.branchRepo.findOne({ where: { id, tenantId } });
    if (!branch) throw new NotFoundException('Branch not found');

    // Validate single head office
    if (updateDto.isHeadOffice) {
      const existingHeadOffice = await this.branchRepo.findOne({
        where: { organizationId: branch.organizationId, tenantId, isHeadOffice: true },
      });
      if (existingHeadOffice && existingHeadOffice.id !== branch.id) {
        throw new BadRequestException(
          'Another Head Office already exists for this organization. Only one Head Office is allowed.',
        );
      }
    }

    Object.assign(branch, updateDto, { updatedByUserId: userId });

    try {
      return await this.branchRepo.save(branch);
    } catch (error: any) {
      if (error.code === '23505') {
        throw new ConflictException(
          'A branch with this code or email already exists.',
        );
      }
      throw error;
    }
  }

  async findAll(currentUser?: any) {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();
    const org = await this.organizationService.get();
    
    const qb = this.branchRepo.createQueryBuilder('branch')
      .where('branch.organizationId = :orgId', { orgId: org.id })
      .andWhere('branch.tenantId = :tenantId', { tenantId });

    if (currentUser) {
      this.dataScopeService.applyScope(qb, currentUser, {
        branch: 'branch.id',
      });
    }

    return qb.getMany();
  }

  async findOne(id: string) {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();
    const branch = await this.branchRepo.findOne({ where: { id, tenantId } });
    if (!branch) throw new NotFoundException('Branch not found');
    return branch;
  }

  async delete(id: string, userId?: string) {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();
    const branch = await this.branchRepo.findOne({ where: { id, tenantId } });
    if (!branch) throw new NotFoundException('Branch not found');

    if (branch.isHeadOffice) {
      throw new BadRequestException(
        'Cannot delete the Head Office branch. Please designate another branch as Head Office first.',
      );
    }

    const employeeCount = await this.employeeRepo.count({
      where: {
        branch: { id },
        tenantId,
        deletedAt: IsNull(),
      },
    });

    if (employeeCount > 0) {
      throw new BadRequestException(
        `Cannot delete branch '${branch.name}' because ${employeeCount} active employee(s) are currently assigned to it. Please reassign the employees first.`,
      );
    }

    branch.deletedByUserId = userId;
    await this.branchRepo.softRemove(branch);

    return { message: 'Branch deleted successfully' };
  }
}
