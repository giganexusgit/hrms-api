import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EmployeeFamilyService } from './employee-family.service';
import { CreateEmployeeFamilyDto } from './dto/create-employee-family.dto';
import { UpdateEmployeeFamilyDto } from './dto/update-employee-family.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PermissionEnum } from 'src/common/enums/permission.enum';

@ApiTags('Employee Family')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('employees/:employeeId/family')
export class EmployeeFamilyController {
  constructor(private readonly familyService: EmployeeFamilyService) {}

  @Permissions(PermissionEnum.EMPLOYEE_UPDATE)
  @Post()
  @ApiOperation({ summary: 'Create a new family member for an employee' })
  create(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() createDto: CreateEmployeeFamilyDto,
    @CurrentUser() user: any,
  ) {
    return this.familyService.create(employeeId, createDto, user);
  }

  @Permissions(PermissionEnum.EMPLOYEE_READ)
  @Get()
  @ApiOperation({ summary: 'Get all family members for an employee' })
  findAll(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @CurrentUser() user: any,
  ) {
    return this.familyService.findAllByEmployee(employeeId, user);
  }

  @Permissions(PermissionEnum.EMPLOYEE_READ)
  @Get(':id')
  @ApiOperation({ summary: 'Get a specific family member' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.familyService.findOne(id, user);
  }

  @Permissions(PermissionEnum.EMPLOYEE_UPDATE)
  @Patch(':id')
  @ApiOperation({ summary: 'Update a family member' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateEmployeeFamilyDto,
    @CurrentUser() user: any,
  ) {
    return this.familyService.update(id, updateDto, user);
  }

  @Permissions(PermissionEnum.EMPLOYEE_UPDATE)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a family member' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.familyService.remove(id, user);
  }
}
