/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { config } from 'dotenv';
import app from './app.js';

config(); // Load .env

const PORT = Number(process.env.SERVER_PORT ?? 3001);

// ── Process-level error handlers ──────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught exception:', err);
  // Give time for logs to flush, then exit
  setTimeout(() => process.exit(1), 1000);
});

// ── Start ─────────────────────────────────────────────────────────────────────
// Bind to loopback only — do NOT expose to the network.
// In production, put a reverse proxy (nginx, Caddy) in front if external access is needed.
const HOST = process.env.SERVER_HOST ?? '127.0.0.1';
app.listen(PORT, HOST, () => {
  console.log(`TBM API server running on http://${HOST}:${PORT}`);
});
