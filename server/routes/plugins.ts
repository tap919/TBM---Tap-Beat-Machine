/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import { randomUUID } from 'crypto';
import path from 'path';
import db from '../db.js';

const router = Router();

// ── GET /api/plugins ──────────────────────────────────────────────────────────
router.get('/', (_req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM plugins ORDER BY name ASC').all();
    res.json((rows as Record<string, unknown>[]).map((r) => ({
      id:        r.id,
      name:      r.name,
      vendor:    r.vendor,
      type:      r.type,
      category:  r.category,
      isEnabled: Boolean(r.is_enabled),
      latency:   Number(r.latency),
      path:      r.path ?? null,
    })));
  } catch (err) {
    console.error('[GET /api/plugins]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/plugins ─────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  try {
    const { name, vendor, type, category, isEnabled, latency, path: pluginPath } = req.body as Record<string, unknown>;
    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    if (type !== 'VST2' && type !== 'VST3') {
      res.status(400).json({ error: 'type must be VST2 or VST3' });
      return;
    }

    // Validate latency — must be a non-negative finite integer
    const latencyNum = Number(latency ?? 0);
    if (isNaN(latencyNum) || !isFinite(latencyNum) || latencyNum < 0) {
      res.status(400).json({ error: 'latency must be a non-negative number' });
      return;
    }

    // Sanitize path: reject null bytes and path-traversal sequences
    let safePath: string | null = null;
    if (typeof pluginPath === 'string') {
      if (pluginPath.includes('\0')) {
        res.status(400).json({ error: 'path contains illegal null byte' });
        return;
      }
      // Reject Windows Alternate Data Streams (colon after drive letter)
      // and UNC paths (\\server\share) which could access network resources
      const colonAfterDrive = pluginPath.length > 2 && pluginPath.indexOf(':', 2) !== -1;
      const isUNC = pluginPath.startsWith('\\\\') || pluginPath.startsWith('//');
      if (colonAfterDrive) {
        res.status(400).json({ error: 'path contains illegal ADS character' });
        return;
      }
      if (isUNC) {
        res.status(400).json({ error: 'UNC paths are not allowed' });
        return;
      }
      const normalized = path.normalize(pluginPath);
      // Reject obvious traversal attempts (..\ or ../)
      if (normalized.includes('..')) {
        res.status(400).json({ error: 'path contains illegal traversal sequence' });
        return;
      }
      safePath = normalized;
    }

    const id = randomUUID();
    db.prepare(`
      INSERT INTO plugins (id, name, vendor, type, category, is_enabled, latency, path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      String(name),
      String(vendor ?? 'Unknown'),
      String(type),
      String(category ?? 'Other'),
      isEnabled !== false ? 1 : 0,
      Math.round(latencyNum),
      safePath,
    );
    res.status(201).json({ id });
  } catch (err) {
    console.error('[POST /api/plugins]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PATCH /api/plugins/:id ────────────────────────────────────────────────────
router.patch('/:id', (req, res) => {
  try {
    const { isEnabled } = req.body as { isEnabled?: boolean };
    if (typeof isEnabled !== 'boolean') {
      res.status(400).json({ error: 'isEnabled (boolean) is required' });
      return;
    }
    const result = db.prepare('UPDATE plugins SET is_enabled = ? WHERE id = ?').run(isEnabled ? 1 : 0, req.params.id);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Plugin not found' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /api/plugins/:id]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── DELETE /api/plugins/:id ───────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM plugins WHERE id = ?').run(req.params.id);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Plugin not found' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/plugins/:id]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
