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
        firstName: true,
        lastName: true,
        middleName: true,
        displayName: true,
        profilePhoto: true,
        mobile: true,
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

    const canvasWidth = 600;
    const canvasHeight = 960;
    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');

    // Helper: Rounded Rectangle
    const drawRoundedRect = (
      x: number,
      y: number,
      w: number,
      h: number,
      r: number,
    ) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    };

    // Helper: Aspect-Fill Image Draw
    const drawImageCover = (
      img: any,
      x: number,
      y: number,
      w: number,
      h: number,
    ) => {
      const imgRatio = img.width / img.height;
      const targetRatio = w / h;
      let sWidth = img.width;
      let sHeight = img.height;
      let sx = 0;
      let sy = 0;

      if (imgRatio > targetRatio) {
        sWidth = img.height * targetRatio;
        sx = (img.width - sWidth) / 2;
      } else {
        sHeight = img.width / targetRatio;
        sy = (img.height - sHeight) / 2;
      }

      ctx.drawImage(img, sx, sy, sWidth, sHeight, x, y, w, h);
    };

    // Helper: Resolve image path safely
    const resolveLocalPath = (filePath?: string | null): string | null => {
      if (!filePath) return null;
      if (
        filePath.startsWith('http://') ||
        filePath.startsWith('https://') ||
        filePath.startsWith('data:')
      ) {
        return filePath;
      }
      const clean = filePath.replace(/^[/\\]+/, '');
      const possiblePaths = [
        path.resolve(process.cwd(), clean),
        path.resolve(process.cwd(), 'uploads', clean.replace(/^uploads[/\\]+/, '')),
        path.resolve(__dirname, '../../..', clean),
        path.resolve(__dirname, '../../../../uploads', clean.replace(/^uploads[/\\]+/, '')),
      ];
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) return p;
      }
      return path.resolve(process.cwd(), clean);
    };

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
        orgName = 'GigaNexus';
      }
    }

    // 1. CARD BASE CONTAINER (Rounded Card)
    ctx.save();
    drawRoundedRect(0, 0, canvasWidth, canvasHeight, 28);
    ctx.clip();

    // Clean white background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // 2. MODERN TOP HEADER (Rich Deep Gradient)
    const headerHeight = 220;
    const headerGrad = ctx.createLinearGradient(0, 0, canvasWidth, headerHeight);
    headerGrad.addColorStop(0, '#3B0764'); // Deep Purple
    headerGrad.addColorStop(0.4, '#6B21A8'); // Purple 800
    headerGrad.addColorStop(1, '#9333EA'); // Purple 600

    ctx.fillStyle = headerGrad;
    ctx.fillRect(0, 0, canvasWidth, headerHeight);

    // Background modern angled wave / watermark accent
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.beginPath();
    ctx.arc(550, 40, 180, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(50, 190, 140, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Lanyard slot cutout at top center
    ctx.fillStyle = '#1E1B4B';
    drawRoundedRect(250, 16, 100, 12, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1.5;
    drawRoundedRect(250, 16, 100, 12, 6);
    ctx.stroke();

    // Header Branding & Org Info
    let drewLogo = false;
    if (orgLogoUrl) {
      const resolvedLogo = resolveLocalPath(orgLogoUrl);
      if (resolvedLogo) {
        try {
          const logoImage = await loadImage(resolvedLogo);
          const maxLogoW = 160;
          const maxLogoH = 50;
          const ratio = Math.min(
            maxLogoW / logoImage.width,
            maxLogoH / logoImage.height,
          );
          const logoW = logoImage.width * ratio;
          const logoH = logoImage.height * ratio;
          const logoX = (canvasWidth - logoW) / 2;
          const logoY = 42;

          ctx.drawImage(logoImage, logoX, logoY, logoW, logoH);
          drewLogo = true;

          // Org Name text below logo
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(orgName.toUpperCase(), 300, logoY + logoH + 24);
        } catch (e) {
          drewLogo = false;
        }
      }
    }

    if (!drewLogo) {
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 24px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(orgName.toUpperCase(), 300, 68);
    }

    // Subtitle Badge
    ctx.fillStyle = 'rgba(243, 232, 255, 0.9)';
    ctx.font = '600 11px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('OFFICIAL DIGITAL IDENTIFICATION', 300, 108);

    // Accent line between header & body
    ctx.strokeStyle = '#E9D5FF';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, headerHeight);
    ctx.lineTo(canvasWidth, headerHeight);
    ctx.stroke();

    // 3. EMPLOYEE PHOTO FRAME (Concentric Rings & Rounded Clip)
    const photoCenterX = 300;
    const photoCenterY = 220;
    const photoRadius = 80;

    // Outer Glow / Ring
    ctx.save();
    ctx.beginPath();
    ctx.arc(photoCenterX, photoCenterY, photoRadius + 6, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(147, 51, 234, 0.35)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 4;
    ctx.fill();
    ctx.restore();

    // Purple Accent Ring
    ctx.beginPath();
    ctx.arc(photoCenterX, photoCenterY, photoRadius + 3, 0, Math.PI * 2);
    ctx.strokeStyle = '#9333EA';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Circular Photo
    ctx.save();
    ctx.beginPath();
    ctx.arc(photoCenterX, photoCenterY, photoRadius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    let drewPhoto = false;
    if (employee.profilePhoto) {
      const resolvedPhoto = resolveLocalPath(employee.profilePhoto);
      if (resolvedPhoto) {
        try {
          const profileImage = await loadImage(resolvedPhoto);
          drawImageCover(
            profileImage,
            photoCenterX - photoRadius,
            photoCenterY - photoRadius,
            photoRadius * 2,
            photoRadius * 2,
          );
          drewPhoto = true;
        } catch (err) {
          drewPhoto = false;
        }
      }
    }

    if (!drewPhoto) {
      // Fallback Gradient Initials
      const avatarGrad = ctx.createLinearGradient(
        photoCenterX - photoRadius,
        photoCenterY - photoRadius,
        photoCenterX + photoRadius,
        photoCenterY + photoRadius,
      );
      avatarGrad.addColorStop(0, '#C084FC');
      avatarGrad.addColorStop(1, '#7E22CE');
      ctx.fillStyle = avatarGrad;
      ctx.fillRect(
        photoCenterX - photoRadius,
        photoCenterY - photoRadius,
        photoRadius * 2,
        photoRadius * 2,
      );

      const fInitial = (employee.firstName || 'E').charAt(0).toUpperCase();
      const lInitial = (employee.lastName || '').charAt(0).toUpperCase();
      const initials = `${fInitial}${lInitial}`;

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 56px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(initials, photoCenterX, photoCenterY);
    }
    ctx.restore();

    // 4. EMPLOYEE IDENTITY (Name & Designation Badge)
    const displayName = (
      employee.displayName ||
      `${employee.firstName || ''} ${employee.lastName || ''}`
    ).trim();

    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 24px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(displayName, 300, 335);

    // Designation Pill Badge
    const desigText = (employee.designation?.name || 'EMPLOYEE').toUpperCase();
    ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
    const pillWidth = Math.min(Math.max(ctx.measureText(desigText).width + 36, 130), 400);
    const pillHeight = 28;
    const pillX = 300 - pillWidth / 2;
    const pillY = 348;

    ctx.fillStyle = '#F3E8FF';
    drawRoundedRect(pillX, pillY, pillWidth, pillHeight, 14);
    ctx.fill();
    ctx.strokeStyle = '#D8B4FE';
    ctx.lineWidth = 1;
    drawRoundedRect(pillX, pillY, pillWidth, pillHeight, 14);
    ctx.stroke();

    ctx.fillStyle = '#7E22CE';
    ctx.textAlign = 'center';
    ctx.fillText(desigText, 300, pillY + 18);

    // 5. STRUCTURED DETAILS CARD
    const cardX = 40;
    const cardY = 395;
    const cardW = 520;
    const cardH = 290;

    ctx.fillStyle = '#F8FAFC';
    drawRoundedRect(cardX, cardY, cardW, cardH, 18);
    ctx.fill();

    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1.2;
    drawRoundedRect(cardX, cardY, cardW, cardH, 18);
    ctx.stroke();

    const details = [
      { label: 'Employee ID', value: employee.employeeCode || 'N/A', isBadge: true },
      { label: 'Department', value: employee.department?.name || 'General' },
      { label: 'Branch', value: employee.branch?.name || 'Headquarters' },
      { label: 'Mobile Phone', value: employee.mobile || 'N/A' },
      { label: 'Card Status', value: employee.isActive ? 'ACTIVE' : 'INACTIVE', isStatus: true },
    ];

    const rowStartY = cardY + 36;
    const rowGap = 50;

    details.forEach((item, idx) => {
      const currentY = rowStartY + idx * rowGap;

      // Divider line between rows
      if (idx > 0) {
        ctx.strokeStyle = '#F1F5F9';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cardX + 24, currentY - 24);
        ctx.lineTo(cardX + cardW - 24, currentY - 24);
        ctx.stroke();
      }

      // Label
      ctx.textAlign = 'left';
      ctx.fillStyle = '#64748B';
      ctx.font = '600 13px "Segoe UI", Arial, sans-serif';
      ctx.fillText(item.label.toUpperCase(), cardX + 28, currentY);

      // Value
      ctx.textAlign = 'right';
      if (item.isStatus) {
        // Status Dot + Text
        const isAct = employee.isActive;
        ctx.fillStyle = isAct ? '#16A34A' : '#DC2626';
        ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
        ctx.fillText(item.value, cardX + cardW - 28, currentY);

        ctx.beginPath();
        ctx.arc(cardX + cardW - 28 - ctx.measureText(item.value).width - 10, currentY - 4, 4, 0, Math.PI * 2);
        ctx.fillStyle = isAct ? '#22C55E' : '#EF4444';
        ctx.fill();
      } else if (item.isBadge) {
        ctx.fillStyle = '#0F172A';
        ctx.font = 'bold 15px "Segoe UI", Arial, sans-serif';
        ctx.fillText(item.value, cardX + cardW - 28, currentY);
      } else {
        ctx.fillStyle = '#1E293B';
        ctx.font = '600 14px "Segoe UI", Arial, sans-serif';
        ctx.fillText(item.value, cardX + cardW - 28, currentY);
      }
    });

    // 6. QR CODE & VERIFICATION SECTION
    const qrSectionY = 705;
    try {
      const qrData = JSON.stringify({
        id: employee.id,
        code: employee.employeeCode,
        name: displayName,
        email: employee.email,
        tenantId: employee.tenantId,
        verified: true,
      });

      const qrDataUrl = await QRCode.toDataURL(qrData, {
        width: 130,
        margin: 1,
        color: {
          dark: '#0F172A',
          light: '#FFFFFF',
        },
      });
      const qrImage = await loadImage(qrDataUrl);

      // QR Box Container with soft border
      ctx.fillStyle = '#FFFFFF';
      drawRoundedRect(235, qrSectionY, 130, 130, 14);
      ctx.fill();
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1;
      drawRoundedRect(235, qrSectionY, 130, 130, 14);
      ctx.stroke();

      ctx.drawImage(qrImage, 240, qrSectionY + 5, 120, 120);

      // Micro Verification Text
      ctx.fillStyle = '#94A3B8';
      ctx.font = '600 10px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SCAN TO VERIFY CREDENTIALS', 300, qrSectionY + 150);
    } catch (err) {
      // Fallback if QR fails
    }

    // 7. FOOTER SECURITY BAR
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(0, 890, canvasWidth, 70);

    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 890);
    ctx.lineTo(canvasWidth, 890);
    ctx.stroke();

    ctx.fillStyle = '#64748B';
    ctx.font = '500 11.5px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      'Official Property of Company • If found, please return to HR Office',
      300,
      928,
    );

    // Card Outer Border
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 2;
    drawRoundedRect(1, 1, canvasWidth - 2, canvasHeight - 2, 28);
    ctx.stroke();
    ctx.restore();

    res.setHeader('Content-Type', 'image/png');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="id_card_${employee.employeeCode}.png"`,
    );
    canvas.createPNGStream().pipe(res);
  }
}
