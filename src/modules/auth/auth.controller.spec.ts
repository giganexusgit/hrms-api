import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { Response } from 'express';

import { RecaptchaGuard } from '../../common/guards/recaptcha.guard';

describe('AuthController', () => {
  let controller: AuthController;

  const mockAuthService = {
    login: jest.fn(),
    refreshToken: jest.fn(),
    logout: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    })
      .overrideGuard(RecaptchaGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('login', () => {
    it('should call authService.login and return response', async () => {
      const loginDto = { identifier: 'EMP-001', password: 'password' };
      const expectedRes = { accessToken: 'acc', refreshToken: 'ref' };
      mockAuthService.login.mockResolvedValue(expectedRes);

      const result = await controller.login(loginDto);
      expect(result).toEqual(expectedRes);
      expect(mockAuthService.login).toHaveBeenCalledWith(loginDto);
    });
  });

  describe('getProfile', () => {
    it('should return current user object', () => {
      const mockUser = { id: 'emp-123', email: 'john@example.com' } as unknown;
      const result = controller.getProfile(mockUser);
      expect(result).toEqual(mockUser);
    });
  });

  describe('refreshToken', () => {
    it('should call authService.refreshToken and return new tokens', async () => {
      const dto = { refreshToken: 'old-ref' };
      const expectedRes = { accessToken: 'new-acc' };
      mockAuthService.refreshToken.mockResolvedValue(expectedRes);

      const result = await controller.refreshToken(dto);
      expect(result).toEqual(expectedRes);
      expect(mockAuthService.refreshToken).toHaveBeenCalledWith('old-ref');
    });
  });

  describe('logout', () => {
    it('should call authService.logout and return message', async () => {
      const dto = { refreshToken: 'old-ref' };
      const expectedRes = { message: 'Logged out' };
      mockAuthService.logout.mockResolvedValue(expectedRes);

      const result = await controller.logout(dto);
      expect(result).toEqual(expectedRes);
      expect(mockAuthService.logout).toHaveBeenCalledWith('old-ref');
    });
  });

  describe('forgotPassword', () => {
    it('should call authService.forgotPassword and return success', async () => {
      const dto = { email: 'john@example.com' };
      const expectedRes = { success: true };
      mockAuthService.forgotPassword.mockResolvedValue(expectedRes);

      const result = await controller.forgotPassword(dto);
      expect(result).toEqual(expectedRes);
      expect(mockAuthService.forgotPassword).toHaveBeenCalledWith(dto);
    });
  });

  describe('resetPassword', () => {
    it('should call authService.resetPassword and return success', async () => {
      const dto = { token: 'reset-token', password: 'new-password' };
      const expectedRes = { success: true };
      mockAuthService.resetPassword.mockResolvedValue(expectedRes);

      const result = await controller.resetPassword(dto);
      expect(result).toEqual(expectedRes);
      expect(mockAuthService.resetPassword).toHaveBeenCalledWith(dto);
    });
  });

  describe('resetPasswordRedirect', () => {
    it('should send HTML response containing token', () => {
      const mockRes = {
        send: jest.fn().mockImplementation((html: string) => html),
      } as unknown as Response;

      controller.resetPasswordRedirect('token-123', mockRes);
      expect(mockRes.send).toHaveBeenCalled();
      const htmlArg = String((mockRes.send as jest.Mock).mock.calls[0][0]);
      expect(htmlArg).toContain('token-123');
    });
  });
});
