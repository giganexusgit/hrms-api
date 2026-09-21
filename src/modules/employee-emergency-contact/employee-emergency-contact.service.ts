import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmployeeEmergencyContact } from './entities/employee-emergency-contact.entity';
import { CreateEmployeeEmergencyContactDto } from './dto/create-employee-emergency-contact.dto';
import { UpdateEmployeeEmergencyContactDto } from './dto/update-employee-emergency-contact.dto';
import { TenantQueryService } from '../../common/services/tenant-query.service';
import { DataScopeService } from '../../common/services/data-scope.service';

@Injectable()
export class EmployeeEmergencyContactService {
  constructor(
    @InjectRepository(EmployeeEmergencyContact)
    private readonly contactRepository: Repository<EmployeeEmergencyContact>,
    private readonly tenantQueryService: TenantQueryService,
    private readonly dataScopeService: DataScopeService,
  ) {}

  async create(
    employeeId: string,
    dto: CreateEmployeeEmergencyContactDto,
    currentUser?: any,
  ): Promise<EmployeeEmergencyContact> {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();

    // Verify employee access
    const qb = this.contactRepository.manager.getRepository('Employee').createQueryBuilder('employee')
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
    const contact = this.contactRepository.create({ ...dto, employeeId, tenantId });
    return this.contactRepository.save(contact);
  }

  async findAllByEmployee(
    employeeId: string,
    currentUser?: any,
  ): Promise<EmployeeEmergencyContact[]> {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();
    const qb = this.contactRepository.createQueryBuilder('contact')
      .leftJoin('contact.employee', 'employee')
      .where('contact.employeeId = :employeeId', { employeeId })
      .andWhere('contact.tenantId = :tenantId', { tenantId })
      .orderBy('contact.createdAt', 'DESC');

    if (currentUser) {
      this.dataScopeService.applyScope(qb, currentUser, {
        branch: 'employee.branchId',
        department: 'employee.departmentId',
        employee: 'contact.employeeId',
      });
    }
    return qb.getMany();
  }

  async findOne(id: string, currentUser?: any): Promise<EmployeeEmergencyContact> {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();
    const qb = this.contactRepository.createQueryBuilder('contact')
      .leftJoin('contact.employee', 'employee')
      .where('contact.id = :id', { id })
      .andWhere('contact.tenantId = :tenantId', { tenantId });

    if (currentUser) {
      this.dataScopeService.applyScope(qb, currentUser, {
        branch: 'employee.branchId',
        department: 'employee.departmentId',
        employee: 'contact.employeeId',
      });
    }
    const contact = await qb.getOne();
    if (!contact) {
      throw new NotFoundException('Emergency contact not found or access denied');
    }
    return contact;
  }

  async update(
    id: string,
    dto: UpdateEmployeeEmergencyContactDto,
    currentUser?: any,
  ): Promise<EmployeeEmergencyContact> {
    const contact = await this.findOne(id, currentUser);

    if (dto.isPrimary && !contact.isPrimary) {
      await this.resetPrimaryStatus(contact.employeeId);
    }

    Object.assign(contact, dto);
    return this.contactRepository.save(contact);
  }

  async remove(id: string, currentUser?: any): Promise<void> {
    const contact = await this.findOne(id, currentUser);
    await this.contactRepository.remove(contact);
  }

  private async resetPrimaryStatus(employeeId: string): Promise<void> {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();
    await this.contactRepository.update(
      { employeeId, tenantId, isPrimary: true },
      { isPrimary: false },
    );
  }
}
