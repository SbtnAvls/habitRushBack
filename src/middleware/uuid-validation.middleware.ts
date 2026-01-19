import { Request, Response, NextFunction } from 'express';

/**
 * UUID v4 regex pattern
 */
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Check if a string is a valid UUID v4
 */
export function isValidUUID(id: string): boolean {
  return UUID_V4_REGEX.test(id);
}

/**
 * Middleware to validate UUID parameters
 * @param paramNames - Array of parameter names to validate (default: ['id'])
 */
export function validateUUIDParams(paramNames: string[] = ['id']) {
  return (req: Request, res: Response, next: NextFunction) => {
    for (const paramName of paramNames) {
      const value = req.params[paramName];

      if (value && !isValidUUID(value)) {
        return res.status(400).json({
          message: `Parámetro '${paramName}' inválido`,
          error_code: 'INVALID_UUID',
          parameter: paramName,
        });
      }
    }

    next();
  };
}

/**
 * Middleware to validate a single UUID parameter
 */
export const validateIdParam = validateUUIDParams(['id']);
