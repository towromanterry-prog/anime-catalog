import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyz', 20);

export function requestIdMiddleware(req, res, next) {
  const requestId = req.header('x-request-id') || nanoid();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}
