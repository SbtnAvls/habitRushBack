/**
 * Secure configuration helpers for secrets
 * CRITICAL: Never use hardcoded fallbacks for secrets in production
 */

/**
 * Get JWT secret for access tokens
 * Throws error if not configured (fail secure)
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // In test environment, allow a test secret
    if (process.env.NODE_ENV === 'test') {
      return 'test_jwt_secret_for_testing_only';
    }
    throw new Error('JWT_SECRET environment variable is not configured. This is required for authentication.');
  }
  return secret;
}

/**
 * Get refresh token secret
 * Throws error if not configured (fail secure)
 */
export function getRefreshTokenSecret(): string {
  const secret = process.env.REFRESH_TOKEN_SECRET;
  if (!secret) {
    // In test environment, allow a test secret
    if (process.env.NODE_ENV === 'test') {
      return 'test_refresh_secret_for_testing_only';
    }
    throw new Error('REFRESH_TOKEN_SECRET environment variable is not configured. This is required for authentication.');
  }
  return secret;
}
