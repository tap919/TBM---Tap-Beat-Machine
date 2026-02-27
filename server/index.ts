/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import { config } from 'dotenv';
import librariesRouter from './routes/libraries.js';
import pluginsRouter from './routes/plugins.js';
import settingsRouter from './routes/settings.js';
import analyzeRouter from './routes/analyze.js';

config(); // Load .env

const app = express();
const PORT = Number(process.env.SERVER_PORT ?? 3001);

app.use(express.json());

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
app.use('/api/libraries', librariesRouter);
app.use('/api/plugins',   pluginsRouter);
app.use('/api/settings',  settingsRouter);
app.use('/api/analyze',   analyzeRouter);

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`TBM API server running on http://0.0.0.0:${PORT}`);
});
