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
import { EmployeeEmergencyContactService } from './employee-emergency-contact.service';
import { CreateEmployeeEmergencyContactDto } from './dto/create-employee-emergency-contact.dto';
import { UpdateEmployeeEmergencyContactDto } from './dto/update-employee-emergency-contact.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PermissionEnum } from 'src/common/enums/permission.enum';

@ApiTags('Employee Emergency Contacts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('employees/:employeeId/emergency-contacts')
export class EmployeeEmergencyContactController {
  constructor(
    private readonly contactService: EmployeeEmergencyContactService,
  ) {}

  @Permissions(PermissionEnum.EMPLOYEE_UPDATE)
  @Post()
  @ApiOperation({ summary: 'Create a new emergency contact for an employee' })
  create(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() createDto: CreateEmployeeEmergencyContactDto,
    @CurrentUser() user: any,
  ) {
    return this.contactService.create(employeeId, createDto, user);
  }

  @Permissions(PermissionEnum.EMPLOYEE_READ)
  @Get()
  @ApiOperation({ summary: 'Get all emergency contacts for an employee' })
  findAll(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @CurrentUser() user: any,
  ) {
    return this.contactService.findAllByEmployee(employeeId, user);
  }

  @Permissions(PermissionEnum.EMPLOYEE_READ)
  @Get(':id')
  @ApiOperation({ summary: 'Get a specific emergency contact' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.contactService.findOne(id, user);
  }

  @Permissions(PermissionEnum.EMPLOYEE_UPDATE)
  @Patch(':id')
  @ApiOperation({ summary: 'Update an emergency contact' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateEmployeeEmergencyContactDto,
    @CurrentUser() user: any,
  ) {
    return this.contactService.update(id, updateDto, user);
  }

  @Permissions(PermissionEnum.EMPLOYEE_UPDATE)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete an emergency contact' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.contactService.remove(id, user);
  }
}
