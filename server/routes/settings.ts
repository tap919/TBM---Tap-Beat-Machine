/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import db from '../db.js';

const router = Router();

const ALLOWED_SETTINGS_KEYS = new Set([
  'driver', 'bufferSize', 'sampleRate', 'multiCore', 'highPrecision',
  'oversampling', 'uiScale', 'midiDevice', 'themeId', 'autoSaveInterval',
  'musicFolder',
]);

// ── GET /api/settings ─────────────────────────────────────────────────────────
router.get('/', (_req, res) => {
  try {
    const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    const settings: Record<string, string> = {};
    for (const row of rows) settings[row.key] = row.value;
    res.json(settings);
  } catch (err) {
    console.error('[GET /api/settings]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/settings ────────────────────────────────────────────────────────
// Accepts { key: value, ... } and upserts each pair
router.post('/', (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'body must be a key/value object' });
      return;
    }

    // Only allow recognised setting keys to prevent arbitrary writes
    const unknownKeys = Object.keys(body).filter(k => !ALLOWED_SETTINGS_KEYS.has(k));
    if (unknownKeys.length > 0) {
      res.status(400).json({ error: `Unknown settings keys: ${unknownKeys.join(', ')}` });
      return;
    }

    // Validate values: must be primitive scalars (string / number / boolean)
    for (const [k, v] of Object.entries(body)) {
      const t = typeof v;
      if (t !== 'string' && t !== 'number' && t !== 'boolean') {
        res.status(400).json({ error: `Value for key "${k}" must be a string, number, or boolean` });
        return;
      }
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
  } catch (err) {
    console.error('[POST /api/settings]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
