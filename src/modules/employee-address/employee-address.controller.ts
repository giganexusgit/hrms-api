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
import { EmployeeAddressService } from './employee-address.service';
import { CreateEmployeeAddressDto } from './dto/create-employee-address.dto';
import { UpdateEmployeeAddressDto } from './dto/update-employee-address.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Permission } from '../permissions/entities/permission.entity';
import { PermissionEnum } from 'src/common/enums/permission.enum';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Employee Addresses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('employees/:employeeId/addresses')
export class EmployeeAddressController {
  constructor(private readonly addressService: EmployeeAddressService) {}

  @Permissions(PermissionEnum.EMPLOYEE_UPDATE)
  @Post()
  @ApiOperation({ summary: 'Create a new address for an employee' })
  create(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() createDto: CreateEmployeeAddressDto,
    @CurrentUser() user: any,
  ) {
    return this.addressService.create(employeeId, createDto, user);
  }

  @Permissions(PermissionEnum.EMPLOYEE_READ)
  @Get()
  @ApiOperation({ summary: 'Get all addresses for an employee' })
  findAll(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @CurrentUser() user: any,
  ) {
    return this.addressService.findAllByEmployee(employeeId, user);
  }

  @Permissions(PermissionEnum.EMPLOYEE_READ)
  @Get(':id')
  @ApiOperation({ summary: 'Get a specific address' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.addressService.findOne(id, user);
  }

  @Permissions(PermissionEnum.EMPLOYEE_UPDATE)
  @Patch(':id')
  @ApiOperation({ summary: 'Update an address' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateEmployeeAddressDto,
    @CurrentUser() user: any,
  ) {
    return this.addressService.update(id, updateDto, user);
  }

  @Permissions(PermissionEnum.EMPLOYEE_UPDATE)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete an address' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.addressService.remove(id, user);
  }
}
