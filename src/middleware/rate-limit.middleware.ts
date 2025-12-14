import rateLimit from 'express-rate-limit';

// Rate limiter for authentication endpoints (login, register)
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: {
    message: 'Too many authentication attempts from this IP, please try again after 15 minutes',
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Skip successful requests
  skipSuccessfulRequests: false,
});

// Rate limiter for refresh token endpoint
export const refreshRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 refresh requests per windowMs
  message: {
    message: 'Too many token refresh attempts, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// General rate limiter for all API routes (optional, can be applied globally)
export const generalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    message: 'Too many requests from this IP, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
