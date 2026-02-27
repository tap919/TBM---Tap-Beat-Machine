/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { spawn, spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.resolve(__dirname, '..', '..', 'data', 'uploads');
const STEMS_DIR   = path.resolve(__dirname, '..', '..', 'data', 'stems');

// Ensure directories exist
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(STEMS_DIR, { recursive: true });

// ── Job state (in-memory) ─────────────────────────────────────────────────────
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

const jobs = new Map<string, StemJob>();

// Expire jobs older than 1 hour
const JOB_TTL_MS = 60 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) {
      // Clean up output and upload directories
      try { fs.rmSync(job.outputDir, { recursive: true, force: true }); } catch { /* ignore */ }
      try { fs.rmSync(job.uploadDir, { recursive: true, force: true }); } catch { /* ignore */ }
      jobs.delete(id);
    }
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
    // Keep only safe characters; strip dots to avoid any traversal like `..` sequences
    const base = path.basename(file.originalname);
    const ext = path.extname(base).replace(/[^a-zA-Z0-9]/g, '');
    const name = path.basename(base, path.extname(base)).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${name}.${ext}`);
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
    if (
      ALLOWED_AUDIO_MIME.has(file.mimetype) ||
      /\.(mp3|wav|flac|aiff?|ogg|m4a|aac)$/i.test(file.originalname)
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Detect python3 executable name */
const PYTHON = (() => {
  const candidates = ['python3', 'python'];
  for (const c of candidates) {
    try {
      const r = spawnSync(c, ['--version'], { encoding: 'utf8' });
      if (r.status === 0) return c;
    } catch { /* try next */ }
  }
  return 'python3';
})();

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

  const proc = spawn(PYTHON, args, { stdio: ['ignore', 'pipe', 'pipe'] });

  let stderr = '';
  let stdout = '';

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
      return;
    }

    job.stems = foundStems;
    job.status = 'done';
    job.progress = 100;
    job.phase = 'Done';

    // Clean up the upload directory
    try { fs.rmSync(path.dirname(audioPath), { recursive: true, force: true }); } catch { /* ignore */ }
  });

  proc.on('error', (err) => {
    job.status = 'error';
    job.error = `Failed to start demucs: ${err.message}`;
  });
}

// ── Router ────────────────────────────────────────────────────────────────────
const router = Router();

/**
 * GET /api/stems/health
 * Returns whether demucs is installed and which models are cached.
 */
router.get('/health', (_req, res) => {
  const demucsCheck = spawnSync(PYTHON, ['-m', 'demucs', '--help'], { encoding: 'utf8' });
  const installed = demucsCheck.status === 0;

  // Check torch hub cache for .th files (demucs model weights)
  const torchCacheDir = path.join(os.homedir(), '.cache', 'torch', 'hub', 'checkpoints');
  let cachedModels: string[] = [];
  try {
    // Demucs weight files are named like "<8hexchars>-<8hexchars>.th"
    // The 8-char hex prefix is the model identifier
    cachedModels = fs.readdirSync(torchCacheDir)
      .filter(f => /^[0-9a-f]{8}-[0-9a-f]{8}\.th$/i.test(f))
      .map(f => f.replace(/-[0-9a-f]{8}\.th$/i, '')); // keep just the model ID prefix
  } catch { /* cache dir may not exist yet */ }

  res.json({
    installed,
    python: PYTHON,
    cachedModels: [...new Set(cachedModels)],
    modelsDir: torchCacheDir,
  });
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
  jobs.set(jobId, job);

  // Start demucs asynchronously
  setImmediate(() => runDemucs(job, file.path));

  res.status(202).json({ jobId, model, trackName: file.originalname });
});

/**
 * GET /api/stems/jobs/:jobId
 * Returns job status and progress.
 */
router.get('/jobs/:jobId', (req: Request, res: Response) => {
  const job = jobs.get(req.params.jobId);
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
  const job = jobs.get(req.params.jobId);
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

  if (!fs.existsSync(stemFile)) {
    res.status(404).json({ error: 'Stem file not found on disk' });
    return;
  }

  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Content-Disposition', `attachment; filename="${stemName}.mp3"`);
  res.setHeader('Accept-Ranges', 'bytes');
  fs.createReadStream(stemFile).pipe(res);
});

// ── Multer error handler ──────────────────────────────────────────────────────
import type { NextFunction } from 'express';

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
