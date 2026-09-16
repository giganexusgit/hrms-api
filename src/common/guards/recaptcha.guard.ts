import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RecaptchaService } from '../services/recaptcha.service';
import { RECAPTCHA_ACTION_KEY } from '../decorators/recaptcha.decorator';

@Injectable()
export class RecaptchaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly recaptchaService: RecaptchaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const rawAction = this.reflector.getAllAndOverride<string | boolean>(
      RECAPTCHA_ACTION_KEY,
      [context.getHandler(), context.getClass()],
    );

    const expectedAction = typeof rawAction === 'string' ? rawAction : undefined;

    // Extract token from header, body, or query
    const token =
      request.headers?.['x-recaptcha-token'] ||
      request.headers?.['recaptcha-token'] ||
      request.body?.recaptchaToken ||
      request.body?.token ||
      request.query?.recaptchaToken;

    const result = await this.recaptchaService.verifyToken(
      typeof token === 'string' ? token : undefined,
      expectedAction,
    );

    return result.success;
  }
}
