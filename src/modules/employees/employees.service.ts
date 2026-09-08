import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Employee } from './entities/employee.entity';
import { Organization } from '../organization/entities/organization.entity';
import type { Response } from 'express';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { GetEmployeesDto } from './dto/get-employees.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { Department } from '../departments/entities/department.entity';
import { Designation } from '../designations/entities/designation.entity';
import { Role } from '../roles/entities/role.entity';
import { Branch } from '../organization/entities/branch.entity';
import { Shift } from '../shift/entities/shift.entity';
import { extname } from 'path';
import * as fs from 'fs';
import { createCanvas, loadImage } from 'canvas';
import * as QRCode from 'qrcode';
import * as path from 'path';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { DataScopeService } from '../../common/services/data-scope.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { ActivityAction } from '../activity-log/enums/activity-action.enum';
import { TenantQueryService } from '../../common/services/tenant-query.service';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee)
    private employeeRepository: Repository<Employee>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    @InjectRepository(Designation)
    private readonly designationRepository: Repository<Designation>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @InjectRepository(Shift)
    private readonly shiftRepository: Repository<Shift>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly dataScopeService: DataScopeService,
    private readonly activityLogService: ActivityLogService,
    private readonly tenantQueryService: TenantQueryService,
  ) {}

  async generateEmployeeCode(tenantId: string): Promise<string> {
    const result = await this.employeeRepository
      .createQueryBuilder('employee')
      .select(
        `MAX(CAST(SUBSTRING(employee.employee_code FROM 5) AS INTEGER))`,
        'maxNum',
      )
      .where('employee.employee_code LIKE :prefix', { prefix: 'EMP-%' })
      .andWhere('employee.tenant_id = :tenantId', { tenantId })
      .withDeleted()
      .getRawOne<{ maxNum: string | null }>();

    const maxNumber = result?.maxNum ? parseInt(result.maxNum, 10) : 0;
    const nextNumber = maxNumber + 1;
    return `EMP-${String(nextNumber).padStart(3, '0')}`;
  }

  private validateAuthorityLevel(
    currentUser: Employee | undefined,
    targetAuthorityLevel: number,
    action: string,
  ) {
    if (!currentUser || !currentUser.role) return;
    if (currentUser.role.authorityLevel >= 100) return; // Super Admin bypass

    if (targetAuthorityLevel >= currentUser.role.authorityLevel) {
      throw new ForbiddenException(
        `You cannot ${action} an employee with an equal or higher authority level`,
      );
    }
  }

  async create(dto: CreateEmployeeDto, currentUser?: Employee) {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();

    dto.email = dto.email.trim().toLowerCase();

    const existingEmail = await this.employeeRepository.findOne({
      where: {
        email: dto.email,
        deletedAt: IsNull(),
        tenantId,
      },
    });

    if (existingEmail) {
      throw new ConflictException(`Email '${dto.email}' already exists in this tenant`);
    }

    const existingMobile = await this.employeeRepository.findOne({
      where: {
        mobile: dto.mobile,
        deletedAt: IsNull(),
        tenantId,
      },
    });

    if (existingMobile) {
      throw new ConflictException(`Mobile '${dto.mobile}' already exists in this tenant`);
    }

    const role = await this.roleRepository.findOne({
      where: {
        id: dto.roleId,
        deletedAt: IsNull(),
        isActive: true,
        tenantId,
      },
    });

    if (!role) {
      throw new NotFoundException('Role not found in this tenant');
    }

    if (currentUser) {
      this.validateAuthorityLevel(currentUser, role.authorityLevel, 'create');
    }

    if (dto.branchId) {
      const branch = await this.branchRepository.findOne({
        where: { id: dto.branchId, tenantId },
      });
      if (!branch) {
        throw new NotFoundException('Branch not found in this tenant');
      }
    }

    if (dto.shiftId) {
      const shift = await this.shiftRepository.findOne({
        where: { id: dto.shiftId, tenantId },
      });
      if (!shift) {
        throw new NotFoundException('Shift not found in this tenant');
      }
    }

    if (dto.designationId && !dto.departmentId) {
      throw new BadRequestException(
        'Department is required when designation is selected',
      );
    }

    let department: Department | null = null;

    if (dto.departmentId) {
      if (!dto.branchId) {
        throw new BadRequestException(
          'Branch is required when department is selected',
        );
      }

      department = await this.departmentRepository.findOne({
        where: {
          id: dto.departmentId,
          deletedAt: IsNull(),
          isActive: true,
          tenantId,
        },
      });

      if (!department) {
        throw new NotFoundException('Department not found in this tenant');
      }

      if (department.branchId && department.branchId !== dto.branchId) {
        throw new BadRequestException(
          'Selected department does not belong to the selected branch',
        );
      }
    }

    let designation: Designation | null = null;

    if (dto.designationId) {
      designation = await this.designationRepository.findOne({
        where: {
          id: dto.designationId,
          deletedAt: IsNull(),
          isActive: true,
          tenantId,
        },
        relations: {
          department: true,
        },
      });

      if (!designation) {
        throw new NotFoundException('Designation not found in this tenant');
      }

      if (dto.departmentId && designation.departmentId !== dto.departmentId) {
        throw new BadRequestException(
          'Designation does not belong to selected department',
        );
      }
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const employeeCode = await this.generateEmployeeCode(tenantId);

    const employee = this.employeeRepository.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      middleName: dto.middleName,
      displayName: dto.displayName,
      email: dto.email,
      personalEmail: dto.personalEmail,
      mobile: dto.mobile,
      alternatePhone: dto.alternatePhone,
      password: hashedPassword,
      roleId: dto.roleId,
      branchId: dto.branchId,
      departmentId: dto.departmentId,
      designationId: dto.designationId,
      shiftId: dto.shiftId,
      joiningDate: dto.joiningDate,
      employmentType: dto.employmentType,
      employmentStatus: dto.employmentStatus,
      workLocation: dto.workLocation,
      maritalStatus: dto.maritalStatus,
      gender: dto.gender,
      dateOfBirth: dto.dateOfBirth,
      employeeCode,
      tenantId,
    });

    try {
      await this.employeeRepository.save(employee);
      return this.findOne(employee.id);
    } catch (error: any) {
      if (error.code === '23505') {
        if (error.detail?.includes('email')) {
          throw new ConflictException('Email already exists');
        }

        if (error.detail?.includes('mobile')) {
          throw new ConflictException('Mobile already exists');
        }

        if (error.detail?.includes('employee_code')) {
          throw new ConflictException('Employee code already exists');
        }

        throw new ConflictException('Employee already exists');
      }

      throw error;
    }
  }

  async assignRole(id: string, roleId: string, currentUser?: Employee) {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();

    const employee = await this.employeeRepository.findOne({
      where: { id, tenantId, deletedAt: IsNull() },
      relations: { role: true },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    if (
      currentUser &&
      currentUser.id === employee.id &&
      (currentUser.role?.authorityLevel ?? 0) < 100
    ) {
      throw new ForbiddenException('You cannot change your own role.');
    }

    if (currentUser && employee.role) {
      this.validateAuthorityLevel(currentUser, employee.role.authorityLevel, 'change role of');
    }

    const role = await this.roleRepository.findOne({
      where: { id: roleId, tenantId, deletedAt: IsNull(), isActive: true },
    });

    if (!role) {
      throw new NotFoundException('Role not found or is inactive');
    }

    if (currentUser) {
      this.validateAuthorityLevel(currentUser, role.authorityLevel, 'assign role of');
    }

    employee.roleId = roleId;
    employee.role = role;
    await this.employeeRepository.save(employee);

    return {
      message: 'Role assigned successfully',
      employeeId: employee.id,
      roleId: role.id,
    };
  }

  async findByIdentifier(identifier: string) {
    return this.employeeRepository.findOne({
      where: [
        { email: identifier },
        { employeeCode: identifier },
      ],
      relations: {
        role: {
          permissions: true,
        },
      },
      select: {
        id: true,
        tenantId: true,
        email: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        middleName: true,
        displayName: true,
        profilePhoto: true,
        password: true,
        passwordVersion: true,
        roleId: true,
        isActive: true,
        role: {
          id: true,
          name: true,
          permissions: true,
        },
      },
    });
  }

  async findById(id: string) {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();

    return this.employeeRepository.findOne({
      where: { id, tenantId },
      relations: {
        role: {
          permissions: true,
        },
        addresses: true,
        emergencyContacts: true,
        families: true,
        educations: true,
        experiences: true,
        skills: true,
        banks: true,
        department: true,
        designation: true,
        branch: true,
      },
    });
  }

  async findByIdForAuth(id: string) {
    return this.employeeRepository.findOne({
      where: { id },
      relations: {
        role: {
          permissions: true,
        },
      },
      select: {
        id: true,
        tenantId: true,
        email: true,
        employeeCode: true,
        isActive: true,
        roleId: true,
        branchId: true,
        departmentId: true,
        role: {
          id: true,
          name: true,
          dataScope: true,
          authorityLevel: true,
          permissions: true,
        },
      },
    });
  }

  async findAll(query: GetEmployeesDto, currentUser: Employee) {
    const {
      page = '1',
      limit = '10',
      search,
      roleId,
      branchId,
      isActive,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
      departmentId,
      designationId,
      gender,
      employmentType,
    } = query;

    const pageNumber = Math.max(Number(page), 1);
    const limitNumber = Math.min(Math.max(Number(limit), 1), 100);

    const sortableColumns = {
      createdAt: 'employee.created_at',
      firstName: 'employee.first_name',
      lastName: 'employee.last_name',
      email: 'employee.email',
      employeeCode: 'employee.employee_code',
      mobile: 'employee.mobile',
    };

    const orderBy = sortableColumns[sortBy] ?? 'employee.created_at';

    const queryBuilder = this.employeeRepository
      .createQueryBuilder('employee')
      .distinct(true)
      .leftJoinAndSelect('employee.role', 'role')
      .leftJoinAndSelect('employee.department', 'department')
      .leftJoinAndSelect('employee.designation', 'designation')
      .leftJoinAndSelect('employee.branch', 'branch')
      .leftJoinAndSelect('role.permissions', 'permissions');

    this.tenantQueryService.applyTenantFilter(queryBuilder, 'employee');

    if (search) {
      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('employee.first_name ILIKE :search')
            .orWhere('employee.last_name ILIKE :search')
            .orWhere('employee.email ILIKE :search')
            .orWhere('employee.employee_code ILIKE :search')
            .orWhere('employee.mobile ILIKE :search');
        }),
        {
          search: `%${search.trim()}%`,
        },
      );
    }

    if (roleId) {
      queryBuilder.andWhere('role.id = :roleId', { roleId });
    }

    if (branchId) {
      queryBuilder.andWhere('employee.branch_id = :branchId', { branchId });
    }

    if (departmentId) {
      queryBuilder.andWhere('department.id = :departmentId', {
        departmentId,
      });
    }

    if (designationId) {
      queryBuilder.andWhere('designation.id = :designationId', {
        designationId,
      });
    }

    if (gender) {
      queryBuilder.andWhere('employee.gender = :gender', {
        gender,
      });
    }

    if (employmentType) {
      queryBuilder.andWhere('employee.employment_type = :employmentType', {
        employmentType,
      });
    }

    if (isActive !== undefined) {
      queryBuilder.andWhere('employee.is_active = :isActive', {
        isActive: isActive === 'true',
      });
    }

    this.dataScopeService.applyScope(queryBuilder, currentUser, {
      branch: 'employee.branchId',
      department: 'employee.departmentId',
      employee: 'employee.id',
    });

    queryBuilder.orderBy(orderBy, sortOrder);
    queryBuilder.skip((pageNumber - 1) * limitNumber);
    queryBuilder.take(limitNumber);

    const [employees, total] = await queryBuilder.getManyAndCount();

    return {
      data: employees,
      meta: {
        page: pageNumber,
        limit: limitNumber,
        total,
        totalPages: Math.ceil(total / limitNumber),
      },
    };
  }

  async findOne(id: string, currentUser?: Employee) {
    const queryBuilder = this.employeeRepository
      .createQueryBuilder('employee')
      .leftJoinAndSelect('employee.role', 'role')
      .leftJoinAndSelect('role.permissions', 'permissions')
      .leftJoinAndSelect('employee.addresses', 'addresses')
      .leftJoinAndSelect('employee.emergencyContacts', 'emergencyContacts')
      .leftJoinAndSelect('employee.families', 'families')
      .leftJoinAndSelect('employee.educations', 'educations')
      .leftJoinAndSelect('employee.experiences', 'experiences')
      .leftJoinAndSelect('employee.skills', 'skills')
      .leftJoinAndSelect('employee.banks', 'banks')
      .leftJoinAndSelect('employee.department', 'department')
      .leftJoinAndSelect('employee.designation', 'designation')
      .leftJoinAndSelect('employee.branch', 'branch')
      .where('employee.id = :id', { id });

    this.tenantQueryService.applyTenantFilter(queryBuilder, 'employee');

    if (currentUser) {
      this.dataScopeService.applyScope(queryBuilder, currentUser, {
        branch: 'employee.branchId',
        department: 'employee.departmentId',
        employee: 'employee.id',
      });
    }

    const employee = await queryBuilder.getOne();

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return employee;
  }

  async update(id: string, dto: UpdateEmployeeDto, currentUser?: Employee) {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();

    const employee = await this.employeeRepository.findOne({
      where: { id, tenantId, deletedAt: IsNull() },
      relations: { role: true },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    if (currentUser && employee.role) {
      this.validateAuthorityLevel(currentUser, employee.role.authorityLevel, 'modify');
    }

    const targetRoleId = dto.roleId;
    if (targetRoleId) {
      const newRole = await this.roleRepository.findOne({
        where: { id: targetRoleId, tenantId, deletedAt: IsNull(), isActive: true },
      });
      if (!newRole) throw new NotFoundException('Role not found');

      if (targetRoleId !== employee.roleId) {
        if (
          currentUser &&
          currentUser.id === employee.id &&
          (currentUser.role?.authorityLevel ?? 0) < 100
        ) {
          throw new ForbiddenException('You cannot change your own role.');
        }

        if (currentUser) {
          this.validateAuthorityLevel(currentUser, newRole.authorityLevel, 'assign role of');
        }
      }

      employee.roleId = targetRoleId;
      employee.role = newRole;
    }

    if (dto.email) {
      dto.email = dto.email.trim().toLowerCase();

      const existingEmail = await this.employeeRepository.findOne({
        where: { email: dto.email, tenantId, deletedAt: IsNull() },
      });

      if (existingEmail && existingEmail.id !== id) {
        throw new ConflictException(`Email '${dto.email}' already exists`);
      }
    }

    if (dto.mobile) {
      const existingMobile = await this.employeeRepository.findOne({
        where: { mobile: dto.mobile, tenantId, deletedAt: IsNull() },
      });

      if (existingMobile && existingMobile.id !== id) {
        throw new ConflictException(`Mobile '${dto.mobile}' already exists`);
      }
    }

    if (dto.password) {
      dto.password = await bcrypt.hash(dto.password, 10);
    }

    const branchId =
      dto.branchId !== undefined ? dto.branchId : employee.branchId;
    const departmentId =
      dto.departmentId !== undefined ? dto.departmentId : employee.departmentId;
    const shiftId =
      dto.shiftId !== undefined ? dto.shiftId : employee.shiftId;

    if (branchId) {
      const branch = await this.branchRepository.findOne({
        where: { id: branchId, tenantId },
      });
      if (!branch) throw new NotFoundException('Branch not found in this tenant');
    }

    if (shiftId) {
      const shift = await this.shiftRepository.findOne({
        where: { id: shiftId, tenantId },
      });
      if (!shift) throw new NotFoundException('Shift not found in this tenant');
    }

    if (departmentId) {
      if (!branchId) {
        throw new BadRequestException(
          'Branch is required when department is selected',
        );
      }
      const department = await this.departmentRepository.findOne({
        where: { id: departmentId, tenantId, deletedAt: IsNull(), isActive: true },
      });
      if (!department) throw new NotFoundException('Department not found in this tenant');
      if (department.branchId && department.branchId !== branchId) {
        throw new BadRequestException(
          'Selected department does not belong to the selected branch',
        );
      }
    }

    Object.assign(employee, dto);

    await this.employeeRepository.save(employee);

    if (dto.isActive === false) {
      await this.refreshTokenRepository.update(
        { employeeId: employee.id, isRevoked: false },
        { isRevoked: true },
      );
    }

    return this.findOne(employee.id);
  }

  async uploadProfilePhoto(id: string, file: Express.Multer.File) {
    const employee = await this.findOne(id);

    if (!file) {
      throw new BadRequestException('Photo is required');
    }

    const extension = extname(file.originalname);
    const newFileName = `${employee.employeeCode}_profile_${Date.now()}${extension}`;
    const oldPath = file.path;
    const newPath = `uploads/profiles/${newFileName}`;

    fs.renameSync(oldPath, newPath);

    employee.profilePhoto = `/uploads/profiles/${newFileName}`;

    await this.employeeRepository.save(employee);

    return {
      message: 'Profile photo uploaded successfully',
      profilePhoto: employee.profilePhoto,
    };
  }

  async remove(id: string, currentUser?: Employee) {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();

    const employee = await this.employeeRepository.findOne({
      where: { id, tenantId, deletedAt: IsNull() },
      relations: { role: true },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    if (currentUser && employee.role) {
      this.validateAuthorityLevel(currentUser, employee.role.authorityLevel, 'delete');
    }

    await this.employeeRepository.softDelete(id);

    return {
      message: 'Employee deleted successfully',
    };
  }

  async restore(id: string) {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();

    const employee = await this.employeeRepository.findOne({
      where: { id, tenantId },
      withDeleted: true,
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    await this.employeeRepository.restore(id);

    return {
      message: 'Employee restored successfully',
    };
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.employeeRepository.update(id, {
      lastLoginAt: new Date(),
    });
  }

  async generateIdCard(id: string, res: Response<any>) {
    const { tenantId } = this.tenantQueryService.getTenantWhereClause();

    const employee = await this.employeeRepository.findOne({
      where: { id, tenantId },
      relations: {
        department: true,
        designation: true,
        branch: {
          organization: true,
        },
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const canvas = createCanvas(600, 950);
    const ctx = canvas.getContext('2d');

    let orgName = employee.branch?.organization?.name;
    let orgLogoUrl = employee.branch?.organization?.logoUrl;

    if (!orgName) {
      const org = await this.employeeRepository.manager.findOne(Organization, {
        where: { tenantId },
        order: { createdAt: 'ASC' },
      });
      if (org) {
        orgName = org.name;
        orgLogoUrl = org.logoUrl;
      } else {
        orgName = 'GIGA SYSTEM';
      }
    }

    // BACKGROUND
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 600, 950);

    // HEADER
    ctx.fillStyle = '#1E40AF';
    ctx.fillRect(0, 0, 600, 200);

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';

    if (orgLogoUrl) {
      try {
        const logoPath = path.join(process.cwd(), orgLogoUrl);
        const logoImage = await loadImage(logoPath);

        const maxLogoWidth = 200;
        const maxLogoHeight = 90;
        const ratio = Math.min(
          maxLogoWidth / logoImage.width,
          maxLogoHeight / logoImage.height,
        );

        const logoWidth = logoImage.width * ratio;
        const logoHeight = logoImage.height * ratio;
        const logoX = (600 - logoWidth) / 2;
        const logoY = 30;

        ctx.drawImage(logoImage, logoX, logoY, logoWidth, logoHeight);

        ctx.font = 'bold 26px Arial';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(orgName.toUpperCase(), 300, logoY + logoHeight + 40);
      } catch (err) {
        ctx.font = 'bold 36px Arial';
        ctx.fillText(orgName.toUpperCase(), 300, 115);
      }
    } else {
      ctx.font = 'bold 36px Arial';
      ctx.fillText(orgName.toUpperCase(), 300, 115);
    }

    // PROFILE PHOTO (CIRCULAR)
    ctx.save();
    ctx.beginPath();
    ctx.arc(300, 310, 110, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();

    if (employee.profilePhoto) {
      try {
        const imagePath = path.join(process.cwd(), employee.profilePhoto);
        const profileImage = await loadImage(imagePath);
        ctx.drawImage(profileImage, 190, 200, 220, 220);
      } catch (err) {
        ctx.fillStyle = '#CBD5E1';
        ctx.fillRect(190, 200, 220, 220);
        ctx.fillStyle = '#64748B';
        ctx.font = 'bold 80px Arial';
        ctx.fillText(employee.firstName.charAt(0).toUpperCase(), 300, 340);
      }
    } else {
      ctx.fillStyle = '#CBD5E1';
      ctx.fillRect(190, 200, 220, 220);
      ctx.fillStyle = '#64748B';
      ctx.font = 'bold 80px Arial';
      ctx.fillText(employee.firstName.charAt(0).toUpperCase(), 300, 340);
    }
    ctx.restore();

    // CIRCULAR BORDER
    ctx.beginPath();
    ctx.arc(300, 310, 110, 0, Math.PI * 2, true);
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#1E40AF';
    ctx.stroke();

    // NAME & DESIGNATION
    const fullName = `${employee.firstName} ${employee.lastName}`.trim();
    ctx.fillStyle = '#1E293B';
    ctx.font = 'bold 32px Arial';
    ctx.fillText(fullName, 300, 460);

    ctx.fillStyle = '#2563EB';
    ctx.font = 'bold 22px Arial';
    ctx.fillText((employee.designation?.name || 'Employee').toUpperCase(), 300, 495);

    // DETAILS LIST
    const startY = 550;
    const lineHeight = 45;
    ctx.textAlign = 'left';
    ctx.font = '18px Arial';

    const details = [
      { label: 'Employee ID', value: employee.employeeCode },
      { label: 'Department', value: employee.department?.name || 'N/A' },
      { label: 'Branch', value: employee.branch?.name || 'N/A' },
      { label: 'Mobile', value: employee.mobile || 'N/A' },
    ];

    details.forEach((item, index) => {
      const currentY = startY + index * lineHeight;
      ctx.fillStyle = '#64748B';
      ctx.fillText(`${item.label}:`, 100, currentY);

      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 18px Arial';
      ctx.fillText(item.value, 260, currentY);
      ctx.font = '18px Arial';
    });

    // QR CODE GENERATION
    try {
      const qrData = JSON.stringify({
        id: employee.id,
        code: employee.employeeCode,
        name: fullName,
        email: employee.email,
      });

      const qrDataUrl = await QRCode.toDataURL(qrData, {
        width: 120,
        margin: 1,
      });
      const qrImage = await loadImage(qrDataUrl);
      ctx.drawImage(qrImage, 240, 740, 120, 120);
    } catch (err) {
      // Fallback if QR fails
    }

    // FOOTER
    ctx.fillStyle = '#F1F5F9';
    ctx.fillRect(0, 880, 600, 70);

    ctx.fillStyle = '#64748B';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('If found, please return to company head office.', 300, 920);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="id_card_${employee.employeeCode}.png"`,
    );
    canvas.createPNGStream().pipe(res);
  }
}
