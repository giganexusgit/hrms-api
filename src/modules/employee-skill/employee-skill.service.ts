import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmployeeSkill } from './entities/employee-skill.entity';
import { CreateEmployeeSkillDto } from './dto/create-employee-skill.dto';
import { UpdateEmployeeSkillDto } from './dto/update-employee-skill.dto';
import { TenantQueryService } from '../../common/services/tenant-query.service';
import { DataScopeService } from '../../common/services/data-scope.service';

@Injectable()
export class EmployeeSkillService {
  constructor(
    @InjectRepository(EmployeeSkill)
    private readonly skillRepository: Repository<EmployeeSkill>,
    private readonly tenantQueryService: TenantQueryService,
    private readonly dataScopeService: DataScopeService,
  ) {}

  async create(
    employeeId: string,
    dto: CreateEmployeeSkillDto,
    currentUser?: any,
  ): Promise<EmployeeSkill> {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();

    // Verify employee access
    const qb = this.skillRepository.manager.getRepository('Employee').createQueryBuilder('employee')
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

    const skill = this.skillRepository.create({ ...dto, employeeId, tenantId });
    return this.skillRepository.save(skill);
  }

  async findAllByEmployee(employeeId: string, currentUser?: any): Promise<EmployeeSkill[]> {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();
    const qb = this.skillRepository.createQueryBuilder('skill')
      .leftJoin('skill.employee', 'employee')
      .where('skill.employeeId = :employeeId', { employeeId })
      .andWhere('skill.tenantId = :tenantId', { tenantId })
      .orderBy('skill.year', 'DESC');

    if (currentUser) {
      this.dataScopeService.applyScope(qb, currentUser, {
        branch: 'employee.branchId',
        department: 'employee.departmentId',
        employee: 'skill.employeeId',
      });
    }
    return qb.getMany();
  }

  async findOne(id: string, currentUser?: any): Promise<EmployeeSkill> {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();
    const qb = this.skillRepository.createQueryBuilder('skill')
      .leftJoin('skill.employee', 'employee')
      .where('skill.id = :id', { id })
      .andWhere('skill.tenantId = :tenantId', { tenantId });

    if (currentUser) {
      this.dataScopeService.applyScope(qb, currentUser, {
        branch: 'employee.branchId',
        department: 'employee.departmentId',
        employee: 'skill.employeeId',
      });
    }
    const skill = await qb.getOne();
    if (!skill) {
      throw new NotFoundException('Skill not found or access denied');
    }
    return skill;
  }

  async update(
    id: string,
    dto: UpdateEmployeeSkillDto,
    currentUser?: any,
  ): Promise<EmployeeSkill> {
    const skill = await this.findOne(id, currentUser);
    Object.assign(skill, dto);
    return this.skillRepository.save(skill);
  }

  async remove(id: string, currentUser?: any): Promise<void> {
    const skill = await this.findOne(id, currentUser);
    await this.skillRepository.remove(skill);
  }
}
