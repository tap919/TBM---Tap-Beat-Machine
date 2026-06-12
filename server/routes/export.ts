/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * POST /api/export
 *
 * Receives bounced audio stems (WAV or MP3) from TBM's BounceEngine, writes
 * them to the SPEC-defined directory structure under
 * audio/stems/tbm_to_mixing/{timestamp}/, creates a manifest.json with
 * loudness metadata, and returns the file paths.
 *
 * Per SPEC.md section 1.11.2:
 *   - File naming: {project}_{system}_{track}_{variant}_{version}.{ext}
 *   - Audio format: BWF WAV 48 kHz 24-bit (configurable), or MP3 CBR
 *   - Write to audio/stems/tbm_to_mixing/{timestamp}/
 *   - Create manifest.json (loudness data)
 */

import { Router, Request, Response, type NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Output root: <project>/audio/stems/tbm_to_mixing/
const STEMS_ROOT = path.resolve(__dirname, '..', '..', 'audio', 'stems', 'tbm_to_mixing');

// Ensure base directory exists
fs.mkdirSync(STEMS_ROOT, { recursive: true });

// ── Multer: store uploaded audio files on disk to avoid OOM with large stems ──
// Files are written to a temporary directory first, then moved to the final location.
const UPLOAD_TMP = path.join(os.tmpdir(), 'tbm-export-uploads');
fs.mkdirSync(UPLOAD_TMP, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_TMP),
    filename: (_req, file, cb) => cb(null, `${randomUUID()}_${file.originalname}`),
  }),
  limits: { fileSize: 500 * 1024 * 1024, files: 16 }, // 500 MB per file, max 16 stems
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === 'audio/wav' ||
      file.mimetype === 'audio/x-wav' ||
      file.mimetype === 'audio/wave' ||
      file.mimetype === 'audio/mpeg' ||
      file.mimetype === 'audio/mp3' ||
      /\.wav$/i.test(file.originalname) ||
      /\.mp3$/i.test(file.originalname)
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only WAV and MP3 files are accepted'));
    }
  },
});

// ── Types ──

interface StemManifestEntry {
  filename: string;
  stemName: string;
  durationSeconds: number;
  peakAmplitude: number;
  rmsDbfs: number;
  sampleRate: number;
  bitDepth: number;
  channels: number;
  /** Audio format: "wav" or "mp3" */
  format: string;
}

interface ExportManifest {
  version: string;
  exportId: string;
  project: string;
  system: string;
  bpm: number;
  bars: number;
  sampleRate: number;
  bitDepth: number;
  stems: StemManifestEntry[];
  exportedAt: string;
  outputDir: string;
}

// ── Router ──

const router = Router();

/**
 * POST /api/export
 *
 * Multipart form data:
 *   - stems[]     : Audio file(s) (WAV or MP3) — one per stem
 *   - metadata[]  : JSON string(s) — one per stem, matching order
 *                   { stemName, durationSeconds, peakAmplitude, rmsDbfs }
 *   - project     : Project name (string)
 *   - bpm         : BPM (number)
 *   - bars        : Number of bars bounced (number)
 *   - sampleRate  : Sample rate (number, default 48000)
 *   - bitDepth    : Bit depth (number, default 24)
 *
 * Response: ExportManifest JSON
 */
router.post('/', upload.array('stems', 16), async (req: Request, res: Response, next: NextFunction) => {
  // Helper: remove all uploaded temp files (best-effort, ignores errors)
  const cleanupTempFiles = () => {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files) return;
    for (const f of files) {
      try { fs.unlinkSync(f.path); } catch { /* already moved or missing */ }
    }
  };

  try {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No audio files provided' });
      return;
    }

    // Parse body fields
    const rawProject = typeof req.body.project === 'string' ? req.body.project : 'Untitled';
    const project = rawProject.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
    const bpm = Number(req.body.bpm) || 140;
    const bars = Number(req.body.bars) || 4;
    const sampleRate = Number(req.body.sampleRate) || 48000;
    const bitDepth = Number(req.body.bitDepth) || 24;

    // Parse per-stem metadata
    let metadataArray: Array<{
      stemName?: string;
      durationSeconds?: number;
      peakAmplitude?: number;
      rmsDbfs?: number;
    }> = [];

    const rawMeta = req.body.metadata;
    if (Array.isArray(rawMeta)) {
      metadataArray = rawMeta.map((m: string) => {
        try { return JSON.parse(m); } catch { return {}; }
      });
    } else if (typeof rawMeta === 'string') {
      try { metadataArray = [JSON.parse(rawMeta)]; } catch { metadataArray = [{}]; }
    }

    // Create timestamped output directory
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const exportId = randomUUID();
    const outputDir = path.join(STEMS_ROOT, timestamp);
    fs.mkdirSync(outputDir, { recursive: true });

    // Write each stem file
    const stemEntries: StemManifestEntry[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const meta = metadataArray[i] ?? {};
      const rawStemName = typeof meta.stemName === 'string' ? meta.stemName : `stem_${i}`;
      const stemName = rawStemName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
      // Determine file extension from the uploaded file's original name
      const ext = /\.mp3$/i.test(file.originalname) ? 'mp3' : 'wav';
      // SPEC file naming: {project}_{system}_{track}_{variant}_{version}.{ext}
      const filename = `${project}_tbm_${stemName}_bounced.${ext}`;
      const filePath = path.join(outputDir, filename);

      // Guard against path traversal — ensure resolved path stays inside STEMS_ROOT.
      // SECURITY: use path.relative() instead of startsWith() to avoid edge cases
      // where a path like "/stems_root_evil/..." would pass the startsWith check.
      const resolvedStemsRoot = path.resolve(STEMS_ROOT);
      const resolvedPath = path.resolve(filePath);
      const rel = path.relative(resolvedStemsRoot, resolvedPath);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        cleanupTempFiles();
        res.status(400).json({ error: `Invalid stem name: path traversal detected` });
        return;
      }

      // Move the uploaded temp file to the final location (diskStorage).
      // Fall back to copy+unlink if rename fails with EXDEV (cross-device link).
      try {
        fs.renameSync(file.path, filePath);
      } catch (renameErr: any) {
        if (renameErr?.code === 'EXDEV') {
          fs.copyFileSync(file.path, filePath);
          try { fs.unlinkSync(file.path); } catch { /* best effort */ }
        } else {
          throw renameErr;
        }
      }

      stemEntries.push({
        filename,
        stemName,
        durationSeconds: meta.durationSeconds ?? 0,
        peakAmplitude: meta.peakAmplitude ?? 0,
        rmsDbfs: meta.rmsDbfs ?? -Infinity,
        sampleRate,
        bitDepth,
        channels: 2,
        format: ext,
      });
    }

    // Build manifest
    const manifest: ExportManifest = {
      version: '1.0',
      exportId,
      project,
      system: 'tbm',
      bpm,
      bars,
      sampleRate,
      bitDepth,
      stems: stemEntries,
      exportedAt: new Date().toISOString(),
      outputDir,
    };

    // Write manifest.json
    fs.writeFileSync(
      path.join(outputDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
    );

    res.status(201).json(manifest);
  } catch (err) {
    cleanupTempFiles();
    next(err);
  }
});

/**
 * GET /api/export/list
 *
 * Returns a list of past exports (timestamps + stem counts).
 */
router.get('/list', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    if (!fs.existsSync(STEMS_ROOT)) {
      res.json({ exports: [] });
      return;
    }

    const dirs = fs.readdirSync(STEMS_ROOT, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .sort((a, b) => b.name.localeCompare(a.name)); // newest first

    const exports = dirs.map(d => {
      const manifestPath = path.join(STEMS_ROOT, d.name, 'manifest.json');
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as ExportManifest;
        return {
          timestamp: d.name,
          exportId: manifest.exportId,
          project: manifest.project,
          stemCount: manifest.stems.length,
          bpm: manifest.bpm,
          exportedAt: manifest.exportedAt,
        };
      } catch {
        return { timestamp: d.name, exportId: null, project: 'Unknown', stemCount: 0, bpm: 0, exportedAt: d.name };
      }
    });

    res.json({ exports });
  } catch (err) {
    next(err);
  }
});

// ── Multer error handler ──
// eslint-disable-next-line @typescript-eslint/no-unused-vars
router.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err.message === 'Only WAV and MP3 files are accepted' || err.message.includes('File too large')) {
    res.status(400).json({ error: err.message });
  } else {
    res.status(500).json({ error: 'Export error' });
  }
});

export default router;
