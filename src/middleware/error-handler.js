export function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: 'Route not found',
    statusCode: 404,
    meta: { requestId: req.requestId }
  });
}

export function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  const payload = {
    error: err.error || 'INTERNAL_ERROR',
    message: err.message || 'Internal Server Error',
    statusCode
  };
  if (err.details) payload.details = err.details;
  payload.meta = { requestId: req.requestId };
  res.status(statusCode).json(payload);
}
