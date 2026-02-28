/**
 * MCP Error Types — Structured errors for tool responses and HTTP endpoints.
 *
 * Each error carries a machine-readable code, HTTP status, and optional details.
 * Tool handlers catch these and return proper MCP error responses.
 */

export class McpError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'McpError';
  }
}

export class AuthenticationError extends McpError {
  constructor(message = 'Authentication required') {
    super(message, 'AUTH_REQUIRED', 401);
  }
}

export class AuthorizationError extends McpError {
  constructor(message = 'Insufficient permissions') {
    super(message, 'FORBIDDEN', 403);
  }
}

export class NotFoundError extends McpError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, 'NOT_FOUND', 404);
  }
}

export class ValidationError extends McpError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

export class RateLimitError extends McpError {
  constructor(message = 'Rate limit exceeded. Try again shortly.') {
    super(message, 'RATE_LIMIT', 429);
  }
}

export class EncryptionError extends McpError {
  constructor(message = 'Encryption operation failed') {
    super(message, 'ENCRYPTION_ERROR', 500);
  }
}

export class DatabaseError extends McpError {
  constructor(message = 'Database operation failed') {
    super(message, 'DB_ERROR', 500);
  }
}

/**
 * Format any error into a safe, user-facing error message for MCP tool responses.
 */
export function formatToolError(error: unknown): string {
  if (error instanceof McpError) {
    return `[${error.code}] ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
}

/**
 * Wrap a tool handler with standard error handling.
 * Catches errors and returns them as MCP isError responses.
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T,
): (...args: Parameters<T>) => Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  return async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      const message = formatToolError(error);
      console.error('[Tool Error]', error instanceof Error ? error.stack : error);
      return {
        content: [{ type: 'text' as const, text: message }],
        isError: true,
      };
    }
  };
}
