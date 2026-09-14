import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CareerMovementsService } from './career-movements.service';
import { CareerMovementsController } from './career-movements.controller';
import { EmployeeCareerMovement } from './entities/career-movement.entity';
import { Employee } from '../employees/entities/employee.entity';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmployeeCareerMovement, Employee]),
    ActivityLogModule,
    NotificationModule,
  ],
  controllers: [CareerMovementsController],
  providers: [CareerMovementsService],
})
export class CareerMovementsModule {}
