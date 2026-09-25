import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { LeaveBalanceService } from './leave-balance.service';
import { LeaveEngineService } from '../leave-engine/leave-engine.service';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { PermissionEnum } from 'src/common/enums/permission.enum';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdjustLeaveBalanceDto } from './dto/adjust-leave-balance.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class LeaveBalanceController {
  constructor(
    private readonly leaveBalanceService: LeaveBalanceService,
    private readonly leaveEngineService: LeaveEngineService,
  ) {}

  @Permissions(PermissionEnum.LEAVE_READ)
  @Get('leave-balance/me')
  getMyBalance(@CurrentUser() employee: any, @Query('year') year?: number) {
    return this.leaveBalanceService.getEmployeeBalance(employee.id, year);
  }

  @Permissions(PermissionEnum.LEAVE_READ)
  @Get('hr/leave-balance')
  getAllBalances(
    @Query()
    query: any,
    @CurrentUser() hrUser: any,
  ) {
    return this.leaveBalanceService.getAllBalances(query, hrUser);
  }

  @Permissions(PermissionEnum.LEAVE_UPDATE)
  @Post('hr/leave-balance/adjust')
  adjustBalance(
    @CurrentUser() hrUser: any,
    @Body() dto: AdjustLeaveBalanceDto,
  ) {
    return this.leaveEngineService.manualAdjustment(
      dto.employeeId,
      dto.leaveTypeId,
      dto.days,
      dto.remarks || 'Manual Adjustment by HR',
      hrUser,
    );
  }

  @Permissions(PermissionEnum.LEAVE_UPDATE)
  @Post('hr/leave-balance/run-credit')
  async runCredit(
    @CurrentUser() hrUser: any,
    @Body() payload: { branchId?: string; leaveTypeId?: string; days?: number; remarks?: string },
  ) {
    return this.leaveEngineService.executeCustomOrMonthlyAccrual({
      tenantId: hrUser.tenantId,
      branchId: payload?.branchId,
      leaveTypeId: payload?.leaveTypeId,
      days: payload?.days ? Number(payload.days) : undefined,
      remarks: payload?.remarks,
      hrUserId: hrUser?.id,
    });
  }
}
