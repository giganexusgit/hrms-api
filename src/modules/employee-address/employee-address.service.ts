import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmployeeAddress } from './entities/employee-address.entity';
import { CreateEmployeeAddressDto } from './dto/create-employee-address.dto';
import { UpdateEmployeeAddressDto } from './dto/update-employee-address.dto';
import { TenantQueryService } from '../../common/services/tenant-query.service';
import { DataScopeService } from '../../common/services/data-scope.service';

@Injectable()
export class EmployeeAddressService {
  constructor(
    @InjectRepository(EmployeeAddress)
    private readonly addressRepository: Repository<EmployeeAddress>,
    private readonly tenantQueryService: TenantQueryService,
    private readonly dataScopeService: DataScopeService,
  ) {}

  async create(
    employeeId: string,
    dto: CreateEmployeeAddressDto,
    currentUser?: any,
  ): Promise<EmployeeAddress> {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();

    // Verify employee access
    const qb = this.addressRepository.manager.getRepository('Employee').createQueryBuilder('employee')
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
    const address = this.addressRepository.create({ ...dto, employeeId, tenantId });
    return this.addressRepository.save(address);
  }

  async findAllByEmployee(employeeId: string, currentUser?: any): Promise<EmployeeAddress[]> {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();
    const qb = this.addressRepository.createQueryBuilder('address')
      .leftJoin('address.employee', 'employee')
      .where('address.employeeId = :employeeId', { employeeId })
      .andWhere('address.tenantId = :tenantId', { tenantId })
      .orderBy('address.createdAt', 'DESC');

    if (currentUser) {
      this.dataScopeService.applyScope(qb, currentUser, {
        branch: 'employee.branchId',
        department: 'employee.departmentId',
        employee: 'address.employeeId',
      });
    }
    return qb.getMany();
  }

  async findOne(id: string, currentUser?: any): Promise<EmployeeAddress> {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();
    const qb = this.addressRepository.createQueryBuilder('address')
      .leftJoin('address.employee', 'employee')
      .where('address.id = :id', { id })
      .andWhere('address.tenantId = :tenantId', { tenantId });

    if (currentUser) {
      this.dataScopeService.applyScope(qb, currentUser, {
        branch: 'employee.branchId',
        department: 'employee.departmentId',
        employee: 'address.employeeId',
      });
    }
    const address = await qb.getOne();
    if (!address) {
      throw new NotFoundException('Address not found or access denied');
    }
    return address;
  }

  async update(
    id: string,
    dto: UpdateEmployeeAddressDto,
    currentUser?: any,
  ): Promise<EmployeeAddress> {
    const address = await this.findOne(id, currentUser);

    if (dto.isPrimary && !address.isPrimary) {
      await this.resetPrimaryStatus(address.employeeId);
    }

    Object.assign(address, dto);
    return this.addressRepository.save(address);
  }

  async remove(id: string, currentUser?: any): Promise<void> {
    const address = await this.findOne(id, currentUser);
    await this.addressRepository.remove(address);
  }

  private async resetPrimaryStatus(employeeId: string): Promise<void> {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();
    await this.addressRepository.update(
      { employeeId, tenantId, isPrimary: true },
      { isPrimary: false },
    );
  }
}
