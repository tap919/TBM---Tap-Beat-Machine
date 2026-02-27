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
  const rows = db.prepare('SELECT * FROM libraries ORDER BY name ASC').all();
  res.json(rows.map((r: Record<string, unknown>) => ({
    id:          r.id,
    name:        r.name,
    vendor:      r.vendor,
    category:    r.category,
    size:        r.size,
    instruments: r.instruments,
    isFavorite:  Boolean(r.is_favorite),
  })));
});

// ── POST /api/libraries ───────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { name, vendor, category, size, instruments, isFavorite } = req.body as Record<string, unknown>;
  if (typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  const id = randomUUID();
  db.prepare(`
    INSERT INTO libraries (id, name, vendor, category, size, instruments, is_favorite)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, String(name), String(vendor ?? ''), String(category ?? 'Uncategorized'), String(size ?? '0 MB'), Number(instruments ?? 0), isFavorite ? 1 : 0);
  res.status(201).json({ id });
});

// ── PATCH /api/libraries/:id ──────────────────────────────────────────────────
router.patch('/:id', (req, res) => {
  const { isFavorite } = req.body as { isFavorite?: boolean };
  if (typeof isFavorite !== 'boolean') {
    res.status(400).json({ error: 'isFavorite (boolean) is required' });
    return;
  }
  db.prepare('UPDATE libraries SET is_favorite = ? WHERE id = ?').run(isFavorite ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

// ── DELETE /api/libraries/:id ─────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM libraries WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
