/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Express app configuration — extracted from index.ts so integration tests
 * can import the configured app without calling app.listen().
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import librariesRouter from './routes/libraries.js';
import pluginsRouter from './routes/plugins.js';
import settingsRouter from './routes/settings.js';
import analyzeRouter from './routes/analyze.js';
import stemsRouter from './routes/stems.js';
import exportRouter from './routes/export.js';
import musicRouter from './routes/music.js';
import llmRouter from './routes/llm.js';

const app = express();

app.use(express.json({ limit: '1mb' }));

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

// ── CORS: restrict to expected origins ───────────────────────────────────────
const RAW_ORIGINS = process.env.CORS_ORIGIN ?? 'http://localhost:3000,http://127.0.0.1:3000';
const ALLOWED_ORIGINS = new Set(
  RAW_ORIGINS.split(',')
    .map(o => o.trim())
    .filter(o => { try { const u = new URL(o); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; } }),
);

app.use((req, res, next) => {
  const origin = req.headers.origin ?? '';
  if (ALLOWED_ORIGINS.has(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
  }
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});
app.options('*', (_req, res) => res.sendStatus(204));

// ── API Key Authentication ─────────────────────────────────────────────────────
// Set API_KEY in .env to enable auth. When unset, all requests are allowed
// (safe for local-only development since the server binds to 127.0.0.1).
const API_KEY = process.env.API_KEY ?? '';
const AUTH_ENABLED = API_KEY.length > 0;

const requireApiKey = (req: Request, res: Response, next: NextFunction): void => {
  if (!AUTH_ENABLED) return next();
  // Allow GET/HEAD/OPTIONS without auth (read-only)
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const provided = req.headers['x-api-key'] as string | undefined;
  if (!provided || provided !== API_KEY) {
    res.status(401).json({ error: 'Unauthorized: valid X-API-Key header required' });
    return;
  }
  next();
};

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/libraries', apiLimiter, requireApiKey, librariesRouter);
app.use('/api/plugins',   apiLimiter, requireApiKey, pluginsRouter);
app.use('/api/settings',  apiLimiter, requireApiKey, settingsRouter);
app.use('/api/analyze',   analyzeLimiter, requireApiKey, analyzeRouter);
app.use('/api/stems',     stemsLimiter, requireApiKey, stemsRouter);
app.use('/api/export',    apiLimiter, requireApiKey, exportRouter);
app.use('/api/music',     apiLimiter, requireApiKey, musicRouter);
app.use('/api/llm',       apiLimiter, requireApiKey, llmRouter);

// ── Error handling ─────────────────────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  const hasType = (value: unknown): value is { type: string } =>
    typeof value === 'object' && value !== null && 'type' in value;
  const isParseError = err instanceof SyntaxError
    && hasType(err)
    && err.type === 'entity.parse.failed';
  if (isParseError) {
    res.status(400).json({ error: 'Invalid JSON payload' });
    return;
  }
  console.error('[Server] Unhandled route error:', err);
  res.status(500).json({ error: 'Server error' });
});

export default app;
