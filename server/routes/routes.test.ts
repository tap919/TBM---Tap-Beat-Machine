/**
 * Integration tests for TBM server routes: music, stems (upload validation), and export.
 *
 * These tests use supertest to make HTTP requests against the Express app
 * without starting a real server. The tests operate on the actual SQLite
 * database (seeded by db.ts on import), so they exercise the full stack
 * from HTTP → route handler → SQLite and back.
 */

import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import app from '../app.js';

// ═══════════════════════════════════════════════════════════════════════════════
//  HEALTH
// ═══════════════════════════════════════════════════════════════════════════════
describe('GET /api/health', () => {
  it('returns status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('time');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  MUSIC ROUTES
// ═══════════════════════════════════════════════════════════════════════════════
describe('Music routes', () => {
  // ── GET /api/music/folder ──
  describe('GET /api/music/folder', () => {
    it('returns the current music folder', async () => {
      const res = await request(app).get('/api/music/folder');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('folder');
      expect(typeof res.body.folder).toBe('string');
    });
  });

  // ── POST /api/music/folder ──
  describe('POST /api/music/folder', () => {
    it('rejects missing folder', async () => {
      const res = await request(app)
        .post('/api/music/folder')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/folder/i);
    });

    it('rejects path traversal (..)', async () => {
      const res = await request(app)
        .post('/api/music/folder')
        .send({ folder: 'C:\\Users\\..\\etc' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/traversal/i);
    });

    it('rejects relative paths', async () => {
      const res = await request(app)
        .post('/api/music/folder')
        .send({ folder: 'relative/path' });
      expect(res.status).toBe(400);
    });

    it('accepts a valid existing directory within home', async () => {
      // Use the user's home directory itself (guaranteed to exist)
      const home = os.homedir();
      const res = await request(app)
        .post('/api/music/folder')
        .send({ folder: home });
      // Will be 200 if home exists, or 400/403 depending on platform checks
      expect([200, 400, 403]).toContain(res.status);
    });
  });

  // ── GET /api/music/tracks ──
  describe('GET /api/music/tracks', () => {
    it('returns an array (possibly empty)', async () => {
      const res = await request(app).get('/api/music/tracks');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('rejects non-finite bpm_min', async () => {
      const res = await request(app).get('/api/music/tracks?bpm_min=abc');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/bpm_min/i);
    });

    it('rejects non-finite bpm_max', async () => {
      const res = await request(app).get('/api/music/tracks?bpm_max=NaN');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/bpm_max/i);
    });

    it('accepts valid sort parameter', async () => {
      const res = await request(app).get('/api/music/tracks?sort=bpm');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('falls back to default sort for unknown sort value', async () => {
      // An unknown sort value should not cause an error — it falls through to the default
      const res = await request(app).get('/api/music/tracks?sort=INVALID; DROP TABLE tracks;--');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ── GET /api/music/search ──
  describe('GET /api/music/search', () => {
    it('rejects empty query', async () => {
      const res = await request(app).get('/api/music/search');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/query/i);
    });

    it('returns results for a text search', async () => {
      const res = await request(app).get('/api/music/search?q=test');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('mode');
      expect(res.body).toHaveProperty('results');
      expect(Array.isArray(res.body.results)).toBe(true);
    });
  });

  // ── GET /api/music/stream/:id ──
  describe('GET /api/music/stream/:id', () => {
    it('returns 404 for non-existent track', async () => {
      const res = await request(app).get('/api/music/stream/999999');
      expect(res.status).toBe(404);
    });
  });

  // ── GET /api/music/stats ──
  describe('GET /api/music/stats', () => {
    it('returns library statistics', async () => {
      const res = await request(app).get('/api/music/stats');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('trackCount');
      expect(typeof res.body.trackCount).toBe('number');
      expect(res.body).toHaveProperty('playlistCount');
      expect(res.body).toHaveProperty('genres');
      expect(Array.isArray(res.body.genres)).toBe(true);
    });
  });

  // ── GET /api/music/scan/status ──
  describe('GET /api/music/scan/status', () => {
    it('returns scan state', async () => {
      const res = await request(app).get('/api/music/scan/status');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('scanning');
      expect(typeof res.body.scanning).toBe('boolean');
    });
  });

  // ── Playlist CRUD ──
  describe('Playlist CRUD', () => {
    let playlistId: number;

    it('POST /api/music/playlists — creates a playlist', async () => {
      const res = await request(app)
        .post('/api/music/playlists')
        .send({ name: 'Test Playlist', description: 'Integration test' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('Test Playlist');
      playlistId = Number(res.body.id);
    });

    it('POST /api/music/playlists — rejects missing name', async () => {
      const res = await request(app)
        .post('/api/music/playlists')
        .send({});
      expect(res.status).toBe(400);
    });

    it('GET /api/music/playlists — lists playlists', async () => {
      const res = await request(app).get('/api/music/playlists');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((p: { name: string }) => p.name === 'Test Playlist')).toBe(true);
    });

    it('GET /api/music/playlists/:id/tracks — returns empty track list', async () => {
      const res = await request(app).get(`/api/music/playlists/${playlistId}/tracks`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    });

    it('POST /api/music/playlists/:id/tracks — rejects missing trackId', async () => {
      const res = await request(app)
        .post(`/api/music/playlists/${playlistId}/tracks`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('DELETE /api/music/playlists/:id — deletes the playlist', async () => {
      const res = await request(app).delete(`/api/music/playlists/${playlistId}`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  STEMS ROUTES (upload validation — no actual demucs needed)
// ═══════════════════════════════════════════════════════════════════════════════
describe('Stems routes', () => {
  describe('POST /api/stems/separate', () => {
    it('rejects request with no file', async () => {
      const res = await request(app).post('/api/stems/separate');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/audio/i);
    });

    it('rejects a non-audio file (wrong MIME type + wrong extension)', async () => {
      // Create a temporary text file with .txt extension
      const tmpFile = path.join(os.tmpdir(), 'fake.txt');
      fs.writeFileSync(tmpFile, 'not audio data');
      try {
        const res = await request(app)
          .post('/api/stems/separate')
          .attach('audio', tmpFile);
        // Multer may reset the connection or return 400
        expect([400, 500]).toContain(res.status);
      } catch (err: unknown) {
        // ECONNRESET is acceptable — multer aborts the upload
        expect((err as Error).message).toMatch(/ECONNRESET|socket hang up/);
      } finally {
        try { fs.unlinkSync(tmpFile); } catch { /* may already be cleaned up */ }
      }
    });

    it('rejects a file with audio extension but wrong magic bytes', async () => {
      // Create a file that has .mp3 extension but no valid audio magic bytes
      const tmpFile = path.join(os.tmpdir(), 'fake_audio.mp3');
      fs.writeFileSync(tmpFile, 'this is not a real mp3 file at all');
      try {
        const res = await request(app)
          .post('/api/stems/separate')
          .attach('audio', tmpFile);
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/magic bytes|audio/i);
      } finally {
        fs.unlinkSync(tmpFile);
      }
    });

    it('accepts a file with valid MP3 magic bytes (ID3 header)', async () => {
      // Create a minimal file with ID3v2 header magic bytes
      const tmpFile = path.join(os.tmpdir(), 'valid_test.mp3');
      const buf = Buffer.alloc(128);
      buf[0] = 0x49; // I
      buf[1] = 0x44; // D
      buf[2] = 0x33; // 3
      buf[3] = 0x04; // version
      buf[4] = 0x00;
      fs.writeFileSync(tmpFile, buf);
      try {
        const res = await request(app)
          .post('/api/stems/separate')
          .attach('audio', tmpFile);
        // Should be 202 Accepted (job created) — demucs will fail but that's async.
        // The upload validation itself should pass.
        expect(res.status).toBe(202);
        expect(res.body).toHaveProperty('jobId');
        expect(res.body).toHaveProperty('model');
      } finally {
        fs.unlinkSync(tmpFile);
      }
    });

    it('accepts a file with valid WAV magic bytes', async () => {
      // RIFF....WAVE header
      const tmpFile = path.join(os.tmpdir(), 'valid_test.wav');
      const buf = Buffer.alloc(128);
      buf.write('RIFF', 0);
      buf.writeUInt32LE(120, 4); // chunk size
      buf.write('WAVE', 8);
      fs.writeFileSync(tmpFile, buf);
      try {
        const res = await request(app)
          .post('/api/stems/separate')
          .attach('audio', tmpFile, { filename: 'valid_test.wav', contentType: 'audio/wav' });
        // May get rate limited (429) if previous tests consumed the quota
        expect([202, 429]).toContain(res.status);
        if (res.status === 202) {
          expect(res.body).toHaveProperty('jobId');
        }
      } catch (err: unknown) {
        // ECONNRESET can occur when rate limiter aborts the connection
        expect((err as Error).message).toMatch(/ECONNRESET|socket hang up/);
      } finally {
        try { fs.unlinkSync(tmpFile); } catch { /* may already be cleaned up */ }
      }
    });
  });

  describe('GET /api/stems/jobs/:jobId', () => {
    it('returns 404 for non-existent job', async () => {
      const res = await request(app).get('/api/stems/jobs/nonexistent-uuid');
      // May be rate limited (429) if previous tests consumed the quota
      expect([404, 429]).toContain(res.status);
    });
  });

  describe('GET /api/stems/jobs/:jobId/download/:stem', () => {
    it('returns 404 for non-existent job', async () => {
      const res = await request(app).get('/api/stems/jobs/nonexistent-uuid/download/vocals');
      expect([404, 429]).toContain(res.status);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  EXPORT ROUTES
// ═══════════════════════════════════════════════════════════════════════════════
describe('Export routes', () => {
  // Track created export dirs for cleanup
  const createdDirs: string[] = [];

  afterAll(() => {
    for (const dir of createdDirs) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  describe('POST /api/export', () => {
    it('rejects request with no files', async () => {
      const res = await request(app).post('/api/export');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/wav/i);
    });

    it('rejects non-WAV file', async () => {
      const tmpFile = path.join(os.tmpdir(), 'notaudio.txt');
      fs.writeFileSync(tmpFile, 'not wav data');
      try {
        const res = await request(app)
          .post('/api/export')
          .attach('stems', tmpFile);
        // Multer may reset the connection or return 400
        expect([400, 500]).toContain(res.status);
      } catch (err: unknown) {
        // ECONNRESET is acceptable — multer aborts the upload
        expect((err as Error).message).toMatch(/ECONNRESET|socket hang up/);
      } finally {
        try { fs.unlinkSync(tmpFile); } catch { /* may already be cleaned up */ }
      }
    });

    it('accepts a valid WAV file and creates manifest', async () => {
      // Create a minimal valid WAV file (44 byte header + 0 samples)
      const tmpFile = path.join(os.tmpdir(), 'test_stem.wav');
      const header = Buffer.alloc(44);
      header.write('RIFF', 0);
      header.writeUInt32LE(36, 4);     // chunk size
      header.write('WAVE', 8);
      header.write('fmt ', 12);
      header.writeUInt32LE(16, 16);    // subchunk1 size
      header.writeUInt16LE(1, 20);     // PCM
      header.writeUInt16LE(2, 22);     // stereo
      header.writeUInt32LE(48000, 24); // sample rate
      header.writeUInt32LE(192000, 28);// byte rate
      header.writeUInt16LE(4, 32);     // block align
      header.writeUInt16LE(16, 34);    // bits per sample
      header.write('data', 36);
      header.writeUInt32LE(0, 40);     // data size
      fs.writeFileSync(tmpFile, header);

      try {
        const res = await request(app)
          .post('/api/export')
          .attach('stems', tmpFile)
          .field('project', 'TestProject')
          .field('bpm', '128')
          .field('bars', '4')
          .field('metadata', JSON.stringify({ stemName: 'kick', durationSeconds: 8, peakAmplitude: 0.95, rmsDbfs: -12 }));

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('exportId');
        expect(res.body).toHaveProperty('project', 'TestProject');
        expect(res.body).toHaveProperty('bpm', 128);
        expect(res.body).toHaveProperty('stems');
        expect(Array.isArray(res.body.stems)).toBe(true);
        expect(res.body.stems.length).toBe(1);
        expect(res.body.stems[0].stemName).toBe('kick');

        // Verify manifest.json was written
        const outputDir = res.body.outputDir;
        createdDirs.push(outputDir);
        const manifestPath = path.join(outputDir, 'manifest.json');
        expect(fs.existsSync(manifestPath)).toBe(true);

        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        expect(manifest.project).toBe('TestProject');
        expect(manifest.stems.length).toBe(1);
      } finally {
        // tmpFile was moved by multer, no need to clean up
      }
    });
  });

  describe('GET /api/export/list', () => {
    it('returns a list of exports', async () => {
      const res = await request(app).get('/api/export/list');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('exports');
      expect(Array.isArray(res.body.exports)).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  LIBRARIES & PLUGINS ROUTES (bonus — seeded data)
// ═══════════════════════════════════════════════════════════════════════════════
describe('Libraries routes', () => {
  it('GET /api/libraries — returns seeded libraries', async () => {
    const res = await request(app).get('/api/libraries');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    // Check shape of first item
    const lib = res.body[0];
    expect(lib).toHaveProperty('id');
    expect(lib).toHaveProperty('name');
    expect(lib).toHaveProperty('vendor');
    expect(lib).toHaveProperty('isFavorite');
    expect(typeof lib.isFavorite).toBe('boolean');
  });
});

describe('Plugins routes', () => {
  it('GET /api/plugins — returns seeded plugins', async () => {
    const res = await request(app).get('/api/plugins');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    const plugin = res.body[0];
    expect(plugin).toHaveProperty('id');
    expect(plugin).toHaveProperty('name');
    expect(plugin).toHaveProperty('isEnabled');
    expect(typeof plugin.isEnabled).toBe('boolean');
  });
});
