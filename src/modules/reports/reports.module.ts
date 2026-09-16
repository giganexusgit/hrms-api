import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { Employee } from '../employees/entities/employee.entity';
import { Attendance } from '../attendance/entities/attendance.entity';
import { Leave } from '../attendance/entities/leave.entity';
import { Shift } from '../shift/entities/shift.entity';
import { Holiday } from '../holiday/entities/holiday.entity';
import { Department } from '../departments/entities/department.entity';
import { CommonModule } from '../../common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Employee,
      Attendance,
      Leave,
      Shift,
      Holiday,
      Department,
    ]),
    CommonModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
