export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, code: string = 'INTERNAL_ERROR', statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTHENTICATION_REQUIRED', 401);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Access denied') {
    super(message, 'ACCESS_DENIED', 403);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 'NOT_FOUND', 404);
  }
}

export class ValidationError extends AppError {
  public readonly errors: Record<string, string[]>;

  constructor(message: string = 'Validation failed', errors: Record<string, string[]> = {}) {
    super(message, 'VALIDATION_FAILED', 422);
    this.errors = errors;
  }
}

export function sanitizeError(error: unknown): { message: string; code: string } {
  if (error instanceof AppError && error.isOperational) {
    return { message: error.message, code: error.code };
  }

  if (process.env.NODE_ENV === 'development') {
    console.error('[UNHANDLED_ERROR]:', error);
  }

  return {
    message: 'An unexpected error occurred. Please try again later.',
    code: 'INTERNAL_SERVER_ERROR',
  };
}
