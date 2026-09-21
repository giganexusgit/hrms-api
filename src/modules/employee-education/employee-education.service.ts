import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmployeeEducation } from './entities/employee-education.entity';
import { CreateEmployeeEducationDto } from './dto/create-employee-education.dto';
import { UpdateEmployeeEducationDto } from './dto/update-employee-education.dto';
import { TenantQueryService } from '../../common/services/tenant-query.service';
import { DataScopeService } from '../../common/services/data-scope.service';

@Injectable()
export class EmployeeEducationService {
  constructor(
    @InjectRepository(EmployeeEducation)
    private readonly educationRepository: Repository<EmployeeEducation>,
    private readonly tenantQueryService: TenantQueryService,
    private readonly dataScopeService: DataScopeService,
  ) {}

  async create(
    employeeId: string,
    dto: CreateEmployeeEducationDto,
    currentUser?: any,
  ): Promise<EmployeeEducation> {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();

    // Verify employee access
    const qb = this.educationRepository.manager.getRepository('Employee').createQueryBuilder('employee')
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

    const education = this.educationRepository.create({ ...dto, employeeId, tenantId });
    return this.educationRepository.save(education);
  }

  async findAllByEmployee(employeeId: string, currentUser?: any): Promise<EmployeeEducation[]> {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();
    const qb = this.educationRepository.createQueryBuilder('education')
      .leftJoin('education.employee', 'employee')
      .where('education.employeeId = :employeeId', { employeeId })
      .andWhere('education.tenantId = :tenantId', { tenantId })
      .orderBy('education.passingYear', 'DESC');

    if (currentUser) {
      this.dataScopeService.applyScope(qb, currentUser, {
        branch: 'employee.branchId',
        department: 'employee.departmentId',
        employee: 'education.employeeId',
      });
    }
    return qb.getMany();
  }

  async findOne(id: string, currentUser?: any): Promise<EmployeeEducation> {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();
    const qb = this.educationRepository.createQueryBuilder('education')
      .leftJoin('education.employee', 'employee')
      .where('education.id = :id', { id })
      .andWhere('education.tenantId = :tenantId', { tenantId });

    if (currentUser) {
      this.dataScopeService.applyScope(qb, currentUser, {
        branch: 'employee.branchId',
        department: 'employee.departmentId',
        employee: 'education.employeeId',
      });
    }
    const education = await qb.getOne();
    if (!education) {
      throw new NotFoundException('Education record not found or access denied');
    }
    return education;
  }

  async update(
    id: string,
    dto: UpdateEmployeeEducationDto,
    currentUser?: any,
  ): Promise<EmployeeEducation> {
    const education = await this.findOne(id, currentUser);
    Object.assign(education, dto);
    return this.educationRepository.save(education);
  }

  async remove(id: string, currentUser?: any): Promise<void> {
    const education = await this.findOne(id, currentUser);
    await this.educationRepository.remove(education);
  }
}
