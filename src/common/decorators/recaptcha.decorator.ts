import { SetMetadata } from '@nestjs/common';

export const RECAPTCHA_ACTION_KEY = 'recaptcha_action';

/**
 * Decorator to specify the expected reCAPTCHA action for a route.
 *
 * @param action Expected action name (e.g., 'login', 'forgot_password', 'job_application')
 */
export const RequireRecaptcha = (action?: string) =>
  SetMetadata(RECAPTCHA_ACTION_KEY, action || true);
