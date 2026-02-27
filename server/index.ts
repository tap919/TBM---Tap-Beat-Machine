/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import { config } from 'dotenv';
import librariesRouter from './routes/libraries.js';
import pluginsRouter from './routes/plugins.js';
import settingsRouter from './routes/settings.js';
import analyzeRouter from './routes/analyze.js';
import stemsRouter from './routes/stems.js';

config(); // Load .env

const app = express();
const PORT = Number(process.env.SERVER_PORT ?? 3001);

app.use(express.json());

// ── Rate limiting ─────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,            // 120 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
});

const analyzeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,             // 10 AI analysis calls per minute
  standardHeaders: true,
  legacyHeaders: false,
});

const stemsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,              // 5 separation jobs per minute
  standardHeaders: true,
  legacyHeaders: false,
});

// ── CORS: allow the Vite dev server ──────────────────────────────────────────
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});
app.options('*', (_req, res) => res.sendStatus(204));

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
app.use('/api/libraries', apiLimiter, librariesRouter);
app.use('/api/plugins',   apiLimiter, pluginsRouter);
app.use('/api/settings',  apiLimiter, settingsRouter);
app.use('/api/analyze',   analyzeLimiter, analyzeRouter);
app.use('/api/stems',     stemsLimiter, stemsRouter);

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`TBM API server running on http://0.0.0.0:${PORT}`);
});
