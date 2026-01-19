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

/**
 * Rate limiter for proof submission endpoints
 * Prevents abuse of challenge proof submissions
 * Limit: 5 requests per minute per user
 */
export const proofSubmissionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requests per window
  message: {
    message: 'Demasiadas solicitudes. Espera un momento antes de enviar otra prueba.',
    error_code: 'RATE_LIMIT_EXCEEDED',
    retry_after_seconds: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise IP
    return (req as any).user?.id || req.ip || 'anonymous';
  },
  validate: false,
});

/**
 * Rate limiter for redemption actions (redeem-life, redeem-challenge)
 * More permissive since these are important user actions
 * Limit: 10 requests per minute per user
 */
export const redemptionActionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per window
  message: {
    message: 'Demasiadas solicitudes. Espera un momento.',
    error_code: 'RATE_LIMIT_EXCEEDED',
    retry_after_seconds: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return (req as any).user?.id || req.ip || 'anonymous';
  },
  validate: false,
});

/**
 * Rate limiter for admin validation actions
 * Prevents accidental rapid clicks
 * Limit: 30 requests per minute per admin
 */
export const adminValidationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per window
  message: {
    message: 'Demasiadas solicitudes de administrador.',
    error_code: 'RATE_LIMIT_EXCEEDED',
    retry_after_seconds: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return (req as any).user?.id || req.ip || 'anonymous';
  },
  validate: false,
});

/**
 * Strict rate limiter for AI trigger endpoint
 * AI processing is expensive, limit more aggressively
 * Limit: 3 requests per minute per admin
 */
export const aiTriggerLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // 3 requests per window
  message: {
    message: 'Demasiadas solicitudes de validación AI. Espera un momento.',
    error_code: 'RATE_LIMIT_EXCEEDED',
    retry_after_seconds: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return (req as any).user?.id || req.ip || 'anonymous';
  },
  validate: false,
});

/**
 * Rate limiter for social search endpoint
 * Prevents profile enumeration and DoS attacks
 * Limit: 30 requests per minute per user
 */
export const socialSearchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 searches per window
  message: {
    message: 'Too many search requests. Please wait a moment.',
    error_code: 'RATE_LIMIT_EXCEEDED',
    retry_after_seconds: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return (req as any).user?.id || req.ip || 'anonymous';
  },
  validate: false,
});

/**
 * Rate limiter for social profile views
 * Prevents profile enumeration attacks
 * Limit: 60 requests per minute per user
 */
export const socialProfileLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 profile views per window
  message: {
    message: 'Too many profile requests. Please wait a moment.',
    error_code: 'RATE_LIMIT_EXCEEDED',
    retry_after_seconds: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return (req as any).user?.id || req.ip || 'anonymous';
  },
  validate: false,
});

/**
 * MEDIUM FIX: Rate limiter for follow/unfollow actions
 * Prevents follow/unfollow spam and bot behavior
 * Limit: 30 requests per minute per user
 */
export const socialFollowLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 follow/unfollow actions per window
  message: {
    message: 'Too many follow/unfollow requests. Please wait a moment.',
    error_code: 'RATE_LIMIT_EXCEEDED',
    retry_after_seconds: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return (req as any).user?.id || req.ip || 'anonymous';
  },
  validate: false,
});

/**
 * LOW FIX: Rate limiter for revival actions
 * Revival is a critical action, limit to prevent abuse
 * Limit: 5 requests per minute per user
 */
export const revivalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 revival attempts per window
  message: {
    message: 'Demasiados intentos de revival. Espera un momento.',
    error_code: 'RATE_LIMIT_EXCEEDED',
    retry_after_seconds: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return (req as any).user?.id || req.ip || 'anonymous';
  },
  validate: false,
});

/**
 * LOW FIX: Rate limiter for life challenge redemption
 * Limit: 10 requests per minute per user
 */
export const lifeChallengeRedeemLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 redemption attempts per window
  message: {
    message: 'Demasiados intentos de canje. Espera un momento.',
    error_code: 'RATE_LIMIT_EXCEEDED',
    retry_after_seconds: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return (req as any).user?.id || req.ip || 'anonymous';
  },
  validate: false,
});

/**
 * LOW FIX: Rate limiter for challenge actions (assign, submit proof)
 * Limit: 20 requests per minute per user
 */
export const challengeActionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 challenge actions per window
  message: {
    message: 'Demasiadas solicitudes de challenge. Espera un momento.',
    error_code: 'RATE_LIMIT_EXCEEDED',
    retry_after_seconds: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return (req as any).user?.id || req.ip || 'anonymous';
  },
  validate: false,
});

/**
 * HIGH FIX: Rate limiter for challenge view/list endpoints
 * Prevents data enumeration and API abuse
 * Limit: 60 requests per minute per user
 */
export const challengeViewLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 view requests per window
  message: {
    message: 'Too many challenge requests. Please wait a moment.',
    error_code: 'RATE_LIMIT_EXCEEDED',
    retry_after_seconds: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return (req as any).user?.id || req.ip || 'anonymous';
  },
  validate: false,
});

/**
 * CRITICAL FIX: Rate limiter for general data fetch endpoints
 * Prevents API abuse and enumeration attacks
 * Limit: 60 requests per minute per user
 */
export const dataFetchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per window
  message: {
    message: 'Too many requests. Please wait a moment.',
    error_code: 'RATE_LIMIT_EXCEEDED',
    retry_after_seconds: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return (req as any).user?.id || req.ip || 'anonymous';
  },
  validate: false,
});

/**
 * CRITICAL FIX: Rate limiter for completion modification endpoints
 * Prevents abuse of PUT/DELETE/POST completion operations
 * Limit: 30 requests per minute per user
 */
export const completionModifyLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 modification requests per window
  message: {
    message: 'Too many completion modification requests. Please wait a moment.',
    error_code: 'RATE_LIMIT_EXCEEDED',
    retry_after_seconds: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return (req as any).user?.id || req.ip || 'anonymous';
  },
  validate: false,
});
