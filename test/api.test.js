import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import apiRouter from '../src/routes/api.js';
import { requestIdMiddleware } from '../src/middleware/request-id.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { initDb } from '../src/db/index.js';

initDb();

function app() {
  const a = express();
  a.use(express.json());
  a.use(cookieParser());
  a.use(requestIdMiddleware);
  a.use('/api', apiRouter);
  a.use(errorHandler);
  return a;
}

test('health has requestId', async () => {
  const res = await request(app()).get('/api/health');
  assert.equal(res.status, 200);
  assert.ok(res.headers['x-request-id']);
  assert.ok(res.body.meta.requestId);
});

test('ready works', async () => {
  const res = await request(app()).get('/api/ready');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.ready, true);
});

test('catalog budget validation', async () => {
  const res = await request(app()).get('/api/catalog?limit=999');
  assert.equal(res.status, 200);
  assert.equal(res.body.meta.paging.limit, 80);
});
