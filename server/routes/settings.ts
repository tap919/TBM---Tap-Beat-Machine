/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import db from '../db.js';

const router = Router();

// ── GET /api/settings ─────────────────────────────────────────────────────────
router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const settings: Record<string, string> = {};
  for (const row of rows) settings[row.key] = row.value;
  res.json(settings);
});

// ── POST /api/settings ────────────────────────────────────────────────────────
// Accepts { key: value, ... } and upserts each pair
router.post('/', (req, res) => {
  const body = req.body as Record<string, unknown>;
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'body must be a key/value object' });
    return;
  }
  const upsert = db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  const upsertMany = db.transaction(() => {
    for (const [k, v] of Object.entries(body)) {
      upsert.run(String(k), String(v));
    }
  });
  upsertMany();
  res.json({ ok: true });
});

export default router;
