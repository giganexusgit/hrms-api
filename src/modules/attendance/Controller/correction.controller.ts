import { Body, Controller, Post } from '@nestjs/common';

import { CorrectionRequestDto } from './../dto/correction-request.dto';

import { Permissions } from '../../auth/decorators/permissions.decorator';

import { PermissionEnum } from '../../../common/enums/permission.enum';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { CorrectionService } from '../Service/correction.service';

@Controller('attendance')
export class CorrectionController {
  constructor(private readonly correctionService: CorrectionService) {}

  @Permissions(PermissionEnum.ATTENDANCE_CORRECTION_CREATE)
  @Post('correction-request')
  requestCorrection(
    @CurrentUser()
    employee: any,

    @Body()
    dto: CorrectionRequestDto,
  ) {
    const targetEmployeeId = dto.employeeId || employee.id;
    return this.correctionService.requestCorrection(targetEmployeeId, dto);
  }
}
