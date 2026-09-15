import { Test, TestingModule } from '@nestjs/testing';
import { CorrectionService } from './correction.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AttendanceCorrection } from '../entities/correction.entity';
import { Attendance } from '../entities/attendance.entity';
import { DataSource } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { CorrectionStatus } from '../../../common/enums/CorrectionStatus.enum';
import { DataScopeService } from '../../../common/services/data-scope.service';
import { NotificationService } from '../../notification/notification.service';
import { TenantQueryService } from '../../../common/services/tenant-query.service';
import { AttendanceValidationService } from './attendance-validation.service';

describe('CorrectionService', () => {
  let service: CorrectionService;
  let correctionRepo: any;
  let attendanceRepo: any;
  let mockEntityManager: any;

  const mockCorrection = {
    id: 'corr-123',
    employeeId: 'emp-123',
    attendanceId: 'att-123',
    currentCheckIn: new Date('2026-06-29T09:00:00Z'),
    currentCheckOut: null,
    requestedCheckIn: new Date('2026-06-29T08:30:00Z'),
    requestedCheckOut: null,
    reason: 'Forgot check-in',
    status: CorrectionStatus.PENDING,
  };

  const mockAttendance = {
    id: 'att-123',
    employeeId: 'emp-123',
    date: '2026-06-29',
    checkIn: new Date('2026-06-29T09:00:00Z'),
    checkOut: null,
  };

  const mockRepository = () => ({
    findOne: jest.fn(),
    create: jest.fn().mockReturnValue(mockCorrection),
    save: jest.fn().mockResolvedValue(mockCorrection),
    createQueryBuilder: jest.fn(),
  });

  beforeEach(async () => {
    mockEntityManager = {
      findOne: jest.fn(),
      save: jest.fn().mockResolvedValue(mockCorrection),
    };

    const mockDataSource = {
      transaction: jest.fn().mockImplementation((cb) => cb(mockEntityManager)),
    };

    const mockDataScopeService = {
      applyScope: jest.fn(),
    };

    const mockNotificationService = {
      createNotification: jest.fn().mockResolvedValue(undefined),
    };

    const mockTenantQueryService = {
      getTenantWhereClause: jest.fn().mockReturnValue({ tenantId: 'tenant-123' }),
      applyTenantFilter: jest.fn(),
    };

    const mockValidationService = {
      getEffectiveShift: jest.fn().mockReturnValue({
        startTime: '09:30',
        endTime: '18:30',
        lateGraceMinutes: 30,
        halfDayThresholdMinutes: 120,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CorrectionService,
        {
          provide: getRepositoryToken(AttendanceCorrection),
          useFactory: mockRepository,
        },
        { provide: getRepositoryToken(Attendance), useFactory: mockRepository },
        { provide: DataSource, useValue: mockDataSource },
        { provide: DataScopeService, useValue: mockDataScopeService },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: TenantQueryService, useValue: mockTenantQueryService },
        { provide: AttendanceValidationService, useValue: mockValidationService },
      ],
    }).compile();

    service = module.get<CorrectionService>(CorrectionService);
    correctionRepo = module.get(getRepositoryToken(AttendanceCorrection));
    attendanceRepo = module.get(getRepositoryToken(Attendance));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('requestCorrection', () => {
    const dto = {
      date: '2026-06-29',
      requestedCheckIn: '2026-06-29T08:30:00Z',
      reason: 'Forgot check-in',
    };

    it('should successfully submit request', async () => {
      attendanceRepo.findOne.mockResolvedValue(mockAttendance);
      correctionRepo.findOne.mockResolvedValue(null);

      const result = await service.requestCorrection('emp-123', dto);
      expect(result).toHaveProperty('id');
    });

    it('should throw BadRequestException if attendance not found', async () => {
      attendanceRepo.findOne.mockResolvedValue(null);
      await expect(
        service.requestCorrection('emp-123', dto as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('review', () => {
    it('should review correction request successfully', async () => {
      mockEntityManager.findOne
        .mockResolvedValueOnce(mockCorrection) // correction find
        .mockResolvedValueOnce(mockAttendance); // attendance find

      const result = await service.review(
        'corr-123',
        CorrectionStatus.APPROVED,
        'hr-123',
      );
      expect(result.correction.status).toBe(CorrectionStatus.APPROVED);
    });
  });
});
