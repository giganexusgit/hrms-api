import { Test, TestingModule } from '@nestjs/testing';
import { SalaryStructureController } from './salary-structure.controller';
import { SalaryStructureService } from './salary-structure.service';
import { CreateSalaryStructureDto } from './dto/create-salary-structure.dto';
import { UpdateSalaryStructureDto } from './dto/update-salary-structure.dto';

describe('SalaryStructureController', () => {
  let controller: SalaryStructureController;
  let service: SalaryStructureService;

  const mockSalaryResponse = {
    id: 'sal-123',
    basicSalary: 50000,
    grossSalary: 60000,
    netSalary: 55000,
    isActive: true,
  };

  const mockSalaryStructureService = {
    getMySalaryStructure: jest.fn().mockResolvedValue(mockSalaryResponse),
    create: jest.fn().mockResolvedValue(mockSalaryResponse),
    update: jest.fn().mockResolvedValue(mockSalaryResponse),
    findAll: jest
      .fn()
      .mockResolvedValue({ data: [mockSalaryResponse], meta: {} }),
    findOne: jest.fn().mockResolvedValue(mockSalaryResponse),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SalaryStructureController],
      providers: [
        {
          provide: SalaryStructureService,
          useValue: mockSalaryStructureService,
        },
      ],
    }).compile();

    controller = module.get<SalaryStructureController>(
      SalaryStructureController,
    );
    service = module.get<SalaryStructureService>(SalaryStructureService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getMySalary', () => {
    it('should call service.getMySalaryStructure', async () => {
      const user = { id: 'emp-123' };
      const result = await controller.getMySalary(user);
      expect(result).toEqual(mockSalaryResponse);
      expect(
        mockSalaryStructureService.getMySalaryStructure,
      ).toHaveBeenCalledWith('emp-123');
    });
  });

  describe('create', () => {
    it('should call service.create', async () => {
      const dto: CreateSalaryStructureDto = {
        employeeId: 'emp-123',
        basicSalary: 50000,
      } as any;
      const currentUser = { id: 'admin-1' };
      const result = await controller.create(dto, currentUser);
      expect(result).toEqual(mockSalaryResponse);
      expect(mockSalaryStructureService.create).toHaveBeenCalledWith(
        dto,
        currentUser,
      );
    });
  });

  describe('update', () => {
    it('should call service.update', async () => {
      const dto: UpdateSalaryStructureDto = { basicSalary: 55000 };
      const currentUser = { id: 'admin-1' };
      const result = await controller.update('sal-123', dto, currentUser);
      expect(result).toEqual(mockSalaryResponse);
      expect(mockSalaryStructureService.update).toHaveBeenCalledWith(
        'sal-123',
        dto,
        currentUser,
      );
    });
  });

  describe('findAll', () => {
    it('should call service.findAll', async () => {
      const query = { page: '1' };
      const currentUser = { id: 'admin-1' };
      const result = await controller.findAll(query, currentUser);
      expect(result.data).toEqual([mockSalaryResponse]);
      expect(mockSalaryStructureService.findAll).toHaveBeenCalledWith(
        query,
        currentUser,
      );
    });
  });

  describe('findOne', () => {
    it('should call service.findOne', async () => {
      const currentUser = { id: 'admin-1' };
      const result = await controller.findOne('sal-123', currentUser);
      expect(result).toEqual(mockSalaryResponse);
      expect(mockSalaryStructureService.findOne).toHaveBeenCalledWith(
        'sal-123',
        currentUser,
      );
    });
  });
});
