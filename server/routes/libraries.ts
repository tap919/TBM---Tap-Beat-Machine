/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';

const router = Router();

// ── GET /api/libraries ────────────────────────────────────────────────────────
router.get('/', (_req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM libraries ORDER BY name ASC').all();
    res.json((rows as Record<string, unknown>[]).map((r) => ({
      id:          r.id,
      name:        r.name,
      vendor:      r.vendor,
      category:    r.category,
      size:        r.size,
      instruments: r.instruments,
      isFavorite:  Boolean(r.is_favorite),
    })));
  } catch (err) {
    console.error('[GET /api/libraries]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/libraries ───────────────────────────────────────────────────────
router.post('/', (req, res) => {
  try {
    const { name, vendor, category, size, instruments, isFavorite } = req.body as Record<string, unknown>;
    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    // Validate instruments count — must be a non-negative finite integer
    const instrumentsNum = Number(instruments ?? 0);
    if (isNaN(instrumentsNum) || !isFinite(instrumentsNum) || instrumentsNum < 0) {
      res.status(400).json({ error: 'instruments must be a non-negative number' });
      return;
    }

    const id = randomUUID();
    db.prepare(`
      INSERT INTO libraries (id, name, vendor, category, size, instruments, is_favorite)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      String(name),
      String(vendor ?? ''),
      String(category ?? 'Uncategorized'),
      String(size ?? '0 MB'),
      Math.round(instrumentsNum),
      isFavorite ? 1 : 0,
    );
    res.status(201).json({ id });
  } catch (err) {
    console.error('[POST /api/libraries]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PATCH /api/libraries/:id ──────────────────────────────────────────────────
router.patch('/:id', (req, res) => {
  try {
    const { isFavorite } = req.body as { isFavorite?: boolean };
    if (typeof isFavorite !== 'boolean') {
      res.status(400).json({ error: 'isFavorite (boolean) is required' });
      return;
    }
    const result = db.prepare('UPDATE libraries SET is_favorite = ? WHERE id = ?').run(isFavorite ? 1 : 0, req.params.id);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Library not found' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /api/libraries/:id]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── DELETE /api/libraries/:id ─────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM libraries WHERE id = ?').run(req.params.id);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Library not found' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/libraries/:id]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
