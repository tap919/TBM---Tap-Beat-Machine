/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Request, Response, type NextFunction } from 'express';
import multer from 'multer';
import { spawn, spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import db from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.resolve(__dirname, '..', '..', 'data', 'uploads');
const STEMS_DIR   = path.resolve(__dirname, '..', '..', 'data', 'stems');

// Ensure directories exist
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(STEMS_DIR, { recursive: true });

// ── Job state (persisted to SQLite, survives restarts) ────────────────────────
type JobStatus = 'queued' | 'running' | 'done' | 'error';

interface StemJob {
  id: string;
  status: JobStatus;
  progress: number;   // 0-100
  phase: string;      // human-readable description of current phase
  model: string;
  trackName: string;
  trackNameNoExt: string; // sanitized name used for demucs output directory
  uploadDir: string;      // actual upload directory for TTL cleanup
  outputDir: string;
  stems: string[];    // stem file names available when done
  error?: string;
  createdAt: number;
}

// Prepared statements for persistent stem job storage (fixes HIGH-06)
const insertJob = db.prepare(`
  INSERT INTO stem_jobs (id, status, progress, phase, model, track_name, track_name_no_ext, upload_dir, output_dir, stems, error, created_at)
  VALUES (@id, @status, @progress, @phase, @model, @trackName, @trackNameNoExt, @uploadDir, @outputDir, @stems, @error, @createdAt)
`);
const updateJob = db.prepare(`
  UPDATE stem_jobs SET status = @status, progress = @progress, phase = @phase, stems = @stems, error = @error WHERE id = @id
`);
const getJob = db.prepare('SELECT * FROM stem_jobs WHERE id = ?');
const listJobs = db.prepare('SELECT * FROM stem_jobs ORDER BY created_at DESC LIMIT 50');
const deleteJob = db.prepare('DELETE FROM stem_jobs WHERE id = ?');

function loadJob(id: string): StemJob | undefined {
  const row = getJob.get(id) as Record<string, unknown> | undefined;
  if (!row) return undefined;
  return {
    id: row.id as string,
    status: row.status as JobStatus,
    progress: row.progress as number,
    phase: row.phase as string,
    model: row.model as string,
    trackName: row.track_name as string,
    trackNameNoExt: row.track_name_no_ext as string,
    uploadDir: row.upload_dir as string,
    outputDir: row.output_dir as string,
    stems: JSON.parse(row.stems as string) as string[],
    error: row.error as string | undefined,
    createdAt: row.created_at as number,
  };
}

function saveJob(job: StemJob): void {
  insertJob.run({
    id: job.id,
    status: job.status,
    progress: job.progress,
    phase: job.phase,
    model: job.model,
    trackName: job.trackName,
    trackNameNoExt: job.trackNameNoExt,
    uploadDir: job.uploadDir,
    outputDir: job.outputDir,
    stems: JSON.stringify(job.stems),
    error: job.error ?? null,
    createdAt: job.createdAt,
  });
}

function patchJob(id: string, updates: Partial<StemJob>): void {
  updateJob.run({
    id,
    status: updates.status ?? 'queued',
    progress: updates.progress ?? 0,
    phase: updates.phase ?? '',
    stems: updates.stems ? JSON.stringify(updates.stems) : '[]',
    error: updates.error ?? null,
  });
}

// Expire jobs older than 1 hour
const JOB_TTL_MS = 60 * 60 * 1000;
const HEALTH_CHECK_TIMEOUT_MS = 8000;
setInterval(() => {
  const now = Date.now();
  const expired = db.prepare('SELECT id, output_dir, upload_dir FROM stem_jobs WHERE created_at < ?').all(now - JOB_TTL_MS) as { id: string; output_dir: string; upload_dir: string }[];
  for (const row of expired) {
    try { fs.rmSync(row.output_dir, { recursive: true, force: true }); } catch { /* ignore */ }
    try { fs.rmSync(row.upload_dir, { recursive: true, force: true }); } catch { /* ignore */ }
    deleteJob.run(row.id);
  }
}, 10 * 60 * 1000);

// ── Multer config ─────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(UPLOADS_DIR, randomUUID());
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    // SECURITY: sanitize the original filename to prevent path traversal.
    // 1. Strip any directory separators (/, \) and parent-directory sequences (..)
    // 2. Use only the basename after stripping
    const sanitized = file.originalname.replace(/[/\\]/g, '_').replace(/\.\./g, '_');
    const base = path.basename(sanitized);
    // Lowercase the extension so that filenames like "track.MP3" don't create
    // case-sensitivity mismatches on Linux (case-sensitive) filesystems.
    const rawExt = path.extname(base).toLowerCase();
    const ext = rawExt.replace(/[^a-zA-Z0-9]/g, '');
    const name = path.basename(base, path.extname(base)).replace(/[^a-zA-Z0-9_-]/g, '_');
    // Bug fix: if the file has no extension ext is "", and "${name}.${ext}" would
    // produce a trailing dot ("name.") which can confuse demucs's output path
    // derivation.  Omit the dot entirely when there is no extension.
    cb(null, ext ? `${name}.${ext}` : name);
  },
});

const ALLOWED_AUDIO_MIME = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav',
  'audio/flac', 'audio/x-flac', 'audio/aiff', 'audio/x-aiff',
  'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/aac',
]);

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
  fileFilter: (_req, file, cb) => {
    // SECURITY: require BOTH valid MIME type AND valid file extension.
    // Previously the OR condition allowed MIME spoofing (valid extension +
    // arbitrary content) or extension spoofing (valid MIME + .exe).
    const hasValidMime = ALLOWED_AUDIO_MIME.has(file.mimetype);
    const hasValidExt = /\.(mp3|wav|flac|aiff?|ogg|m4a|aac)$/i.test(file.originalname);
    if (hasValidMime && hasValidExt) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Validate that a file's first bytes match a known audio format magic signature.
 * This prevents attackers from uploading non-audio files (e.g. executables)
 * with spoofed MIME types and file extensions.
 *
 * Returns true if the file starts with a recognized audio signature.
 */
function validateAudioMagicBytes(filePath: string): boolean {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(12);
    const bytesRead = fs.readSync(fd, buf, 0, 12, 0);
    if (bytesRead < 4) return false;

    // MP3: starts with ID3v2 header or MPEG sync word
    if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return true; // "ID3"
    if (buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0) return true; // MPEG sync

    // WAV: "RIFF" + 4 bytes size + "WAVE"
    if (bytesRead >= 12 &&
        buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && // "RIFF"
        buf[8] === 0x57 && buf[9] === 0x41 && buf[10] === 0x56 && buf[11] === 0x45)  // "WAVE"
      return true;

    // FLAC: "fLaC"
    if (buf[0] === 0x66 && buf[1] === 0x4C && buf[2] === 0x61 && buf[3] === 0x43) return true;

    // OGG: "OggS"
    if (buf[0] === 0x4F && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) return true;

    // AIFF: "FORM" + 4 bytes size + "AIFF" or "AIFC"
    if (bytesRead >= 12 &&
        buf[0] === 0x46 && buf[1] === 0x4F && buf[2] === 0x52 && buf[3] === 0x4D && // "FORM"
        buf[8] === 0x41 && buf[9] === 0x49 && buf[10] === 0x46)                       // "AIF"
      return true;

    // M4A/AAC/MP4 container: "ftyp" at offset 4
    if (bytesRead >= 8 &&
        buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) // "ftyp"
      return true;

    return false;
  } finally {
    fs.closeSync(fd);
  }
}

/** Detect and validate python3 executable (lazy — only resolves on first use) */
let _pythonPath: string | null = null;
function getPython(): string {
  if (_pythonPath) return _pythonPath;
  const candidates = ['python3', 'python'];
  for (const c of candidates) {
    try {
      const r = spawnSync(c, ['--version'], { encoding: 'utf8' });
      if (r.status === 0 && r.stdout && typeof r.stdout === 'string') {
        const versionOutput = r.stdout.trim();
        // Verify it's actually Python by checking version string
        if (versionOutput.startsWith('Python 3')) {
          // Parse version number
          const match = versionOutput.match(/Python 3\.(\d+)/);
          if (match && parseInt(match[1], 10) >= 8) {
            _pythonPath = c;
            return c;
          }
        }
      }
    } catch { /* try next */ }
  }
  throw new Error('Python 3.8+ not found. Please install Python from https://www.python.org/downloads/');
}

/** Valid demucs model IDs */
const VALID_MODELS = new Set([
  'htdemucs', 'htdemucs_ft', 'mdx_extra', 'mdx_extra_q', 'htdemucs_6s',
]);

/** Map of model → expected stem names */
const MODEL_STEMS: Record<string, string[]> = {
  htdemucs:     ['drums', 'bass', 'vocals', 'other'],
  htdemucs_ft:  ['drums', 'bass', 'vocals', 'other'],
  mdx_extra:    ['drums', 'bass', 'vocals', 'other'],
  mdx_extra_q:  ['drums', 'bass', 'vocals', 'other'],
  htdemucs_6s:  ['drums', 'bass', 'vocals', 'guitar', 'piano', 'other'],
};

/**
 * Run demucs on the given audio file.
 * Updates the job record with progress and status.
 */
function runDemucs(job: StemJob, audioPath: string): void {
  let pythonCmd: string;
  try {
    pythonCmd = getPython();
  } catch (err) {
    job.status = 'error';
    job.error = err instanceof Error ? err.message : String(err);
    patchJob(job.id, { status: 'error', error: job.error });
    try { fs.rmSync(path.dirname(audioPath), { recursive: true, force: true }); } catch { /* ignore */ }
    return;
  }

  const outputDir = path.join(STEMS_DIR, job.id);
  job.outputDir = outputDir;
  fs.mkdirSync(outputDir, { recursive: true });

  // demucs -n <model> --mp3 -o <outputDir> <audioFile>
  const args = [
    '-m', 'demucs',
    '-n', job.model,
    '--mp3',
    '--mp3-bitrate', '192',
    '-d', 'cpu',         // always use CPU; GPU optional
    '-o', outputDir,
    audioPath,
  ];

  job.status = 'running';
  job.phase = 'Initializing model…';
  job.progress = 2;
  patchJob(job.id, { status: 'running', progress: 2, phase: 'Initializing model…' });

  const proc = spawn(pythonCmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });

  let stderr = '';
  let stdout = '';

  // Throttle DB writes for frequent progress updates
  let lastPersist = 0;

  const persistProgress = () => {
    const now = Date.now();
    if (now - lastPersist > 2000) { // persist at most every 2s
      lastPersist = now;
      patchJob(job.id, { status: job.status as any, progress: job.progress, phase: job.phase });
    }
  };

  proc.stdout.on('data', (chunk: Buffer) => {
    stdout += chunk.toString();
  });

  proc.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    stderr += text;

    // Parse tqdm progress from lines like:
    //   "  5%|▌         | 1/20 [00:03<01:08,  0.28it/s]"
    //   "Separating track track_name: 100%|██| 20/20 [00:30<00:00]"
    const pctMatch = text.match(/(\d{1,3})%\|/);
    if (pctMatch) {
      const rawPct = parseInt(pctMatch[1], 10);
      // Scale from 0-100 of demucs's own progress into 5-95 of our progress
      job.progress = 5 + Math.round(rawPct * 0.90);
    }

    if (/downloading/i.test(text)) {
      job.phase = 'Downloading model…';
    } else if (/loading/i.test(text)) {
      job.phase = 'Loading model…';
    } else if (/separating/i.test(text)) {
      job.phase = 'Separating stems…';
    }

    persistProgress();
  });

  proc.on('close', (code) => {
    if (code !== 0) {
      job.status = 'error';
      // Provide a user-friendly error for the most common failure: model download blocked
      if (/urlopen error|No address associated|ConnectionRefusedError|network/i.test(stderr)) {
        job.error = `Model "${job.model}" could not be downloaded. Demucs fetches model weights (~300 MB) from dl.fbaipublicfiles.com on first use. Please ensure the server has internet access to that host, then retry.`;
      } else {
        job.error = stderr.slice(-800).trim() || `Demucs exited with code ${code}`;
      }
      patchJob(job.id, { status: 'error', error: job.error });
      // Clean up the upload file and its directory
      try { fs.rmSync(path.dirname(audioPath), { recursive: true, force: true }); } catch { /* ignore */ }
      return;
    }

    // Find the output files.
    // Structure: <outputDir>/<model>/<trackNameNoExt>/<stem>.mp3
    const trackNameNoExt = path.basename(audioPath, path.extname(audioPath));
    job.trackNameNoExt = trackNameNoExt; // persist for download handler
    const stemDir = path.join(outputDir, job.model, trackNameNoExt);

    let foundStems: string[] = [];
    try {
      foundStems = fs.readdirSync(stemDir)
        .filter(f => /\.(mp3|wav|flac)$/i.test(f))
        .map(f => path.basename(f, path.extname(f))); // stem names without extension
    } catch {
      job.status = 'error';
      job.error = 'Stem output directory not found after separation.';
      patchJob(job.id, { status: 'error', error: job.error });
      return;
    }

    job.stems = foundStems;
    job.status = 'done';
    job.progress = 100;
    job.phase = 'Done';
    patchJob(job.id, { status: 'done', progress: 100, phase: 'Done', stems: foundStems });

    // Clean up the upload directory
    try { fs.rmSync(path.dirname(audioPath), { recursive: true, force: true }); } catch { /* ignore */ }
  });

  proc.on('error', (err) => {
    job.status = 'error';
    job.error = `Failed to start demucs: ${err.message}`;
    patchJob(job.id, { status: 'error', error: job.error });
  });
}

// ── Router ────────────────────────────────────────────────────────────────────
const router = Router();

/**
 * GET /api/stems/health
 * Returns whether demucs is installed and which models are cached.
 */
router.get('/health', async (_req, res, next) => {
  try {
    let pythonCmd: string;
    try {
      pythonCmd = getPython();
    } catch {
      res.json({
        installed: false,
        python: null,
        cachedModels: [],
        modelsDir: null,
        healthError: 'python_not_found',
      });
      return;
    }

    const health = await new Promise<{ installed: boolean; error?: string }>((resolve) => {
      const proc = spawn(pythonCmd, ['-m', 'demucs', '--help'], { stdio: 'ignore' });
      let settled = false;
      let failureReason: string | undefined;
      const timeoutId = setTimeout(() => {
        failureReason = 'timeout';
        console.warn(`Demucs health check timed out after ${HEALTH_CHECK_TIMEOUT_MS}ms`);
        proc.kill('SIGTERM');
        finish(false);
      }, HEALTH_CHECK_TIMEOUT_MS);
      function finish(value: boolean) {
        if (settled) return;
        settled = true;
        if (!value && !failureReason) {
          failureReason = 'exit';
        }
        if (proc.exitCode === null && proc.pid) {
          proc.kill('SIGTERM');
        }
        clearTimeout(timeoutId);
        proc.removeAllListeners('error');
        proc.removeAllListeners('close');
        resolve({ installed: value, error: failureReason });
      }
      proc.once('error', () => {
        failureReason = 'spawn_error';
        finish(false);
      });
      proc.once('close', (code) => {
        if (code !== 0 && !failureReason) {
          failureReason = `exit_${code ?? 'unknown'}`;
        }
        finish(code === 0);
      });
    });

    // Check torch hub cache for .th files (demucs model weights)
    const torchCacheDir = path.join(os.homedir(), '.cache', 'torch', 'hub', 'checkpoints');
    let cachedModels: string[] = [];
    try {
      // Demucs weight files are named like "<8hexchars>-<8hexchars>.th"
      // The 8-char hex prefix is the model identifier
      cachedModels = (await fs.promises.readdir(torchCacheDir))
        .filter(f => /^[0-9a-f]{8}-[0-9a-f]{8}\.th$/i.test(f))
        .map(f => f.replace(/-[0-9a-f]{8}\.th$/i, '')); // keep just the model ID prefix
    } catch { /* cache dir may not exist yet */ }

    res.json({
      installed: health.installed,
      python: pythonCmd,
      cachedModels: [...new Set(cachedModels)],
      modelsDir: torchCacheDir,
      healthError: health.error,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/stems/separate
 * Body: multipart/form-data with fields:
 *   - audio: the audio file
 *   - model: demucs model name (optional, default htdemucs_ft)
 *
 * Returns: { jobId }
 */
router.post('/separate', upload.single('audio'), (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'No audio file provided' });
    return;
  }

  // SECURITY: validate file magic bytes to ensure the upload is a real audio file,
  // not a renamed executable or other dangerous content.
  if (!validateAudioMagicBytes(file.path)) {
    // Clean up the uploaded file
    try { fs.rmSync(path.dirname(file.path), { recursive: true, force: true }); } catch { /* ignore */ }
    res.status(400).json({ error: 'File does not appear to be a valid audio file (magic bytes mismatch)' });
    return;
  }

  const modelParam = typeof req.body.model === 'string' ? req.body.model : 'htdemucs_ft';
  const model = VALID_MODELS.has(modelParam) ? modelParam : 'htdemucs_ft';

  const jobId = randomUUID();
  const job: StemJob = {
    id: jobId,
    status: 'queued',
    progress: 0,
    phase: 'Queued',
    model,
    trackName: file.originalname,
    trackNameNoExt: '',  // set by runDemucs after sanitization
    uploadDir: path.dirname(file.path), // actual upload directory for cleanup
    outputDir: '',
    stems: [],
    createdAt: Date.now(),
  };
  saveJob(job);

  // Start demucs asynchronously
  setImmediate(() => runDemucs(job, file.path));

  res.status(202).json({ jobId, model, trackName: file.originalname });
});

/**
 * GET /api/stems/jobs/:jobId
 * Returns job status and progress.
 */
router.get('/jobs/:jobId', (req: Request, res: Response) => {
  const job = loadJob(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  res.json({
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    phase: job.phase,
    model: job.model,
    trackName: job.trackName,
    stems: job.stems,
    error: job.error,
  });
});

/**
 * GET /api/stems/jobs/:jobId/download/:stem
 * Streams the separated stem audio file.
 */
router.get('/jobs/:jobId/download/:stem', (req: Request, res: Response) => {
  const job = loadJob(req.params.jobId);
  if (!job) { res.status(404).json({ error: 'Job not found' }); return; }
  if (job.status !== 'done') { res.status(409).json({ error: 'Job not complete' }); return; }

  // Sanitize stem name
  const stemName = req.params.stem.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!job.stems.includes(stemName)) {
    res.status(404).json({ error: `Stem "${stemName}" not found` });
    return;
  }

  // Find the file under outputDir/<model>/<trackNameNoExt>/<stem>.mp3
  // trackNameNoExt is set by runDemucs from the sanitized on-disk filename
  const stemFile = path.join(job.outputDir, job.model, job.trackNameNoExt, `${stemName}.mp3`);

  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Content-Disposition', `attachment; filename="${stemName}.mp3"`);
  res.setHeader('Accept-Ranges', 'bytes');
  const stream = fs.createReadStream(stemFile);
  stream.on('error', (err) => {
    console.warn('Stem stream failed', err);
    if (!res.headersSent) {
      const errWithCode = err as NodeJS.ErrnoException;
      if (errWithCode.code === 'ENOENT') {
        res.status(404).json({ error: 'Stem file not found on disk' });
      } else {
        res.status(500).json({ error: 'Failed to stream stem file' });
      }
    } else {
      res.destroy(err);
    }
  });
  stream.pipe(res);
});

// ── Multer error handler ──────────────────────────────────────────────────────
// Must be an Express 4-argument error middleware
// eslint-disable-next-line @typescript-eslint/no-unused-vars
router.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err.message === 'Only audio files are allowed' || err.message.includes('File too large')) {
    res.status(400).json({ error: err.message });
  } else {
    res.status(500).json({ error: 'Upload error' });
  }
});

export default router;
