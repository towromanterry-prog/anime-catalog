import { config } from '../config.js';
import { forbidden, unauthorized } from '../utils/errors.js';

export function originCheck(req, _res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const origin = req.header('origin');
  if (!origin) return next();
  const allowed = config.frontendUrl;
  if (origin !== allowed) return next(forbidden('Invalid origin'));
  return next();
}

export function requireAdmin(req, _res, next) {
  if (!req.session) return next(unauthorized('Unauthorized'));
  if (!config.adminAnilistIds.includes(req.session.anilist_id)) return next(forbidden('Not an admin'));
  const key = req.header('x-admin-key');
  if (key !== config.adminKey) return next(forbidden('Admin key required'));
  return next();
}
