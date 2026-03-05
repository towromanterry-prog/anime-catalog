export class ApiError extends Error {
  constructor(statusCode, error, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.error = error;
    this.details = details;
  }
}

export function badRequest(message, details) {
  return new ApiError(400, 'BAD_REQUEST', message, details);
}

export function unauthorized(message = 'Unauthorized') {
  return new ApiError(401, 'UNAUTHORIZED', message);
}

export function forbidden(message = 'Forbidden') {
  return new ApiError(403, 'FORBIDDEN', message);
}
