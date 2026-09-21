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
import { EmployeeSkillService } from './employee-skill.service';
import { CreateEmployeeSkillDto } from './dto/create-employee-skill.dto';
import { UpdateEmployeeSkillDto } from './dto/update-employee-skill.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PermissionEnum } from 'src/common/enums/permission.enum';

@ApiTags('Employee Skills')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('employees/:employeeId/skills')
export class EmployeeSkillController {
  constructor(private readonly skillService: EmployeeSkillService) {}

  @Permissions(PermissionEnum.EMPLOYEE_UPDATE)
  @Post()
  @ApiOperation({ summary: 'Add a new skill or certification for an employee' })
  create(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() createDto: CreateEmployeeSkillDto,
    @CurrentUser() user: any,
  ) {
    return this.skillService.create(employeeId, createDto, user);
  }

  @Permissions(PermissionEnum.EMPLOYEE_READ)
  @Get()
  @ApiOperation({ summary: 'Get all skills for an employee' })
  findAll(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @CurrentUser() user: any,
  ) {
    return this.skillService.findAllByEmployee(employeeId, user);
  }

  @Permissions(PermissionEnum.EMPLOYEE_READ)
  @Get(':id')
  @ApiOperation({ summary: 'Get a specific skill' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.skillService.findOne(id, user);
  }

  @Permissions(PermissionEnum.EMPLOYEE_UPDATE)
  @Patch(':id')
  @ApiOperation({ summary: 'Update a skill' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateEmployeeSkillDto,
    @CurrentUser() user: any,
  ) {
    return this.skillService.update(id, updateDto, user);
  }

  @Permissions(PermissionEnum.EMPLOYEE_UPDATE)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a skill' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.skillService.remove(id, user);
  }
}
