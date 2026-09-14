import { Module } from '@nestjs/common';
import { HolidayService } from './holiday.service';
import { HolidayController } from './holiday.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Holiday } from './entities/holiday.entity';
import { Employee } from '../employees/entities/employee.entity';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Holiday, Employee]),
    NotificationModule,
  ],
  controllers: [HolidayController],
  providers: [HolidayService],
})
export class HolidayModule {}
