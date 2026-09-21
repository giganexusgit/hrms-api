import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmployeeExperience } from './entities/employee-experience.entity';
import { CreateEmployeeExperienceDto } from './dto/create-employee-experience.dto';
import { UpdateEmployeeExperienceDto } from './dto/update-employee-experience.dto';
import { TenantQueryService } from '../../common/services/tenant-query.service';
import { DataScopeService } from '../../common/services/data-scope.service';

@Injectable()
export class EmployeeExperienceService {
  constructor(
    @InjectRepository(EmployeeExperience)
    private readonly experienceRepository: Repository<EmployeeExperience>,
    private readonly tenantQueryService: TenantQueryService,
    private readonly dataScopeService: DataScopeService,
  ) {}

  async create(
    employeeId: string,
    dto: CreateEmployeeExperienceDto,
    currentUser?: any,
  ): Promise<EmployeeExperience> {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();

    // Verify employee access
    const qb = this.experienceRepository.manager.getRepository('Employee').createQueryBuilder('employee')
      .where('employee.id = :employeeId', { employeeId })
      .andWhere('employee.tenantId = :tenantId', { tenantId });
    if (currentUser) {
      this.dataScopeService.applyScope(qb, currentUser, {
        branch: 'employee.branchId',
        department: 'employee.departmentId',
        employee: 'employee.id',
      });
    }
    const emp = await qb.getOne();
    if (!emp) throw new NotFoundException('Employee not found or access denied');

    const experience = this.experienceRepository.create({ ...dto, employeeId, tenantId });
    return this.experienceRepository.save(experience);
  }

  async findAllByEmployee(employeeId: string, currentUser?: any): Promise<EmployeeExperience[]> {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();
    const qb = this.experienceRepository.createQueryBuilder('experience')
      .leftJoin('experience.employee', 'employee')
      .where('experience.employeeId = :employeeId', { employeeId })
      .andWhere('experience.tenantId = :tenantId', { tenantId })
      .orderBy('experience.fromDate', 'DESC');

    if (currentUser) {
      this.dataScopeService.applyScope(qb, currentUser, {
        branch: 'employee.branchId',
        department: 'employee.departmentId',
        employee: 'experience.employeeId',
      });
    }
    return qb.getMany();
  }

  async findOne(id: string, currentUser?: any): Promise<EmployeeExperience> {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();
    const qb = this.experienceRepository.createQueryBuilder('experience')
      .leftJoin('experience.employee', 'employee')
      .where('experience.id = :id', { id })
      .andWhere('experience.tenantId = :tenantId', { tenantId });

    if (currentUser) {
      this.dataScopeService.applyScope(qb, currentUser, {
        branch: 'employee.branchId',
        department: 'employee.departmentId',
        employee: 'experience.employeeId',
      });
    }
    const experience = await qb.getOne();
    if (!experience) {
      throw new NotFoundException('Experience record not found or access denied');
    }
    return experience;
  }

  async update(
    id: string,
    dto: UpdateEmployeeExperienceDto,
    currentUser?: any,
  ): Promise<EmployeeExperience> {
    const experience = await this.findOne(id, currentUser);
    Object.assign(experience, dto);
    return this.experienceRepository.save(experience);
  }

  async remove(id: string, currentUser?: any): Promise<void> {
    const experience = await this.findOne(id, currentUser);
    await this.experienceRepository.remove(experience);
  }
}
