/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Music Library API – folder-based library with metadata indexing,
 * multi-provider vector embeddings for semantic search, playlists, and streaming.
 */

import { Router, type Request, type Response } from 'express';
import path from 'path';
import fs from 'fs';
import { generateEmbedding } from '../llm-providers.js';
import db from '../db.js';

const router = Router();

// ── Audio extensions we index ────────────────────────────────────────────────
const AUDIO_EXTS = new Set([
  '.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma', '.aiff', '.aif', '.opus',
]);

// Default music folder
const DEFAULT_MUSIC_FOLDER = path.join(process.env.USERPROFILE ?? process.env.HOME ?? '', 'Music');

// ── Helpers ──────────────────────────────────────────────────────────────────

function getMusicFolder(): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('musicFolder') as { value: string } | undefined;
  return row?.value ?? DEFAULT_MUSIC_FOLDER;
}

/** Recursively collect audio file paths from a directory (async, bounded depth) */
async function walkDir(dir: string, maxDepth = 10): Promise<string[]> {
  const results: string[] = [];
  const queue: { path: string; depth: number }[] = [{ path: dir, depth: 0 }];
  
  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break;
    const { path: currentPath, depth } = item;
    
    if (depth >= maxDepth) {
      console.warn(`[Music] Skipping deep directory (depth ${depth}): ${currentPath}`);
      continue;
    }
    
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
    } catch {
      continue; // skip unreadable dirs
    }
    
    for (const entry of entries) {
      const full = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        queue.push({ path: full, depth: depth + 1 });
      } else if (entry.isFile() && AUDIO_EXTS.has(path.extname(entry.name).toLowerCase())) {
        results.push(full);
      }
    }
    
    // Yield to event loop every 1000 entries to prevent blocking
    if (queue.length > 0 && queue.length % 1000 === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }
  
  return results;
}

/** Parse metadata from a single audio file using music-metadata (ESM) */
async function parseTrackMetadata(filePath: string) {
  // music-metadata is ESM-only, dynamic import required
  const mm = await import('music-metadata');
  const stat = fs.statSync(filePath);
  const metadata = await mm.parseFile(filePath);
  const common = metadata.common;
  const format = metadata.format;

  return {
    file_path: filePath,
    filename: path.basename(filePath),
    title: common.title || path.basename(filePath, path.extname(filePath)),
    artist: common.artist || null,
    album: common.album || null,
    genre: common.genre?.[0] || null,
    year: common.year || null,
    duration: format.duration || null,
    bpm: (common as unknown as Record<string, unknown>).bpm as number ?? null,
    key: null as string | null,  // can be filled later via audio analysis
    bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : null,
    sample_rate: format.sampleRate || null,
    format: path.extname(filePath).slice(1).toLowerCase(),
    file_size: stat.size,
  };
}

/** Build a text description for embedding from track metadata */
function buildEmbeddingText(track: {
  title: string | null;
  artist: string | null;
  album: string | null;
  genre: string | null;
  bpm: number | null;
  key: string | null;
  year: number | null;
}): string {
  const parts: string[] = [];
  if (track.title) parts.push(track.title);
  if (track.artist) parts.push(`by ${track.artist}`);
  if (track.album) parts.push(`album ${track.album}`);
  if (track.genre) parts.push(`genre ${track.genre}`);
  if (track.bpm) parts.push(`${track.bpm} BPM`);
  if (track.key) parts.push(`key ${track.key}`);
  if (track.year) parts.push(`${track.year}`);
  return parts.join(' ');
}

/** Get embedding for a text string using the active LLM provider */
async function getEmbedding(text: string): Promise<number[] | null> {
  try {
    const result = await generateEmbedding({ text });
    return result?.embedding ?? null;
  } catch {
    return null;
  }
}

/** Cosine similarity between two vectors */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Prepared statements ──────────────────────────────────────────────────────
const insertTrack = db.prepare(`
  INSERT OR REPLACE INTO tracks
    (file_path, filename, title, artist, album, genre, year, duration, bpm, key, bitrate, sample_rate, format, file_size, embedding, last_scanned)
  VALUES
    (@file_path, @filename, @title, @artist, @album, @genre, @year, @duration, @bpm, @key, @bitrate, @sample_rate, @format, @file_size, @embedding, datetime('now'))
`);

const getAllTracks = db.prepare('SELECT * FROM tracks ORDER BY artist, title');
const getTrackById = db.prepare('SELECT * FROM tracks WHERE id = ?');
const getTrackByPath = db.prepare('SELECT id FROM tracks WHERE file_path = ?');
const searchTracksByText = db.prepare(`
  SELECT * FROM tracks
  WHERE title LIKE @q OR artist LIKE @q OR album LIKE @q OR genre LIKE @q OR filename LIKE @q
  ORDER BY artist, title
  LIMIT 100
`);
const getTracksWithEmbeddings = db.prepare('SELECT id, title, artist, album, genre, bpm, key, year, duration, format, file_size, filename, file_path, embedding FROM tracks WHERE embedding IS NOT NULL');
const deleteTrackById = db.prepare('DELETE FROM tracks WHERE id = ?');

// ── Scan status (in-memory for progress reporting) ───────────────────────────
let scanState: {
  scanning: boolean;
  total: number;
  processed: number;
  errors: number;
  currentFile: string;
  startedAt: string | null;
} = { scanning: false, total: 0, processed: 0, errors: 0, currentFile: '', startedAt: null };

/** Promise-based lock to prevent concurrent scans */
let scanLock: Promise<void> | null = null;

// ═══════════════════════════════════════════════════════════════════════════════
//  ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// ── GET /api/music/folder ────────────────────────────────────────────────────
// Get current music folder setting
router.get('/folder', (_req, res) => {
  res.json({ folder: getMusicFolder() });
});

// ── POST /api/music/folder ───────────────────────────────────────────────────
// Set music folder path
router.post('/folder', (req, res) => {
  const { folder } = req.body as { folder?: string };
  if (!folder || typeof folder !== 'string') {
    res.status(400).json({ error: 'folder path is required' });
    return;
  }
  
  // Validate path: must be absolute. path.normalize collapses any `..` sequences
  // before we inspect the result, so check for traversal on the RAW input first,
  // then normalize for subsequent use.
  if (folder.includes('..')) {
    res.status(400).json({ error: 'Path cannot contain parent directory traversal' });
    return;
  }
  const normalized = path.normalize(folder);
  if (normalized !== path.resolve(normalized)) {
    res.status(400).json({ error: 'Path must be absolute' });
    return;
  }
  
  // Restrict to user's home directory or below for security
  const userHome = process.env.USERPROFILE ?? process.env.HOME ?? '';
  if (userHome && !normalized.startsWith(path.resolve(userHome))) {
    res.status(403).json({ error: 'Path must be within user home directory' });
    return;
  }
  
  if (!fs.existsSync(normalized)) {
    res.status(400).json({ error: 'Folder does not exist' });
    return;
  }
  
  const stat = fs.statSync(normalized);
  if (!stat.isDirectory()) {
    res.status(400).json({ error: 'Path must be a directory' });
    return;
  }
  
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('musicFolder', normalized);
  res.json({ ok: true, folder: normalized });
});

// ── POST /api/music/scan ─────────────────────────────────────────────────────
// Kick off a scan of the music folder. Non-blocking; poll /scan/status for progress.
router.post('/scan', async (_req, res) => {
  // Atomic check-and-set via Promise-based lock (fixes HIGH-05: TOCTOU race)
  if (scanLock) {
    res.status(409).json({ error: 'Scan already in progress', ...scanState });
    return;
  }

  const folder = getMusicFolder();
  if (!fs.existsSync(folder)) {
    res.status(400).json({ error: `Music folder not found: ${folder}` });
    return;
  }

  // Reset state
  scanState = { scanning: true, total: 0, processed: 0, errors: 0, currentFile: '', startedAt: new Date().toISOString() };

  // Create lock that resolves when scan completes
  let resolveLock: () => void;
  scanLock = new Promise<void>((resolve) => { resolveLock = resolve; });

  res.json({ ok: true, message: 'Scan started', folder });

  // Run scan in background
  (async () => {
    try {
      const files = await walkDir(folder);
      scanState.total = files.length;

      // Remove tracks whose files no longer exist
      const allDbTracks = db.prepare('SELECT id, file_path FROM tracks').all() as { id: number; file_path: string }[];
      const existingFiles = new Set(files);
      const removeStale = db.prepare('DELETE FROM tracks WHERE id = ?');
      for (const t of allDbTracks) {
        if (!existingFiles.has(t.file_path)) {
          removeStale.run(t.id);
        }
      }

      for (const filePath of files) {
        scanState.currentFile = path.basename(filePath);
        try {
          // Skip if already indexed and file hasn't changed
          const existing = getTrackByPath.get(filePath) as { id: number } | undefined;
          if (existing) {
            const stat = fs.statSync(filePath);
            const dbTrack = getTrackById.get(existing.id) as { last_scanned: string; file_size: number } | undefined;
            if (dbTrack && dbTrack.file_size === stat.size) {
              scanState.processed++;
              continue; // unchanged, skip
            }
          }

          const meta = await parseTrackMetadata(filePath);
          const embeddingText = buildEmbeddingText(meta);
          const embedding = await getEmbedding(embeddingText);

          insertTrack.run({
            ...meta,
            embedding: embedding ? JSON.stringify(embedding) : null,
          });
        } catch {
          scanState.errors++;
        }
        scanState.processed++;
      }
    } finally {
      scanState.scanning = false;
      scanState.currentFile = '';
      scanLock = null;
      resolveLock!();
    }
  })().catch((err) => {
    console.error('[Music scan] Unhandled error in background scan:', err);
    scanState.scanning = false;
    scanState.currentFile = '';
    scanLock = null;
    resolveLock!();
  });
});

// ── GET /api/music/scan/status ───────────────────────────────────────────────
router.get('/scan/status', (_req, res) => {
  res.json(scanState);
});

// ── GET /api/music/tracks ────────────────────────────────────────────────────
// List all indexed tracks with optional filters

/** Allowlisted sort options → SQL ORDER BY clause (prevents any SQL injection via sort param) */
const SORT_CLAUSES: Record<string, string> = {
  bpm:      'ORDER BY bpm',
  artist:   'ORDER BY artist, title',
  title:    'ORDER BY title',
  genre:    'ORDER BY genre, artist',
  duration: 'ORDER BY duration',
};
const DEFAULT_SORT = 'ORDER BY artist, title';

router.get('/tracks', (req: Request, res: Response) => {
  const { genre, artist, bpm_min, bpm_max, key, sort } = req.query;
  let sql = 'SELECT id, filename, title, artist, album, genre, year, duration, bpm, key, bitrate, sample_rate, format, file_size, file_path FROM tracks WHERE 1=1';
  const params: Record<string, unknown> = {};

  if (genre && typeof genre === 'string') {
    sql += ' AND genre LIKE @genre';
    params.genre = `%${genre}%`;
  }
  if (artist && typeof artist === 'string') {
    sql += ' AND artist LIKE @artist';
    params.artist = `%${artist}%`;
  }
  if (bpm_min) {
    const n = Number(bpm_min);
    if (!Number.isFinite(n)) {
      res.status(400).json({ error: 'bpm_min must be a finite number' });
      return;
    }
    sql += ' AND bpm >= @bpm_min';
    params.bpm_min = n;
  }
  if (bpm_max) {
    const n = Number(bpm_max);
    if (!Number.isFinite(n)) {
      res.status(400).json({ error: 'bpm_max must be a finite number' });
      return;
    }
    sql += ' AND bpm <= @bpm_max';
    params.bpm_max = n;
  }
  if (key && typeof key === 'string') {
    sql += ' AND key = @key';
    params.key = key;
  }

  // Sort — look up from allowlist; unknown values fall through to the default
  const sortClause = (typeof sort === 'string' && SORT_CLAUSES[sort]) || DEFAULT_SORT;
  sql += ` ${sortClause}`;

  sql += ' LIMIT 500';

  const tracks = db.prepare(sql).all(params);
  res.json(tracks);
});

// ── GET /api/music/search ────────────────────────────────────────────────────
// Semantic search (Gemini embeddings) + text fallback
router.get('/search', async (req: Request, res: Response) => {
  const q = (req.query.q as string || '').trim();
  if (!q) {
    res.status(400).json({ error: 'Query parameter q is required' });
    return;
  }

  // Try semantic search first if we have embeddings
  {
    try {
      const queryEmbedding = await getEmbedding(q);
      if (queryEmbedding) {
        const tracksWithEmb = getTracksWithEmbeddings.all() as Array<{
          id: number; title: string; artist: string; album: string;
          genre: string; bpm: number; key: string; year: number;
          duration: number; format: string; file_size: number;
          filename: string; file_path: string; embedding: string;
        }>;

        const scored = tracksWithEmb.map(t => {
          const emb = JSON.parse(t.embedding) as number[];
          const sim = cosineSimilarity(queryEmbedding, emb);
          const { embedding: _, ...track } = t;
          return { ...track, score: sim };
        });

        scored.sort((a, b) => b.score - a.score);
        const results = scored.slice(0, 50);

        // If top result has decent similarity, return semantic results
        if (results.length > 0 && results[0].score > 0.3) {
          res.json({ mode: 'semantic', results });
          return;
        }
      }
    } catch {
      // fall through to text search
    }
  }

  // Fallback: text search
  const textResults = searchTracksByText.all({ q: `%${q}%` });
  res.json({ mode: 'text', results: textResults });
});

// ── GET /api/music/stream/:id ────────────────────────────────────────────────
// Stream an audio file by track ID
router.get('/stream/:id', (req: Request, res: Response) => {
  const track = getTrackById.get(Number(req.params.id)) as { file_path: string; format: string } | undefined;
  if (!track) {
    res.status(404).json({ error: 'Track not found' });
    return;
  }

  // Path traversal protection: resolve the file path and ensure it lives
  // within the configured music folder. This prevents an attacker who
  // managed to insert arbitrary paths into the DB from reading arbitrary files.
  const musicFolder = path.resolve(getMusicFolder());
  const resolvedPath = path.resolve(track.file_path);
  if (!resolvedPath.startsWith(musicFolder + path.sep) && resolvedPath !== musicFolder) {
    res.status(403).json({ error: 'Access denied: file is outside the music library folder' });
    return;
  }

  if (!fs.existsSync(resolvedPath)) {
    res.status(404).json({ error: 'Audio file not found on disk' });
    return;
  }

  const stat = fs.statSync(resolvedPath);
  const mimeTypes: Record<string, string> = {
    mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac',
    aac: 'audio/aac', ogg: 'audio/ogg', m4a: 'audio/mp4',
    wma: 'audio/x-ms-wma', aiff: 'audio/aiff', aif: 'audio/aiff',
    opus: 'audio/opus',
  };
  const mime = mimeTypes[track.format] || 'application/octet-stream';

  // Support range requests for seeking
  const range = req.headers.range;
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;

    // Validate range values
    if (isNaN(start) || start < 0 || start >= stat.size || (parts[1] && (isNaN(end) || end < start || end >= stat.size))) {
      res.status(416).setHeader('Content-Range', `bytes */${stat.size}`).end();
      return;
    }

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': mime,
    });
    fs.createReadStream(resolvedPath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': mime,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(resolvedPath).pipe(res);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  PLAYLISTS
// ═══════════════════════════════════════════════════════════════════════════════

// ── GET /api/music/playlists ─────────────────────────────────────────────────
router.get('/playlists', (_req, res) => {
  const playlists = db.prepare(`
    SELECT p.*, COUNT(pt.track_id) as track_count
    FROM playlists p
    LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
    GROUP BY p.id
    ORDER BY p.updated_at DESC
  `).all();
  res.json(playlists);
});

// ── POST /api/music/playlists ────────────────────────────────────────────────
router.post('/playlists', (req, res) => {
  const { name, description } = req.body as { name?: string; description?: string };
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  const result = db.prepare('INSERT INTO playlists (name, description) VALUES (?, ?)').run(name, description || '');
  res.json({ id: result.lastInsertRowid, name, description: description || '' });
});

// ── DELETE /api/music/playlists/:id ──────────────────────────────────────────
router.delete('/playlists/:id', (req, res) => {
  db.prepare('DELETE FROM playlists WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ── GET /api/music/playlists/:id/tracks ──────────────────────────────────────
router.get('/playlists/:id/tracks', (req, res) => {
  const tracks = db.prepare(`
    SELECT t.id, t.filename, t.title, t.artist, t.album, t.genre, t.year,
           t.duration, t.bpm, t.key, t.format, t.file_size, t.file_path,
           pt.position
    FROM playlist_tracks pt
    JOIN tracks t ON t.id = pt.track_id
    WHERE pt.playlist_id = ?
    ORDER BY pt.position
  `).all(Number(req.params.id));
  res.json(tracks);
});

// ── POST /api/music/playlists/:id/tracks ─────────────────────────────────────
// Add a track to a playlist
router.post('/playlists/:id/tracks', (req, res) => {
  const playlistId = Number(req.params.id);
  const { trackId } = req.body as { trackId?: number };
  if (!trackId) {
    res.status(400).json({ error: 'trackId is required' });
    return;
  }
  // Get max position
  const maxPos = db.prepare('SELECT MAX(position) as pos FROM playlist_tracks WHERE playlist_id = ?').get(playlistId) as { pos: number | null };
  const position = (maxPos?.pos ?? -1) + 1;

  try {
    db.prepare('INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)').run(playlistId, trackId, position);
    db.prepare('UPDATE playlists SET updated_at = datetime(\'now\') WHERE id = ?').run(playlistId);
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: 'Track already in playlist' });
  }
});

// ── DELETE /api/music/playlists/:playlistId/tracks/:trackId ──────────────────
router.delete('/playlists/:playlistId/tracks/:trackId', (req, res) => {
  const { playlistId, trackId } = req.params;
  db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?').run(Number(playlistId), Number(trackId));
  db.prepare('UPDATE playlists SET updated_at = datetime(\'now\') WHERE id = ?').run(Number(playlistId));
  res.json({ ok: true });
});

// ── GET /api/music/stats ─────────────────────────────────────────────────────
// Quick stats about the library
router.get('/stats', (_req, res) => {
  const trackCount = (db.prepare('SELECT COUNT(*) as n FROM tracks').get() as { n: number }).n;
  const embeddedCount = (db.prepare('SELECT COUNT(*) as n FROM tracks WHERE embedding IS NOT NULL').get() as { n: number }).n;
  const totalSize = (db.prepare('SELECT COALESCE(SUM(file_size), 0) as s FROM tracks').get() as { s: number }).s;
  const genres = db.prepare('SELECT DISTINCT genre FROM tracks WHERE genre IS NOT NULL ORDER BY genre').all() as { genre: string }[];
  const artists = db.prepare('SELECT DISTINCT artist FROM tracks WHERE artist IS NOT NULL ORDER BY artist').all() as { artist: string }[];
  const playlistCount = (db.prepare('SELECT COUNT(*) as n FROM playlists').get() as { n: number }).n;

  res.json({
    trackCount,
    embeddedCount,
    totalSizeBytes: totalSize,
    totalSizeMB: Math.round(totalSize / (1024 * 1024)),
    genreCount: genres.length,
    genres: genres.map(g => g.genre),
    artistCount: artists.length,
    playlistCount,
  });
});

export default router;
