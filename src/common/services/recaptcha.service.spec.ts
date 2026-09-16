import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { RecaptchaService } from './recaptcha.service';

describe('RecaptchaService', () => {
  let service: RecaptchaService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'RECAPTCHA_SECRET_KEY') return 'test_secret_key';
      if (key === 'RECAPTCHA_SCORE_THRESHOLD') return '0.5';
      if (key === 'NODE_ENV') return 'development';
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecaptchaService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<RecaptchaService>(RecaptchaService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should bypass verification gracefully in development when token is missing', async () => {
    const result = await service.verifyToken(undefined, 'login');
    expect(result.success).toBe(true);
  });

  it('should verify valid token and score successfully', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        success: true,
        score: 0.9,
        action: 'login',
      }),
    } as any);

    const result = await service.verifyToken('valid_token', 'login');
    expect(result.success).toBe(true);
    expect(result.score).toBe(0.9);
  });

  it('should throw BadRequestException on failed verification response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        success: false,
        'error-codes': ['invalid-input-response'],
      }),
    } as any);

    await expect(service.verifyToken('bad_token', 'login')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should throw BadRequestException when score is below threshold', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        success: true,
        score: 0.2, // below 0.5 threshold
        action: 'login',
      }),
    } as any);

    await expect(service.verifyToken('low_score_token', 'login')).rejects.toThrow(
      BadRequestException,
    );
  });
});
