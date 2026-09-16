import { Body, Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import type { Response } from 'express';

import { AuthService } from './auth.service';

import { LoginDto } from './dto/login.dto';

import { Public } from './decorators/public.decorator';

import { CurrentUser } from './decorators/current-user.decorator';

import { RefreshTokenDto } from './dto/refresh-token.dto';

import { LogoutDto } from './dto/logout.dto';

import { ForgotPasswordDto } from './dto/forgot-password.dto';

import { ResetPasswordDto } from './dto/reset-password.dto';

import { RecaptchaGuard } from '../../common/guards/recaptcha.guard';
import { RequireRecaptcha } from '../../common/decorators/recaptcha.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Public()
  @UseGuards(RecaptchaGuard)
  @RequireRecaptcha('login')
  @Post('login')
  login(
    @Body()
    dto: LoginDto,
  ) {
    return this.authService.login(dto);
  }

  @Get('me')
  getProfile(
    @CurrentUser()
    user: unknown,
  ) {
    return user;
  }

  @Public()
  @Post('refresh-token')
  refreshToken(
    @Body()
    dto: RefreshTokenDto,
  ) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  @Public()
  @Post('logout')
  logout(
    @Body()
    dto: LogoutDto,
  ) {
    return this.authService.logout(dto.refreshToken);
  }

  @Post('terminate-session')
  terminateSession(
    @Body()
    dto: { userId?: string; email?: string; sessionId?: string },
  ) {
    return this.authService.terminateSession(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Public()
  @UseGuards(RecaptchaGuard)
  @RequireRecaptcha('forgot_password')
  @Post('forgot-password')
  forgotPassword(
    @Body()
    dto: ForgotPasswordDto,
  ) {
    return this.authService.forgotPassword(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Public()
  @Post('reset-password')
  resetPassword(
    @Body()
    dto: ResetPasswordDto,
  ) {
    return this.authService.resetPassword(dto);
  }

  @Public()
  @Get('reset-password')
  resetPasswordRedirect(
    @Query('token')
    token: string,

    @Res()
    res: Response,
  ) {
    return res.send(`
    <html>
      <body style="font-family: Arial; padding:40px;">
        <h2>Reset Password</h2>

        <input
          id="password"
          type="password"
          placeholder="New Password"
          style="padding:10px; width:300px;"
        />

        <br /><br />

        <button onclick="resetPassword()">
          Reset Password
        </button>

        <script>
          async function resetPassword() {
            const password =
              document.getElementById(
                'password'
              ).value;

            const response =
              await fetch(
                '/api/auth/reset-password',
                {
                  method: 'POST',

                  headers: {
                    'Content-Type':
                      'application/json',
                  },

                  body:
                    JSON.stringify({
                      token:
                        '${token}',

                      password,
                    }),
                },
              );

            const data =
              await response.json();

            alert(
              data.message
            );
          }
        </script>
      </body>
    </html>
  `);
  }
}
