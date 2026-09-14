import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeaveEngineService } from './leave-engine.service';
import { LeaveLedger } from '../leave-ledger/entities/leave-ledger.entity';
import { LeaveBalance } from '../leave-balance/entities/leave-balance.entity';
import { LeavePolicy } from '../leave-policy/entities/leave-policy.entity';
import { Employee } from '../employees/entities/employee.entity';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LeaveLedger,
      LeaveBalance,
      LeavePolicy,
      Employee,
    ]),
    ScheduleModule.forRoot(),
    NotificationModule,
  ],
  providers: [LeaveEngineService],
  exports: [LeaveEngineService],
})
export class LeaveEngineModule {}
