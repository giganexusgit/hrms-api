import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmployeeFamily } from './entities/employee-family.entity';
import { CreateEmployeeFamilyDto } from './dto/create-employee-family.dto';
import { UpdateEmployeeFamilyDto } from './dto/update-employee-family.dto';
import { TenantQueryService } from '../../common/services/tenant-query.service';
import { DataScopeService } from '../../common/services/data-scope.service';

@Injectable()
export class EmployeeFamilyService {
  constructor(
    @InjectRepository(EmployeeFamily)
    private readonly familyRepository: Repository<EmployeeFamily>,
    private readonly tenantQueryService: TenantQueryService,
    private readonly dataScopeService: DataScopeService,
  ) {}

  async create(
    employeeId: string,
    dto: CreateEmployeeFamilyDto,
    currentUser?: any,
  ): Promise<EmployeeFamily> {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();

    // Verify employee access
    const qb = this.familyRepository.manager.getRepository('Employee').createQueryBuilder('employee')
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

    const familyMember = this.familyRepository.create({ ...dto, employeeId, tenantId });
    return this.familyRepository.save(familyMember);
  }

  async findAllByEmployee(employeeId: string, currentUser?: any): Promise<EmployeeFamily[]> {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();
    const qb = this.familyRepository.createQueryBuilder('family')
      .leftJoin('family.employee', 'employee')
      .where('family.employeeId = :employeeId', { employeeId })
      .andWhere('family.tenantId = :tenantId', { tenantId })
      .orderBy('family.createdAt', 'DESC');

    if (currentUser) {
      this.dataScopeService.applyScope(qb, currentUser, {
        branch: 'employee.branchId',
        department: 'employee.departmentId',
        employee: 'family.employeeId',
      });
    }
    return qb.getMany();
  }

  async findOne(id: string, currentUser?: any): Promise<EmployeeFamily> {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();
    const qb = this.familyRepository.createQueryBuilder('family')
      .leftJoin('family.employee', 'employee')
      .where('family.id = :id', { id })
      .andWhere('family.tenantId = :tenantId', { tenantId });

    if (currentUser) {
      this.dataScopeService.applyScope(qb, currentUser, {
        branch: 'employee.branchId',
        department: 'employee.departmentId',
        employee: 'family.employeeId',
      });
    }
    const familyMember = await qb.getOne();
    if (!familyMember) {
      throw new NotFoundException('Family member not found or access denied');
    }
    return familyMember;
  }

  async update(
    id: string,
    dto: UpdateEmployeeFamilyDto,
    currentUser?: any,
  ): Promise<EmployeeFamily> {
    const familyMember = await this.findOne(id, currentUser);
    Object.assign(familyMember, dto);
    return this.familyRepository.save(familyMember);
  }

  async remove(id: string, currentUser?: any): Promise<void> {
    const familyMember = await this.findOne(id, currentUser);
    await this.familyRepository.remove(familyMember);
  }
}
