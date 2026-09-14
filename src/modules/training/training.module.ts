import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrainingService } from './training.service';
import { TrainingController } from './training.controller';
import { HrTrainingController } from './hr-training.controller';
import { Course } from './entities/course.entity';
import { CourseModule } from './entities/course-module.entity';
import { CourseTopic } from './entities/course-topic.entity';
import { CourseMaterial } from './entities/course-material.entity';
import { Assessment } from './entities/assessment.entity';
import { AssessmentQuestion } from './entities/assessment-question.entity';
import { AssessmentOption } from './entities/assessment-option.entity';
import { CourseAssignment } from './entities/course-assignment.entity';
import { TopicProgress } from './entities/topic-progress.entity';
import { ModuleProgress } from './entities/module-progress.entity';
import { AssessmentAttempt } from './entities/assessment-attempt.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Department } from '../departments/entities/department.entity';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Course,
      CourseModule,
      CourseTopic,
      CourseMaterial,
      Assessment,
      AssessmentQuestion,
      AssessmentOption,
      CourseAssignment,
      TopicProgress,
      ModuleProgress,
      AssessmentAttempt,
      Employee,
      Department,
    ]),
    NotificationModule,
  ],
  controllers: [TrainingController, HrTrainingController],
  providers: [TrainingService],
  exports: [TrainingService],
})
export class TrainingModule {}
