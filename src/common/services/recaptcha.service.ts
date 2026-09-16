import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface RecaptchaVerificationResult {
  success: boolean;
  score?: number;
  action?: string;
  challenge_ts?: string;
  hostname?: string;
  'error-codes'?: string[];
}

@Injectable()
export class RecaptchaService {
  private readonly logger = new Logger(RecaptchaService.name);
  private readonly secretKey: string | undefined;
  private readonly scoreThreshold: number;

  constructor(private readonly configService: ConfigService) {
    this.secretKey =
      this.configService.get<string>('RECAPTCHA_SECRET_KEY') ||
      process.env.RECAPTCHA_SECRET_KEY;
    const configuredThreshold =
      this.configService.get<string>('RECAPTCHA_SCORE_THRESHOLD') ||
      process.env.RECAPTCHA_SCORE_THRESHOLD;
    this.scoreThreshold = configuredThreshold
      ? parseFloat(configuredThreshold)
      : 0.5;
  }

  /**
   * Verifies Google reCAPTCHA v3 token.
   *
   * @param token The client-generated reCAPTCHA token
   * @param expectedAction Optional action name to match (e.g. 'login', 'job_application')
   */
  async verifyToken(
    token?: string,
    expectedAction?: string,
  ): Promise<RecaptchaVerificationResult> {
    const isProduction =
      (this.configService.get<string>('NODE_ENV') || process.env.NODE_ENV) ===
      'production';

    // In development or if secret key is not configured, bypass gracefully
    if (!this.secretKey) {
      if (!isProduction) {
        this.logger.warn(
          'RECAPTCHA_SECRET_KEY is not configured; skipping verification in non-production mode.',
        );
        return { success: true, score: 1.0, action: expectedAction };
      }
      throw new BadRequestException('reCAPTCHA configuration is missing.');
    }

    if (!token) {
      if (!isProduction) {
        this.logger.warn(
          'No reCAPTCHA token provided; skipping in non-production mode.',
        );
        return { success: true, score: 1.0, action: expectedAction };
      }
      throw new BadRequestException('reCAPTCHA token is required.');
    }

    try {
      const response = await fetch(
        'https://www.google.com/recaptcha/api/siteverify',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            secret: this.secretKey,
            response: token,
          }).toString(),
        },
      );

      if (!response.ok) {
        this.logger.error(
          `Google reCAPTCHA API responded with HTTP status ${response.status}`,
        );
        throw new BadRequestException(
          'Unable to verify reCAPTCHA. Please try again.',
        );
      }

      const data = (await response.json()) as RecaptchaVerificationResult;

      if (!data.success) {
        this.logger.warn(
          `reCAPTCHA verification failed: ${JSON.stringify(data['error-codes'] || [])}`,
        );
        throw new BadRequestException(
          'reCAPTCHA verification failed. Please try again.',
        );
      }

      // Check risk score for reCAPTCHA v3
      if (typeof data.score === 'number' && data.score < this.scoreThreshold) {
        this.logger.warn(
          `reCAPTCHA score too low (${data.score} < ${this.scoreThreshold})`,
        );
        throw new BadRequestException(
          'Security check failed. Suspicious activity detected.',
        );
      }

      // Check action match if provided
      if (expectedAction && data.action && data.action !== expectedAction) {
        this.logger.warn(
          `reCAPTCHA action mismatch (expected: ${expectedAction}, got: ${data.action})`,
        );
        throw new BadRequestException(
          'Security check failed. Invalid reCAPTCHA action.',
        );
      }

      return data;
    } catch (err: any) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      this.logger.error(
        `Error during reCAPTCHA verification: ${err.message}`,
        err.stack,
      );
      // In development, fail open if network issue to google occurs; in prod, fail secure
      if (!isProduction) {
        this.logger.warn(
          'Failed to reach Google reCAPTCHA server; allowing request in development mode.',
        );
        return { success: true, score: 1.0 };
      }
      throw new BadRequestException(
        'Failed to verify reCAPTCHA token. Please try again.',
      );
    }
  }
}
