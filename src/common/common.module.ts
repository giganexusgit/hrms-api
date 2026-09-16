import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { DataScopeService } from './services/data-scope.service';
import { TenantQueryService } from './services/tenant-query.service';
import { TenantExecutionService } from './services/tenant-execution.service';
import { RecaptchaService } from './services/recaptcha.service';
import { RecaptchaGuard } from './guards/recaptcha.guard';
import { Tenant } from '../modules/tenant/entities/tenant.entity';

@Global()
@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([Tenant])],
  providers: [
    DataScopeService,
    TenantQueryService,
    TenantExecutionService,
    RecaptchaService,
    RecaptchaGuard,
  ],
  exports: [
    DataScopeService,
    TenantQueryService,
    TenantExecutionService,
    RecaptchaService,
    RecaptchaGuard,
  ],
})
export class CommonModule {}

