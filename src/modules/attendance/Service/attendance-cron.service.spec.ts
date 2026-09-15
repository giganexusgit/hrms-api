import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceCronService } from './attendance-cron.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Attendance } from '../entities/attendance.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { Holiday } from '../../holiday/entities/holiday.entity';
import { WeekendSetting } from '../../weekend_settings/entities/weekend_setting.entity';
import { Leave } from '../entities/leave.entity';
import { DataSource } from 'typeorm';
import { AttendanceValidationService } from './attendance-validation.service';
import { NotificationService } from '../../notification/notification.service';
import { TenantQueryService } from '../../../common/services/tenant-query.service';
import { TenantExecutionService } from '../../../common/services/tenant-execution.service';

describe('AttendanceCronService', () => {
  let service: AttendanceCronService;

  const mockRepository = () => ({
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockResolvedValue({}),
    createQueryBuilder: jest.fn().mockReturnValue({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getOne: jest.fn().mockResolvedValue(null),
    }),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceCronService,
        { provide: getRepositoryToken(Attendance), useFactory: mockRepository },
        { provide: getRepositoryToken(Employee), useFactory: mockRepository },
        { provide: getRepositoryToken(Holiday), useFactory: mockRepository },
        {
          provide: getRepositoryToken(WeekendSetting),
          useFactory: mockRepository,
        },
        { provide: getRepositoryToken(Leave), useFactory: mockRepository },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn().mockImplementation((cb) => cb({
              createQueryBuilder: jest.fn().mockReturnValue({
                leftJoinAndSelect: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                andWhere: jest.fn().mockReturnThis(),
                getMany: jest.fn().mockResolvedValue([]),
              }),
              save: jest.fn().mockResolvedValue({}),
            })),
          },
        },
        {
          provide: AttendanceValidationService,
          useValue: {
            getEffectiveShift: jest.fn(),
          },
        },
        {
          provide: NotificationService,
          useValue: {
            createNotification: jest.fn(),
          },
        },
        {
          provide: TenantQueryService,
          useValue: {
            getTenantWhereClause: jest.fn().mockReturnValue({ tenantId: 'test-tenant' }),
          },
        },
        {
          provide: TenantExecutionService,
          useValue: {
            forEachActiveTenant: jest.fn().mockImplementation((_, cb) => cb()),
          },
        },
      ],
    }).compile();

    service = module.get<AttendanceCronService>(AttendanceCronService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
