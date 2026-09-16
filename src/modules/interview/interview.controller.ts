import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  Query,
} from '@nestjs/common';
import { InterviewService } from './interview.service';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { InterviewFeedbackDto } from './dto/interview-feedback.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RoleEnum } from '../../common/enums/role.enum';
import { Public } from '../auth/decorators/public.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { PermissionEnum } from 'src/common/enums/permission.enum';
import { RecaptchaGuard } from '../../common/guards/recaptcha.guard';
import { RequireRecaptcha } from '../../common/decorators/recaptcha.decorator';

@Controller('interview')
export class InterviewController {
  constructor(private readonly interviewService: InterviewService) {}

  // ------------------- PUBLIC ENDPOINTS -------------------
  @Public()
  @Get('public/jobs')
  getPublicJobs(@Query('tenantId', new ParseUUIDPipe({ optional: true })) tenantId?: string) {
    return this.interviewService.getPublicJobPostings(tenantId);
  }

  @Public()
  @Get('public/jobs/:id')
  getPublicJob(@Param('id', ParseUUIDPipe) id: string) {
    return this.interviewService.getPublicJobPosting(id);
  }

  @Public()
  @UseGuards(RecaptchaGuard)
  @RequireRecaptcha('job_application')
  @Post('public/jobs/:id/apply')
  applyToJob(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCandidateDto,
  ) {
    // Ensure the jobId in DTO matches the URL param
    dto.jobId = id;
    return this.interviewService.applyToPublicJob(dto);
  }

  // ------------------- INTERNAL EMPLOYEE ENDPOINTS -------------------
  // Allow all internal employees to view interviews and submit feedback
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleEnum.SUPER_ADMIN, RoleEnum.HR, RoleEnum.EMPLOYEE)
  @Get('my-interviews')
  getMyInterviews(@CurrentUser() user: any) {
    // In a real app we'd filter by user.id in the service, but we'll return all for now
    // or you can add a method `getInterviewsByInterviewer(user.id)` to `InterviewService`.
    return this.interviewService.getInterviews(user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles(RoleEnum.SUPER_ADMIN, RoleEnum.HR, RoleEnum.EMPLOYEE)
  @Permissions(PermissionEnum.INTERVIEW_CREATE)
  @Post(':id/feedback')
  addFeedback(
    @Param('id', ParseUUIDPipe)
    id: string,
    @Body()
    dto: InterviewFeedbackDto,
    @CurrentUser()
    user: any,
  ) {
    return this.interviewService.addFeedback(id, dto, user.id);
  }
}
