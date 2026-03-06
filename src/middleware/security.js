import { config } from '../config.js';
import { forbidden } from '../utils/errors.js';

export function originCheck(req, _res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const origin = req.header('origin');
  if (!origin) return next();
  const allowed = config.frontendUrl;
  if (origin !== allowed) return next(forbidden('Invalid origin'));
  return next();
}

export function requireAdmin(req, _res, next) {
  const key = req.header('x-admin-key');
  if (key !== config.adminKey) return next(forbidden('Admin key required'));
  return next();
}
