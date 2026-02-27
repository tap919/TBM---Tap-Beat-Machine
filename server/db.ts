/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '..', 'data', 'tbm.db');

const db = new Database(DB_PATH);

// ── Schema ────────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS libraries (
    id        TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    vendor    TEXT NOT NULL,
    category  TEXT NOT NULL,
    size      TEXT NOT NULL,
    instruments INTEGER NOT NULL DEFAULT 0,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS plugins (
    id        TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    vendor    TEXT NOT NULL,
    type      TEXT NOT NULL CHECK(type IN ('VST2','VST3')),
    category  TEXT NOT NULL,
    is_enabled INTEGER NOT NULL DEFAULT 1,
    latency   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// ── Seed default libraries if empty ──────────────────────────────────────────
const libCount = (db.prepare('SELECT COUNT(*) AS n FROM libraries').get() as { n: number }).n;
if (libCount === 0) {
  const insertLib = db.prepare(`
    INSERT INTO libraries (id, name, vendor, category, size, instruments, is_favorite)
    VALUES (@id, @name, @vendor, @category, @size, @instruments, @is_favorite)
  `);
  const seedLibraries = [
    { id: 'lib1', name: 'The Giant',           vendor: 'TBM Instruments', category: 'Pianos & Keys',       size: '3.9 GB',  instruments: 2,   is_favorite: 1 },
    { id: 'lib2', name: 'Session Strings Pro 2',vendor: 'TBM Instruments', category: 'Strings',             size: '32.1 GB', instruments: 24,  is_favorite: 0 },
    { id: 'lib3', name: 'Action Strikes',       vendor: 'TBM Instruments', category: 'Drums & Percussion',  size: '3.2 GB',  instruments: 12,  is_favorite: 1 },
    { id: 'lib4', name: 'Damage 2',             vendor: 'TBM Instruments', category: 'Drums & Percussion',  size: '60.5 GB', instruments: 48,  is_favorite: 1 },
    { id: 'lib5', name: 'Exhale',               vendor: 'TBM Instruments', category: 'Choir & Vocals',      size: '9.2 GB',  instruments: 500, is_favorite: 0 },
    { id: 'lib6', name: 'Straylight',           vendor: 'TBM Instruments', category: 'Sound Design',        size: '2.4 GB',  instruments: 380, is_favorite: 0 },
    { id: 'lib7', name: 'Pharlight',            vendor: 'TBM Instruments', category: 'Sound Design',        size: '1.2 GB',  instruments: 350, is_favorite: 0 },
    { id: 'lib8', name: 'Deep Compression Kit', vendor: 'TBM Instruments', category: 'Drums & Percussion',  size: '5.1 GB',  instruments: 64,  is_favorite: 0 },
    { id: 'lib9', name: 'Ethereal Pads Vol.1',  vendor: 'TBM Instruments', category: 'Pads',                size: '1.8 GB',  instruments: 120, is_favorite: 0 },
    { id: 'lib10',name: 'Vintage Keys',         vendor: 'TBM Instruments', category: 'Pianos & Keys',       size: '4.3 GB',  instruments: 8,   is_favorite: 0 },
  ];
  const seedMany = db.transaction(() => seedLibraries.forEach(lib => insertLib.run(lib)));
  seedMany();
}

// ── Seed default plugins if empty ─────────────────────────────────────────────
const plugCount = (db.prepare('SELECT COUNT(*) AS n FROM plugins').get() as { n: number }).n;
if (plugCount === 0) {
  const insertPlug = db.prepare(`
    INSERT INTO plugins (id, name, vendor, type, category, is_enabled, latency)
    VALUES (@id, @name, @vendor, @type, @category, @is_enabled, @latency)
  `);
  const seedPlugins = [
    { id: 'v1', name: 'Lead Synth',        vendor: 'Built-in', type: 'VST3', category: 'Synth',      is_enabled: 1, latency: 0  },
    { id: 'v2', name: 'Parametric EQ',     vendor: 'Built-in', type: 'VST3', category: 'EQ',         is_enabled: 1, latency: 12 },
    { id: 'v3', name: 'Vintage Reverb',    vendor: 'Built-in', type: 'VST2', category: 'Reverb',     is_enabled: 1, latency: 0  },
    { id: 'v4', name: 'Atmosphere Pad',    vendor: 'Built-in', type: 'VST3', category: 'Synth',      is_enabled: 1, latency: 0  },
    { id: 'v5', name: 'Tape Saturator',    vendor: 'Built-in', type: 'VST2', category: 'Distortion', is_enabled: 0, latency: 0  },
    { id: 'v6', name: 'Retro Color',       vendor: 'Built-in', type: 'VST3', category: 'FX',         is_enabled: 1, latency: 0  },
    { id: 'v7', name: 'Spectral Shaper',   vendor: 'Built-in', type: 'VST3', category: 'EQ',         is_enabled: 1, latency: 0  },
    { id: 'v8', name: 'Analog Compressor', vendor: 'Built-in', type: 'VST3', category: 'Dynamics',   is_enabled: 0, latency: 0  },
  ];
  const seedMany = db.transaction(() => seedPlugins.forEach(p => insertPlug.run(p)));
  seedMany();
}

// ── Seed default settings if empty ───────────────────────────────────────────
const settingsCount = (db.prepare('SELECT COUNT(*) AS n FROM settings').get() as { n: number }).n;
if (settingsCount === 0) {
  const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
  const seedSettings = db.transaction(() => {
    insertSetting.run('driver',               'ASIO v2.0');
    insertSetting.run('bufferSize',           '128');
    insertSetting.run('sampleRate',           '44100 Hz');
    insertSetting.run('multiCore',            'true');
    insertSetting.run('highPrecision',        'false');
    insertSetting.run('oversampling',         'true');
    insertSetting.run('uiScale',              '100%');
    insertSetting.run('midiDevice',           'TBM Controller 49');
    insertSetting.run('themeId',              'tbm-default');
    insertSetting.run('autoSaveInterval',     '15');
  });
  seedSettings();
}

export default db;
