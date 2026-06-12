/**
 * TBM Electron main process
 *
 * Responsibilities:
 *  1. Create BrowserWindow with preload script (contextIsolation on)
 *  2. Load the native vst-host.node addon (N-API) for VST2/VST3 hosting
 *  3. Load the native audio-backend.node addon (N-API) for low-latency audio output
 *  4. Register ipcMain handlers that the renderer calls via window.vstBridge / window.audioBridge
 *
 * IPC channels (VST):
 *   vst:scan        – walk filesystem for VST2/3 plugins
 *   vst:load        – load a plugin .dll / .vst3 bundle
 *   vst:unload      – release a loaded plugin instance
 *   vst:getParams   – fetch parameter list
 *   vst:setParam    – set a normalised parameter value (0–1)
 *   vst:processBlock – process one audio block (Float32Array buffers)
 *
 * IPC channels (Audio):
 *   audio:getApis      – list compiled audio backends
 *   audio:getDevices   – enumerate output devices per API
 *   audio:openStream   – open a native audio output stream
 *   audio:closeStream  – close the stream
 *   audio:startStream  – start playback
 *   audio:stopStream   – stop playback
 *   audio:writeBlock   – push stereo float samples to ring buffer
 *   audio:getStreamInfo – query stream state
 */

'use strict';

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const os   = require('os');
const path = require('path');
const fs   = require('fs');

// ── Default VST paths (Windows) ───────────────────────────────────────────────
// Defined early so path-validation helpers and IPC handlers can all reference it.

const DEFAULT_VST_PATHS = [
  'C:\\Program Files\\VSTPlugins',
  'C:\\Program Files\\Common Files\\VST3',
  'C:\\Program Files\\Steinberg\\VSTPlugins',
  'C:\\Program Files (x86)\\VSTPlugins',
  'C:\\Program Files (x86)\\Common Files\\VST3',
];

// ── Native addon loading ─────────────────────────────────────────────────────
// The vst-host.node addon lives at native/build/Release/vst-host.node after
// `npm run build:native`. On first run (addon not yet compiled) we fall back
// gracefully so the rest of the app still works.

let vstHost = null;
let audioBackend = null;

function loadNativeAddon() {
  const addonPath = path.join(__dirname, 'native', 'build', 'Release', 'vst-host.node');
  if (!fs.existsSync(addonPath)) {
    console.warn('[vst-host] Native addon not built yet. Run: npm run build:native');
    return null;
  }
  try {
    const addon = require(addonPath);
    console.log('[vst-host] Native addon loaded successfully');
    return addon;
  } catch (err) {
    console.error('[vst-host] Failed to load native addon:', err.message);
    return null;
  }
}

function loadAudioBackend() {
  const addonPath = path.join(__dirname, 'native', 'build', 'Release', 'audio-backend.node');
  if (!fs.existsSync(addonPath)) {
    console.warn('[audio-backend] Native addon not built yet. Run: npm run build:native');
    return null;
  }
  try {
    const addon = require(addonPath);
    console.log('[audio-backend] Native addon loaded successfully');
    return addon;
  } catch (err) {
    console.error('[audio-backend] Failed to load native addon:', err.message);
    return null;
  }
}

// ── Path validation helpers ───────────────────────────────────────────────────

/**
 * Allowlist of root directories that VST scanning/loading is permitted under.
 * Only absolute, normalised paths that live inside these roots are accepted.
 */
const ALLOWED_VST_ROOTS = [
  ...DEFAULT_VST_PATHS,
  path.join(os.homedir(), 'VST3'),
  path.join(os.homedir(), 'VSTPlugins'),
];

/**
 * Resolve and validate a single path string.
 * Returns the resolved absolute path if it is safe, throws otherwise.
 * Rules:
 *  1. Must be a non-empty string.
 *  2. After `path.resolve`, must not contain null bytes.
 *  3. Must start with one of the allowed roots (prevents traversal to arbitrary FS locations).
 * @param {string} rawPath
 * @param {string[]} allowedRoots  – roots to validate against (default: ALLOWED_VST_ROOTS)
 * @returns {string}
 */
function validateVstPath(rawPath, allowedRoots) {
  if (typeof rawPath !== 'string' || rawPath.trim() === '') {
    throw new Error('VST path must be a non-empty string');
  }
  // Null-byte injection guard
  if (rawPath.includes('\0')) {
    throw new Error('VST path contains illegal null byte');
  }
  const resolved = path.resolve(rawPath);
  const roots = Array.isArray(allowedRoots) && allowedRoots.length > 0
    ? allowedRoots
    : ALLOWED_VST_ROOTS;
  const allowed = roots.some(root => {
    const resolvedRoot = path.resolve(root);
    // Ensure the path is *inside* the root (not just a prefix match — add sep)
    return resolved === resolvedRoot || resolved.startsWith(resolvedRoot + path.sep);
  });
  if (!allowed) {
    throw new Error(`VST path "${resolved}" is outside all allowed directories`);
  }
  return resolved;
}

/**
 * Validate and sanitise an array of search paths for vst:scan.
 * Invalid entries are silently skipped (we log them); valid ones are returned.
 * @param {unknown} rawPaths
 * @param {string[]} allowedRoots
 * @returns {string[]}
 */
function sanitiseScanPaths(rawPaths, allowedRoots) {
  if (!Array.isArray(rawPaths) || rawPaths.length === 0) return [];
  const safe = [];
  for (const p of rawPaths) {
    try {
      safe.push(validateVstPath(p, allowedRoots));
    } catch (err) {
      console.warn(`[vst:scan] Skipping unsafe path "${p}":`, err.message);
    }
  }
  return safe;
}

// ── IPC handlers ─────────────────────────────────────────────────────────────

/**
 * vst:scan
 * Input:  string[] searchPaths
 * Output: PluginInfo[]
 *   { path, name, vendor, type: 'VST2'|'VST3', category, numInputs, numOutputs }
 */
ipcMain.handle('vst:scan', async (_event, searchPaths) => {
  // Sanitise every caller-supplied path against the allowed-root allowlist.
  // Use DEFAULT_VST_PATHS as the fallback when the caller sends nothing.
  const safePaths = sanitiseScanPaths(searchPaths, ALLOWED_VST_ROOTS);
  const effectivePaths = safePaths.length > 0 ? safePaths : DEFAULT_VST_PATHS;

  if (!vstHost) {
    // Fallback: walk filesystem and return file-level metadata without loading
    return scanFilesFallback(effectivePaths);
  }
  return vstHost.scan(effectivePaths);
});

/**
 * vst:load
 * Input:  string pluginPath
 * Output: LoadedPluginInfo
 *   { instanceId, name, vendor, type, numInputs, numOutputs, numParams, sampleRate, blockSize }
 */
ipcMain.handle('vst:load', async (_event, pluginPath) => {
  if (!vstHost) throw new Error('VST native addon not available');
  // Validate path — throws if outside allowed roots or contains traversal sequences.
  const safePath = validateVstPath(pluginPath, ALLOWED_VST_ROOTS);
  return vstHost.loadPlugin(safePath);
});

/**
 * vst:unload
 * Input:  string instanceId
 * Output: { ok: boolean }
 */
ipcMain.handle('vst:unload', async (_event, instanceId) => {
  if (!vstHost) throw new Error('VST native addon not available');
  if (typeof instanceId !== 'string' || instanceId.trim() === '') {
    throw new Error('instanceId must be a non-empty string');
  }
  return vstHost.unloadPlugin(instanceId);
});

/**
 * vst:getParams
 * Input:  string instanceId
 * Output: ParamInfo[]
 *   { index, name, label, defaultValue, currentValue, minValue, maxValue }
 */
ipcMain.handle('vst:getParams', async (_event, instanceId) => {
  if (!vstHost) throw new Error('VST native addon not available');
  if (typeof instanceId !== 'string' || instanceId.trim() === '') {
    throw new Error('instanceId must be a non-empty string');
  }
  return vstHost.getParams(instanceId);
});

/**
 * vst:setParam
 * Input:  string instanceId, number paramIndex, number value (0–1 normalised)
 * Output: { ok: boolean }
 */
ipcMain.handle('vst:setParam', async (_event, instanceId, paramIndex, value) => {
  if (!vstHost) throw new Error('VST native addon not available');
  if (typeof instanceId !== 'string' || instanceId.trim() === '') {
    throw new Error('instanceId must be a non-empty string');
  }
  if (typeof paramIndex !== 'number' || !Number.isFinite(paramIndex) || paramIndex < 0 || !Number.isInteger(paramIndex)) {
    throw new Error('paramIndex must be a non-negative integer');
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('value must be a finite number');
  }
  // Clamp to 0–1 normalised range
  const clampedValue = Math.max(0, Math.min(1, value));
  return vstHost.setParam(instanceId, paramIndex, clampedValue);
});

/**
 * vst:processBlock
 * Input:  string instanceId, ArrayBuffer inputL, ArrayBuffer inputR, number blockSize
 * Output: { outputL: ArrayBuffer, outputR: ArrayBuffer }
 *
 * Buffers are transferred directly — the addon receives raw Float32Array views.
 */
ipcMain.handle('vst:processBlock', async (_event, instanceId, inputLBuf, inputRBuf, blockSize) => {
  if (!vstHost) throw new Error('VST native addon not available');
  if (typeof instanceId !== 'string' || instanceId.trim() === '') {
    throw new Error('instanceId must be a non-empty string');
  }
  if (!(inputLBuf instanceof ArrayBuffer) || !(inputRBuf instanceof ArrayBuffer)) {
    throw new Error('inputL and inputR must be ArrayBuffers');
  }
  if (typeof blockSize !== 'number' || !Number.isFinite(blockSize) || blockSize <= 0 || blockSize > 65536) {
    throw new Error('blockSize must be a positive integer <= 65536');
  }
  const inputL = new Float32Array(inputLBuf);
  const inputR = new Float32Array(inputRBuf);
  if (inputL.length < blockSize || inputR.length < blockSize) {
    throw new Error(`Buffer length (${inputL.length}) must be >= blockSize (${blockSize})`);
  }
  const result = vstHost.processBlock(instanceId, inputL, inputR, blockSize);
  // result.outputL / result.outputR are Float32Arrays from the native side
  return {
    outputL: result.outputL.buffer,
    outputR: result.outputR.buffer,
  };
});

/**
 * vst:openGui
 * Input:  string pluginPath
 * Output: void
 *
 * Opens the native GUI window for the specified plugin path.
 * Throws if the native addon does not support openGui.
 */
ipcMain.handle('vst:openGui', async (_event, pluginPath) => {
  if (!vstHost) throw new Error('VST native addon not available');
  if (typeof vstHost.openGui !== 'function') throw new Error('openGui not supported by this native addon build');
  // Validate path to prevent path-traversal exploitation of the native GUI loader.
  const safePath = validateVstPath(pluginPath, ALLOWED_VST_ROOTS);
  return vstHost.openGui(safePath);
});

// ── Audio backend IPC handlers ───────────────────────────────────────────────

/**
 * audio:getApis
 * Output: string[]  (e.g. ["WASAPI", "DirectSound"])
 */
ipcMain.handle('audio:getApis', async () => {
  if (!audioBackend) return [];
  try {
    return audioBackend.getApis();
  } catch (err) {
    console.error('[audio:getApis]', err.message);
    return [];
  }
});

/**
 * audio:getDevices
 * Input:  string? apiName
 * Output: AudioDeviceInfo[]
 */
ipcMain.handle('audio:getDevices', async (_event, apiName) => {
  if (!audioBackend) return [];
  try {
    return audioBackend.getDevices(apiName || undefined);
  } catch (err) {
    console.error('[audio:getDevices]', err.message);
    return [];
  }
});

/**
 * audio:openStream
 * Input:  { api?: string, deviceId?: number, sampleRate?: number, bufferSize?: number }
 * Output: { ok, actualSampleRate, actualBufferSize, api, device }
 */
ipcMain.handle('audio:openStream', async (_event, config) => {
  if (!audioBackend) throw new Error('Audio backend native addon not available');
  if (typeof config !== 'object' || config === null) {
    throw new Error('config must be an object');
  }
  // Validate numeric fields
  if (config.sampleRate !== undefined) {
    if (typeof config.sampleRate !== 'number' || !Number.isFinite(config.sampleRate) || config.sampleRate < 8000 || config.sampleRate > 384000) {
      throw new Error('sampleRate must be a finite number between 8000 and 384000');
    }
  }
  if (config.bufferSize !== undefined) {
    if (typeof config.bufferSize !== 'number' || !Number.isFinite(config.bufferSize) || config.bufferSize < 16 || config.bufferSize > 8192) {
      throw new Error('bufferSize must be a finite number between 16 and 8192');
    }
  }
  if (config.deviceId !== undefined) {
    if (typeof config.deviceId !== 'number' || !Number.isInteger(config.deviceId)) {
      throw new Error('deviceId must be an integer');
    }
  }
  if (config.api !== undefined) {
    if (typeof config.api !== 'string' || config.api.trim() === '') {
      throw new Error('api must be a non-empty string');
    }
  }
  return audioBackend.openStream(config);
});

/**
 * audio:closeStream
 * Output: { ok: boolean }
 */
ipcMain.handle('audio:closeStream', async () => {
  if (!audioBackend) throw new Error('Audio backend native addon not available');
  return audioBackend.closeStream();
});

/**
 * audio:startStream
 * Output: { ok: boolean }
 */
ipcMain.handle('audio:startStream', async () => {
  if (!audioBackend) throw new Error('Audio backend native addon not available');
  return audioBackend.startStream();
});

/**
 * audio:stopStream
 * Output: { ok: boolean }
 */
ipcMain.handle('audio:stopStream', async () => {
  if (!audioBackend) throw new Error('Audio backend native addon not available');
  return audioBackend.stopStream();
});

/**
 * audio:writeBlock
 * Input:  ArrayBuffer leftBuf, ArrayBuffer rightBuf
 * Output: { ok: boolean }
 *
 * Receives Float32Array data from the renderer's AudioWorklet capture.
 */
ipcMain.handle('audio:writeBlock', async (_event, leftBuf, rightBuf) => {
  if (!audioBackend) throw new Error('Audio backend native addon not available');
  if (!(leftBuf instanceof ArrayBuffer) || !(rightBuf instanceof ArrayBuffer)) {
    throw new Error('leftBuf and rightBuf must be ArrayBuffers');
  }
  const left = new Float32Array(leftBuf);
  const right = new Float32Array(rightBuf);
  return audioBackend.writeBlock(left, right);
});

/**
 * audio:getStreamInfo
 * Output: { isOpen, isRunning, sampleRate, bufferSize, api, device }
 */
ipcMain.handle('audio:getStreamInfo', async () => {
  if (!audioBackend) {
    return { isOpen: false, isRunning: false, sampleRate: 0, bufferSize: 0, api: 'none', device: 'none' };
  }
  try {
    return audioBackend.getStreamInfo();
  } catch (err) {
    console.error('[audio:getStreamInfo]', err.message);
    return { isOpen: false, isRunning: false, sampleRate: 0, bufferSize: 0, api: 'none', device: 'none' };
  }
});

// ── File-level fallback scanner (no native addon required) ───────────────────
// Walks directories recursively for .dll and .vst3 files and returns minimal
// metadata derived from the filename. No plugin loading — zero crash risk.

function scanFilesFallback(searchPaths) {
  const results = [];
  for (const searchPath of searchPaths) {
    if (!fs.existsSync(searchPath)) continue;
    walkDir(searchPath, results);
  }
  return results;
}

function walkDir(dir, results, depth = 0) {
  if (depth > 5) return; // safety limit
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    // Resolve symlinks so a symlink pointing outside the allowed VST roots
    // cannot be used to escape the validated directories.
    let realPath;
    try {
      realPath = fs.realpathSync(fullPath);
    } catch {
      // Broken symlink or permission error — skip entry
      continue;
    }

    // Validate the resolved real path against the allowed roots.
    // Use a local check (not validateVstPath which throws) so we can skip
    // quietly rather than abort the whole scan.
    const isAllowed = ALLOWED_VST_ROOTS.some(root => {
      const resolvedRoot = path.resolve(root);
      return realPath === resolvedRoot || realPath.startsWith(resolvedRoot + path.sep);
    });
    if (!isAllowed) {
      console.warn(`[vst:scan] Skipping path outside allowed roots (possible symlink escape): "${realPath}"`);
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (entry.isDirectory()) {
      if (ext === '.vst3') {
        // VST3 bundle (directory with .vst3 extension — standard on Windows)
        results.push({
          path: fullPath,
          name: path.basename(entry.name, ext),
          vendor: 'Unknown',
          type: 'VST3',
          category: 'FX',
          numInputs: 2,
          numOutputs: 2,
        });
      } else {
        walkDir(fullPath, results, depth + 1);
      }
    } else if (entry.isFile()) {
      if (ext === '.dll') {
        // Only classify DLLs in known VST directories as VST2 plugins
        // to avoid false positives from random system/application DLLs.
        const parentDir = path.basename(path.dirname(fullPath)).toLowerCase();
        const inVstDir = parentDir.includes('vst') ||
                         parentDir.includes('plugin') ||
                         parentDir.includes('steinberg');
        if (inVstDir) {
          results.push({
            path: fullPath,
            name: path.basename(entry.name, ext),
            vendor: 'Unknown',
            type: 'VST2',
            category: 'FX',
            numInputs: 2,
            numOutputs: 2,
          });
        }
      }
    }
  }
}



// ── Native folder dialog ─────────────────────────────────────────────────────

/**
 * dialog:openFolder
 * Input:  (none)
 * Output: string | null  – selected folder path, or null if cancelled
 */
ipcMain.handle('dialog:openFolder', async (_event) => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Select Music Folder',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// ── Window creation ──────────────────────────────────────────────────────────

function createWindow() {
  vstHost = loadNativeAddon();
  audioBackend = loadAudioBackend();

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'TBM 1.0',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'electron-preload.js'),
    },
    autoHideMenuBar: true,
  });

  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    win.loadURL('http://localhost:3000');
  } else {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
