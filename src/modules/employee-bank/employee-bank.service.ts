import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmployeeBank } from './entities/employee-bank.entity';
import { CreateEmployeeBankDto } from './dto/create-employee-bank.dto';
import { UpdateEmployeeBankDto } from './dto/update-employee-bank.dto';
import { TenantQueryService } from '../../common/services/tenant-query.service';
import { DataScopeService } from '../../common/services/data-scope.service';

@Injectable()
export class EmployeeBankService {
  constructor(
    @InjectRepository(EmployeeBank)
    private readonly bankRepository: Repository<EmployeeBank>,
    private readonly tenantQueryService: TenantQueryService,
    private readonly dataScopeService: DataScopeService,
  ) {}

  async create(
    employeeId: string,
    dto: CreateEmployeeBankDto,
    currentUser?: any,
  ): Promise<EmployeeBank> {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();

    // Verify employee access
    const qb = this.bankRepository.manager.getRepository('Employee').createQueryBuilder('employee')
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

    if (dto.isPrimary) {
      await this.resetPrimaryStatus(employeeId);
    }
    const bank = this.bankRepository.create({ ...dto, employeeId, tenantId });
    return this.bankRepository.save(bank);
  }

  async findAllByEmployee(employeeId: string, currentUser?: any): Promise<EmployeeBank[]> {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();
    const qb = this.bankRepository.createQueryBuilder('bank')
      .leftJoin('bank.employee', 'employee')
      .where('bank.employeeId = :employeeId', { employeeId })
      .andWhere('bank.tenantId = :tenantId', { tenantId })
      .orderBy('bank.createdAt', 'DESC');

    if (currentUser) {
      this.dataScopeService.applyScope(qb, currentUser, {
        branch: 'employee.branchId',
        department: 'employee.departmentId',
        employee: 'bank.employeeId',
      });
    }
    return qb.getMany();
  }

  async findOne(id: string, currentUser?: any): Promise<EmployeeBank> {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();
    const qb = this.bankRepository.createQueryBuilder('bank')
      .leftJoin('bank.employee', 'employee')
      .where('bank.id = :id', { id })
      .andWhere('bank.tenantId = :tenantId', { tenantId });

    if (currentUser) {
      this.dataScopeService.applyScope(qb, currentUser, {
        branch: 'employee.branchId',
        department: 'employee.departmentId',
        employee: 'bank.employeeId',
      });
    }
    const bank = await qb.getOne();
    if (!bank) {
      throw new NotFoundException('Bank account not found or access denied');
    }
    return bank;
  }

  async update(id: string, dto: UpdateEmployeeBankDto, currentUser?: any): Promise<EmployeeBank> {
    const bank = await this.findOne(id, currentUser);

    if (dto.isPrimary && !bank.isPrimary) {
      await this.resetPrimaryStatus(bank.employeeId);
    }

    Object.assign(bank, dto);
    return this.bankRepository.save(bank);
  }

  async remove(id: string, currentUser?: any): Promise<void> {
    const bank = await this.findOne(id, currentUser);
    await this.bankRepository.remove(bank);
  }

  private async resetPrimaryStatus(employeeId: string): Promise<void> {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();
    await this.bankRepository.update(
      { employeeId, tenantId, isPrimary: true },
      { isPrimary: false },
    );
  }
}
