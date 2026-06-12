/**
 * Electron preload script — runs in a privileged context with Node.js access.
 * Exposes a safe, typed IPC bridge to the renderer via contextBridge.
 *
 * All VST host communication goes through this bridge:
 *   window.vstBridge.scan(paths)          → Plugin[]
 *   window.vstBridge.loadPlugin(path)     → { id, name, vendor, numInputs, numOutputs, numParams }
 *   window.vstBridge.unloadPlugin(id)     → { ok }
 *   window.vstBridge.getParams(id)        → ParamInfo[]
 *   window.vstBridge.setParam(id, idx, v) → { ok }
 *   window.vstBridge.processBlock(id, inputL, inputR, blockSize) → { outputL, outputR }
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vstBridge', {
  /**
   * Scan one or more filesystem paths for VST2/VST3 plugins.
   * @param {string[]} searchPaths  - directories to walk
   * @returns {Promise<import('./native/vst-host').PluginInfo[]>}
   */
  scan: (searchPaths) =>
    ipcRenderer.invoke('vst:scan', searchPaths),

  /**
   * Load a VST2/VST3 plugin from its .dll / .vst3 path.
   * Returns a host-assigned instanceId to use in subsequent calls.
   * @param {string} pluginPath
   * @returns {Promise<import('./native/vst-host').LoadedPluginInfo>}
   */
  loadPlugin: (pluginPath) =>
    ipcRenderer.invoke('vst:load', pluginPath),

  /**
   * Unload and release a previously loaded plugin instance.
   * @param {string} instanceId
   * @returns {Promise<{ ok: boolean }>}
   */
  unloadPlugin: (instanceId) =>
    ipcRenderer.invoke('vst:unload', instanceId),

  /**
   * Retrieve parameter metadata for a loaded plugin.
   * @param {string} instanceId
   * @returns {Promise<import('./native/vst-host').ParamInfo[]>}
   */
  getParams: (instanceId) =>
    ipcRenderer.invoke('vst:getParams', instanceId),

  /**
   * Set a single parameter value.
   * @param {string} instanceId
   * @param {number} paramIndex
   * @param {number} value  - normalised 0.0–1.0
   * @returns {Promise<{ ok: boolean }>}
   */
  setParam: (instanceId, paramIndex, value) =>
    ipcRenderer.invoke('vst:setParam', instanceId, paramIndex, value),

  /**
   * Process one block of audio through the loaded plugin.
   * Buffers are copied via .slice(0) before transfer to avoid corrupting any
   * shared ArrayBuffer that the caller's Float32Array may be a view into.
   * @param {string} instanceId
   * @param {Float32Array} inputL
   * @param {Float32Array} inputR
   * @param {number} blockSize
   * @returns {Promise<{ outputL: Float32Array, outputR: Float32Array }>}
   */
  processBlock: (instanceId, inputL, inputR, blockSize) =>
    ipcRenderer.invoke(
      'vst:processBlock',
      instanceId,
      // Slice only the view's own bytes so we don't transfer extra data if the
      // Float32Array is a sub-view of a larger backing ArrayBuffer.
      inputL.buffer.slice(inputL.byteOffset, inputL.byteOffset + inputL.byteLength),
      inputR.buffer.slice(inputR.byteOffset, inputR.byteOffset + inputR.byteLength),
      blockSize,
    ),

  /**
   * Open the native GUI window for a plugin.
   * Only available when running in Electron with a native addon that supports openGui.
   * @param {string} pluginPath  - filesystem path to the .dll / .vst3 file
   * @returns {Promise<void>}
   */
  openGui: (pluginPath) =>
    ipcRenderer.invoke('vst:openGui', pluginPath),
});

// ── Audio bridge — native low-latency audio backend ──────────────────────────

contextBridge.exposeInMainWorld('audioBridge', {
  /**
   * List compiled audio APIs (e.g. ["WASAPI", "DirectSound"]).
   * @returns {Promise<string[]>}
   */
  getApis: () =>
    ipcRenderer.invoke('audio:getApis'),

  /**
   * Enumerate output devices for a specific API (or all if omitted).
   * @param {string} [api]
   * @returns {Promise<import('./src/lib/NativeAudioBridge').AudioDeviceInfo[]>}
   */
  getDevices: (api) =>
    ipcRenderer.invoke('audio:getDevices', api),

  /**
   * Open a native audio output stream.
   * @param {{ api?: string, deviceId?: number, sampleRate?: number, bufferSize?: number }} config
   * @returns {Promise<import('./src/lib/NativeAudioBridge').NativeStreamOpenResult>}
   */
  openStream: (config) =>
    ipcRenderer.invoke('audio:openStream', config),

  /**
   * Close the currently open native audio stream.
   * @returns {Promise<{ ok: boolean }>}
   */
  closeStream: () =>
    ipcRenderer.invoke('audio:closeStream'),

  /**
   * Start playback on the open stream.
   * @returns {Promise<{ ok: boolean }>}
   */
  startStream: () =>
    ipcRenderer.invoke('audio:startStream'),

  /**
   * Stop playback on the open stream.
   * @returns {Promise<{ ok: boolean }>}
   */
  stopStream: () =>
    ipcRenderer.invoke('audio:stopStream'),

  /**
   * Write a block of interleaved stereo audio to the native ring buffer.
   * Buffers are copied via .slice() before transfer to avoid corrupting any
   * shared ArrayBuffer that the caller's Float32Array may be a view into.
   * @param {Float32Array} leftF32
   * @param {Float32Array} rightF32
   * @returns {Promise<{ ok: boolean }>}
   */
  writeBlock: (leftF32, rightF32) =>
    ipcRenderer.invoke(
      'audio:writeBlock',
      leftF32.buffer.slice(leftF32.byteOffset, leftF32.byteOffset + leftF32.byteLength),
      rightF32.buffer.slice(rightF32.byteOffset, rightF32.byteOffset + rightF32.byteLength),
    ),

  /**
   * Get current stream state info.
   * @returns {Promise<import('./src/lib/NativeAudioBridge').NativeStreamInfo>}
   */
  getStreamInfo: () =>
    ipcRenderer.invoke('audio:getStreamInfo'),
});

// ── TBM bridge — non-VST Electron features ──────────────────────────────────

contextBridge.exposeInMainWorld('tbmBridge', {
  /**
   * Open a native folder-picker dialog.
   * @returns {Promise<string | null>}  Selected folder path, or null if cancelled.
   */
  openFolderDialog: () =>
    ipcRenderer.invoke('dialog:openFolder'),
});
