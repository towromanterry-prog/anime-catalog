import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import apiRouter from './routes/api.js';
import { initDb } from './db/index.js';
import { config } from './config.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { loadSession } from './auth/session.js';
import { originCheck } from './middleware/security.js';

initDb();

const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: config.frontendUrl, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(requestIdMiddleware);
app.use(loadSession);
app.use(originCheck);

app.use('/api', apiRouter);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(__dirname, '../dist');
app.use(express.static(webDist));
app.get('*', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(config.port, config.host, () => {
  console.log(`API started at http://${config.host}:${config.port}`);
});
