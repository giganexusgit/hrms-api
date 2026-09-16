import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { GetAttendanceReportDto } from './dto/get-attendance-report.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { PermissionEnum } from '../../common/enums/permission.enum';

@ApiTags('Reports')
@Controller('reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Permissions(PermissionEnum.REPORT_READ)
  @ApiOperation({ summary: 'Get comprehensive attendance report with summary and daily metrics' })
  @Get('attendance')
  async getAttendanceReport(
    @Query() query: GetAttendanceReportDto,
    @CurrentUser() user: any,
  ) {
    return this.reportsService.getAttendanceReport(query, user);
  }

  @Permissions(PermissionEnum.REPORT_READ)
  @ApiOperation({ summary: 'Get detailed daily attendance logs for a specific employee' })
  @Get('attendance/employee/:id')
  async getEmployeeAttendanceDetails(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @CurrentUser() user?: any,
  ) {
    return this.reportsService.getEmployeeAttendanceDetails(id, startDate, endDate, user);
  }
}
