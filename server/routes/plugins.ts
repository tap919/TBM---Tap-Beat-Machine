/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import db from '../db.js';

const router = Router();

// ── GET /api/plugins ──────────────────────────────────────────────────────────
router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM plugins ORDER BY name ASC').all();
  res.json(rows.map((r: Record<string, unknown>) => ({
    id:        r.id,
    name:      r.name,
    vendor:    r.vendor,
    type:      r.type,
    category:  r.category,
    isEnabled: Boolean(r.is_enabled),
    latency:   Number(r.latency),
  })));
});

// ── POST /api/plugins ─────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { name, vendor, type, category, isEnabled, latency } = req.body as Record<string, unknown>;
  if (typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  if (type !== 'VST2' && type !== 'VST3') {
    res.status(400).json({ error: 'type must be VST2 or VST3' });
    return;
  }
  const id = `plug_${Date.now()}`;
  db.prepare(`
    INSERT INTO plugins (id, name, vendor, type, category, is_enabled, latency)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, String(name), String(vendor ?? 'Unknown'), String(type), String(category ?? 'Other'), isEnabled !== false ? 1 : 0, Number(latency ?? 0));
  res.status(201).json({ id });
});

// ── PATCH /api/plugins/:id ────────────────────────────────────────────────────
router.patch('/:id', (req, res) => {
  const { isEnabled } = req.body as { isEnabled?: boolean };
  if (typeof isEnabled !== 'boolean') {
    res.status(400).json({ error: 'isEnabled (boolean) is required' });
    return;
  }
  db.prepare('UPDATE plugins SET is_enabled = ? WHERE id = ?').run(isEnabled ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

// ── DELETE /api/plugins/:id ───────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM plugins WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
