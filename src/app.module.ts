import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClsModule } from 'nestjs-cls';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

import { RolesModule } from './modules/roles/roles.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuthLogModule } from './modules/auth-log/auth-log.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { CommonModule } from './common/common.module';

import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { EmployeeScopeGuard } from './common/guards/employee-scope.guard';
import { ActivityLogInterceptor } from './common/interceptors/activity-log.interceptor';
import { ContextInterceptor } from './common/interceptors/context.interceptor';
import { DepartmentsModule } from './modules/departments/departments.module';
import { DesignationsModule } from './modules/designations/designations.module';
import { EmployeeDocumentsModule } from './modules/employee-documents/employee-documents.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { LeaveController } from './modules/attendance/Controller/leave-controller.controller';
import { ScheduleModule } from '@nestjs/schedule';
import { HolidayModule } from './modules/holiday/holiday.module';
import { WeekendSettingsModule } from './modules/weekend_settings/weekend_settings.module';
import { LeaveBalanceModule } from './modules/leave-balance/leave-balance.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { SalaryStructureModule } from './modules/salary-structure/salary-structure.module';
import { PayslipModule } from './modules/payslip/payslip.module';
import { MailModule } from './modules/mail/mail.module';
import { TrainingModule } from './modules/training/training.module';
import { InterviewModule } from './modules/interview/interview.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { SystemModule } from './modules/system/system.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { TeamModule } from './modules/team/team.module';
import { NotificationModule } from './modules/notification/notification.module';
import { NotificationPreferenceModule } from './modules/notification-preference/notification-preference.module';
import { ShiftModule } from './modules/shift/shift.module';
import { LeaveTypeModule } from './modules/leave-type/leave-type.module';
import { LeavePolicyModule } from './modules/leave-policy/leave-policy.module';
import { LeaveLedgerModule } from './modules/leave-ledger/leave-ledger.module';
import { LeaveEngineModule } from './modules/leave-engine/leave-engine.module';
import { ActivityLogModule } from './modules/activity-log/activity-log.module';
import { EmployeeAddressModule } from './modules/employee-address/employee-address.module';
import { EmployeeEmergencyContactModule } from './modules/employee-emergency-contact/employee-emergency-contact.module';
import { EmployeeFamilyModule } from './modules/employee-family/employee-family.module';
import { EmployeeEducationModule } from './modules/employee-education/employee-education.module';
import { EmployeeExperienceModule } from './modules/employee-experience/employee-experience.module';
import { EmployeeSkillModule } from './modules/employee-skill/employee-skill.module';
import { EmployeeBankModule } from './modules/employee-bank/employee-bank.module';
import { CareerMovementsModule } from './modules/career-movements/career-movements.module';
import { ResignationsModule } from './modules/resignations/resignations.module';
import { ReportsModule } from './modules/reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
    }),

    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
      },
    }),

    ScheduleModule.forRoot(),

    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),

    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      entities: ['dist/**/*.entity.js'],
      migrations: ['dist/database/migrations/*.js'],
      autoLoadEntities: true,
      synchronize: false,
    }),

    CommonModule,
    TeamModule,
    NotificationModule,
    NotificationPreferenceModule,
    ShiftModule,
    RolesModule,
    PermissionsModule,
    AuthModule,
    AuthLogModule,
    AuditLogModule,
    EmployeesModule,
    DepartmentsModule,
    DesignationsModule,
    EmployeeDocumentsModule,
    AttendanceModule,
    HolidayModule,
    WeekendSettingsModule,
    LeaveBalanceModule,
    PayrollModule,
    SalaryStructureModule,
    PayslipModule,
    MailModule,
    TrainingModule,
    InterviewModule,
    DashboardModule,
    OrganizationModule,
    SystemModule,
    TenantModule,
    LeaveTypeModule,
    LeavePolicyModule,
    LeaveLedgerModule,
    LeaveEngineModule,
    ActivityLogModule,
    EmployeeAddressModule,
    EmployeeEmergencyContactModule,
    EmployeeFamilyModule,
    EmployeeEducationModule,
    EmployeeExperienceModule,
    EmployeeSkillModule,
    EmployeeBankModule,
    CareerMovementsModule,
    ResignationsModule,
    ReportsModule,
  ],

  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },

    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: EmployeeScopeGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ContextInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ActivityLogInterceptor,
    },
  ],
})
export class AppModule {}
