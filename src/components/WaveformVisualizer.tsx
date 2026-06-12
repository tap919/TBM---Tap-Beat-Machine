import React, { useState, useRef, useCallback, useEffect } from 'react';
import { UploadCloud, Scissors, Maximize, Wind, RotateCcw, Layers, Zap, Music, Plus, FileCode, Play, Square } from 'lucide-react';
import { Knob } from './Knob';
import { Pad as EnginePad, Sample as EngineSample } from '../lib/TBMAudioEngine';
import { useTBMAudio } from '../contexts/TBMAudioContext';
import { detectKeyFromBuffer } from '../lib/keyDetection';
import { STORAGE_KEYS } from '../lib/constants';

// Fix 6.1 🔴: extractWaveformAsync now accepts a cancellation signal.
// When cancelled (component unmount or new load), the rAF chain stops
// immediately and the promise resolves with whatever has been computed so far
// (the caller already guards with mountedRef so the partial result is discarded).
function extractWaveformAsync(
  buffer: AudioBuffer,
  numPoints: number,
  signal?: AbortSignal,
): Promise<number[]> {
  return new Promise(resolve => {
    const channelData = buffer.getChannelData(0);
    const blockSize = Math.floor(channelData.length / numPoints);
    const result = new Array<number>(numPoints).fill(0);
    let cursor = 0;
    let rafId = 0;
    const CHUNK = 32; // bars per frame — keeps each slice < 1ms for typical samples

    function processChunk() {
      if (signal?.aborted) {
        resolve(result); // partial — caller will discard after checking signal
        return;
      }
      const end = Math.min(cursor + CHUNK, numPoints);
      for (let i = cursor; i < end; i++) {
        let max = 0;
        const start = i * blockSize;
        for (let j = 0; j < blockSize; j++) {
          max = Math.max(max, Math.abs(channelData[start + j] || 0));
        }
        result[i] = max;
      }
      cursor = end;
      if (cursor < numPoints) {
        rafId = requestAnimationFrame(processChunk);
      } else {
        resolve(result);
      }
    }

    // If already aborted before we even start, short-circuit
    if (signal?.aborted) {
      resolve(result);
      return;
    }

    signal?.addEventListener('abort', () => {
      cancelAnimationFrame(rafId);
      resolve(result);
    }, { once: true });

    rafId = requestAnimationFrame(processChunk);
  });
}

// Memoized SVG waveform bars — only re-renders when waveform data or color changes
const WaveformBars = React.memo(function WaveformBars({
  waveform,
  fill,
  opacity,
}: {
  waveform: number[];
  fill: string;
  opacity: string;
}) {
  return (
    <g fill={fill} opacity={opacity} className="transition-colors duration-500">
      {waveform.map((val, i) => (
        <rect
          key={i}
          x={`${(i / waveform.length) * 100}%`}
          y={`${50 - val * 42}%`}
          width="0.55%"
          height={`${val * 84}%`}
          rx="1"
        />
      ))}
    </g>
  );
});

export const WaveformVisualizer = React.memo(function WaveformVisualizer() {
  const [isDragging, setIsDragging] = useState(false);
  const [isChopped, setIsChopped] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [lofiMode, _setLofiMode] = useState(false);
  const [pitch, setPitch] = useState(0);
  const [filter, setFilter] = useState(100);
  const [isNormalizing, setIsNormalizing] = useState(false);
  const [isDenoising, setIsDenoising] = useState(false);
  const [isReversed, setIsReversed] = useState(false);
  const [isStemMode, setIsStemMode] = useState(false);
  const [activeStem, setActiveStem] = useState('Full');
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasFile, setHasFile] = useState(false);
  const [volumeDisplay, setVolumeDisplay] = useState<number | null>(null);
  const [detectedKey, setDetectedKey] = useState<string>('');
  const [assignedPadNotif, setAssignedPadNotif] = useState<number | null>(null);

  // ADSR State
  const [adsr, setAdsr] = useState({ a: 10, d: 20, s: 70, r: 30 });

  // Waveform data — 150 bars; starts as placeholder, replaced on file load
  const [waveform, setWaveform] = useState<number[]>(() =>
    Array.from({ length: 150 }, (_, i) => {
      const t = i / 150;
      return Math.abs(Math.sin(t * Math.PI * 7 + 1.2) * 0.45 + Math.sin(t * Math.PI * 23) * 0.25 + 0.35);
    })
  );

  const slices = [20, 45, 70, 85];
  const stems = ['Full', 'Drums', 'Bass', 'Vocals', 'Other'];

  // Shared audio context — uses pad 0 for the waveform visualizer's sample
  const { engine, triggerPad: ctxTriggerPad, loadSampleToPad, pads: allPads, updatePad, resumeAudio, projectKey } = useTBMAudio();

  // We use pad index 0 for the waveform visualizer's loaded sample
  const WAVEFORM_PAD_INDEX = 0;
  const padRef = useRef<EnginePad>(allPads[WAVEFORM_PAD_INDEX] ?? {
    id: 0, name: 'sample', sample: null, volume: 0.8, pan: 0,
    pitch: 0, attack: 0.001, release: 0.1, reverse: false, start: 0, end: 1,
  });
  const loadedBufferRef = useRef<AudioBuffer | null>(null);
  const [hasLoadedBuffer, setHasLoadedBuffer] = useState(false);

  // Timer refs for proper cleanup (Fix #11)
  const normalizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const assignPadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  // File input refs for XPM / SXQ loading
  const xpmInputRef = useRef<HTMLInputElement>(null);
  const sxqInputRef = useRef<HTMLInputElement>(null);

  // Cleanup all timers and async operations on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (normalizeTimerRef.current !== null) clearTimeout(normalizeTimerRef.current);
      if (volumeTimerRef.current !== null) clearTimeout(volumeTimerRef.current);
      if (playTimerRef.current !== null) clearTimeout(playTimerRef.current);
      if (assignPadTimerRef.current !== null) clearTimeout(assignPadTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  // Sync pad from context
  useEffect(() => {
    if (allPads[WAVEFORM_PAD_INDEX]) {
      padRef.current = allPads[WAVEFORM_PAD_INDEX];
    }
  }, [allPads]);

  // Keep pad pitch in sync with knob
  useEffect(() => {
    updatePad(WAVEFORM_PAD_INDEX, { pitch });
  }, [pitch, updatePad]);

  // Keep pad reverse in sync with toggle
  useEffect(() => {
    updatePad(WAVEFORM_PAD_INDEX, { reverse: isReversed });
  }, [isReversed, updatePad]);

  // ── Sync ADSR sliders to pad attack/release/decay/sustain ──
  // Map 0–100 range: attack → 0–3s, decay → 0–3s, sustain → 0–1, release → 0–5s
  useEffect(() => {
    updatePad(WAVEFORM_PAD_INDEX, {
      attack: (adsr.a / 100) * 3,
      release: (adsr.r / 100) * 5,
    });
    // Pass d/s to engine ADSR if supported
    engine?.updatePadADSR?.(WAVEFORM_PAD_INDEX, {
      a: (adsr.a / 100) * 3,
      d: (adsr.d / 100) * 3,
      s: adsr.s / 100,
      r: (adsr.r / 100) * 5,
    });
  }, [adsr.a, adsr.d, adsr.s, adsr.r, updatePad, engine]);

  // ── Sync filter knob to pad filter settings ──
  // Filter knob at 100 = off (full open), below 100 = lowpass with cutoff mapped to 0–127
  useEffect(() => {
    if (filter >= 100) {
      updatePad(WAVEFORM_PAD_INDEX, { filterType: 'off' as const });
    } else {
      // Map 0–99 → cutoff 0–127
      const cutoff = Math.round((filter / 99) * 127);
      updatePad(WAVEFORM_PAD_INDEX, {
        filterType: 'lp' as const,
        filterCutoff: cutoff,
        filterResonance: 20,
      });
    }
  }, [filter, updatePad]);

  const loadFile = useCallback(async (file: File) => {
    if (!engine) return;
    await resumeAudio();

    // Cancel any in-flight waveform extraction for a previous load
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    const sampleId = `waveform-${Date.now()}`;
    const buffer = await engine.loadSampleFromFile(sampleId, file);
    if (!buffer || !mountedRef.current || signal.aborted) return;

    loadedBufferRef.current = buffer;
    setHasLoadedBuffer(true);

    // Update pad through the shared context so DrumMachine can also see it
    updatePad(WAVEFORM_PAD_INDEX, {
      sample: { id: sampleId, name: file.name, buffer, category: 'user' },
    });

    // Fix 6.1/6.3: pass signal so rAF chain can be cancelled; guard setState
    const waveformData = await extractWaveformAsync(buffer, 150, signal);
    if (!mountedRef.current || signal.aborted) return;
    setWaveform(waveformData);
    setHasFile(true);
    setIsChopped(false);
    
    // Detect key of the loaded sample
    try {
      const key = await detectKeyFromBuffer(buffer);
      if (mountedRef.current && !signal.aborted) setDetectedKey(key);
    } catch (err) {
      console.warn('Key detection failed:', err);
      if (mountedRef.current && !signal.aborted) setDetectedKey('');
    }
  }, [engine, updatePad, resumeAudio]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('audio/')) {
      loadFile(file);
    }
  }, [loadFile]);

  const handleNormalize = useCallback(() => {
    if (!loadedBufferRef.current) return;
    setIsNormalizing(true);
    // Find peak then adjust volume — visual feedback
    const data = loadedBufferRef.current.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
    const gain = peak > 0 ? 1 / peak : 1;
    const newVol = Math.min(1, (padRef.current.volume ?? 0.8) * gain);
    updatePad(WAVEFORM_PAD_INDEX, { volume: newVol });
    setVolumeDisplay(Math.round(newVol * 100));
    if (normalizeTimerRef.current !== null) clearTimeout(normalizeTimerRef.current);
    normalizeTimerRef.current = setTimeout(() => setIsNormalizing(false), 800);
    // Hide volume display after 3s
    if (volumeTimerRef.current !== null) clearTimeout(volumeTimerRef.current);
    volumeTimerRef.current = setTimeout(() => setVolumeDisplay(null), 3000);
  }, [updatePad]);

  const handlePlay = useCallback(() => {
    const currentPad = allPads[WAVEFORM_PAD_INDEX];
    if (!currentPad?.sample) return;
    ctxTriggerPad(currentPad, 1);
    setIsPlaying(true);
    // Fix 6.4: account for pitch-shifted playback rate so the stop indicator
    // fires when the sample actually finishes, not at its natural duration.
    const baseDur = loadedBufferRef.current?.duration ?? 1;
    const playbackRate = Math.pow(2, (currentPad.pitch ?? 0) / 12);
    const adjustedDur = baseDur / Math.max(playbackRate, 0.01);
    if (playTimerRef.current !== null) clearTimeout(playTimerRef.current);
    playTimerRef.current = setTimeout(() => setIsPlaying(false), adjustedDur * 1000 + 100);
  }, [allPads, ctxTriggerPad]);

  const handleStop = useCallback(() => {
    engine?.stopAll();
    setIsPlaying(false);
  }, [engine]);
  const handleDenoise = useCallback(async () => {
    const buffer = loadedBufferRef.current;
    if (!buffer || !engine) return;
    
    // Cancel any previous denoise operation
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    
    setIsDenoising(true);

    try {
      // Estimate noise floor: RMS of the quietest 10% of the buffer
      const channelData = buffer.getChannelData(0);
      const blockSize = Math.floor(channelData.length / 20);
      const rmsBlocks: number[] = [];
      for (let b = 0; b < 20; b++) {
        let sumSq = 0;
        const offset = b * blockSize;
        for (let i = 0; i < blockSize; i++) sumSq += channelData[offset + i] ** 2;
        rmsBlocks.push(Math.sqrt(sumSq / blockSize));
      }
      rmsBlocks.sort((a, b) => a - b);
      const noiseFloorRms = rmsBlocks[Math.floor(rmsBlocks.length * 0.1)];
      const thresholdDb = 20 * Math.log10(Math.max(noiseFloorRms, 1e-6));

      // Render through a DynamicsCompressor (noise gate approximation) offline
      const offline = new OfflineAudioContext(
        buffer.numberOfChannels,
        buffer.length,
        buffer.sampleRate,
      );
      const src = offline.createBufferSource();
      src.buffer = buffer;
      const comp = offline.createDynamicsCompressor();
      comp.threshold.value = Math.max(-80, Math.min(-10, thresholdDb + 6));
      comp.knee.value = 3;
      comp.ratio.value = 20;
      comp.attack.value = 0.001;
      comp.release.value = 0.1;
      src.connect(comp);
      comp.connect(offline.destination);
      src.start(0);
      const rendered = await offline.startRendering();

      // Check if component is still mounted and operation not aborted
      if (!mountedRef.current || signal.aborted) return;

      // Replace pad buffer with denoised version
      engine.replacePadBuffer(WAVEFORM_PAD_INDEX, rendered);
      loadedBufferRef.current = rendered;

      // Redraw waveform (pass signal so rAF chain is also cancellable)
      const waveformData = await extractWaveformAsync(rendered, 150, signal);
      if (mountedRef.current && !signal.aborted) {
        setWaveform(waveformData);
      }
    } catch (err) {
      if (signal.aborted) return; // Ignore abort errors
      console.error('[WaveformVisualizer] Denoise failed:', err);
    }

    if (mountedRef.current && !signal.aborted) {
      setIsDenoising(false);
    }
  }, [engine]);

  const stemColors: Record<string, string> = {
    Full: '#FF4C4C', Drums: '#3b82f6', Bass: '#a855f7', Vocals: '#eab308', Other: '#22c55e'
  };

  const activeColor = isStemMode ? stemColors[activeStem] : '#FF4C4C';

  // ── XPM handler: parse MPC XML, load SampleFile entries into pads ──
  const handleXpmFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !engine) return;
    try {
      const text = await file.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'application/xml');
      const sampleNodes = doc.querySelectorAll('SampleFile');
      let padIdx = 0;
      for (const node of Array.from(sampleNodes)) {
        if (padIdx >= 16) break;
        const samplePath = node.textContent?.trim();
        if (samplePath) {
          // Attempt to fetch as relative URL (will only work if served)
          try {
            const resp = await fetch(samplePath);
            if (resp.ok) {
              const blob = await resp.blob();
              const f = new File([blob], samplePath.split('/').pop() ?? 'sample.wav', { type: 'audio/wav' });
              // Use loadSampleToPad so React pad state (and updatePad) is kept in sync
              await loadSampleToPad(padIdx, f);
              padIdx++;
            }
          } catch {
            // ignore individual sample fetch failures
          }
        }
      }
    } catch (err) {
      console.error('[WaveformVisualizer] XPM parse error:', err);
    }
    e.target.value = '';
  }, [engine, loadSampleToPad]);

  // ── SXQ handler: parse sequence JSON, set pattern ──
  const handleSxqFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      // Accept either a raw boolean[][] or { pattern: boolean[][] }
      const grid: boolean[][] = Array.isArray(data) ? data : (data.pattern ?? []);
      if (grid.length) {
        // sequencer.setPattern is not directly accessible here; dispatch via engine bridge if available
        // For now, store in localStorage for sequencer to pick up
        localStorage.setItem(STORAGE_KEYS.SXQ_PATTERN, JSON.stringify(grid));
        console.info('[WaveformVisualizer] SXQ pattern loaded, rows:', grid.length);
      }
    } catch (err) {
      console.error('[WaveformVisualizer] SXQ parse error:', err);
    }
    e.target.value = '';
  }, []);

  const handleXpmClick = useCallback(() => {
    xpmInputRef.current?.click();
  }, []);

  const handleSxqClick = useCallback(() => {
    sxqInputRef.current?.click();
  }, []);

  return (
    <div className="h-full flex flex-col gap-3">
      {/* ── Top toolbar ─────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 flex-wrap relative edge-glow-bottom">
        {/* Left: title + process buttons */}
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-black text-neutral-500 uppercase tracking-widest mr-1">Sample Engine</h2>
          <button
            onClick={handleNormalize}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold uppercase border transition-all ${
              isNormalizing
                ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/50'
                : 'bg-bg-main/60 text-neutral-500 border-border-main hover:text-neutral-300 hover:border-neutral-600'
            }`}
          >
            <Maximize size={9} /> Normalize
          </button>
          <button
            onClick={handleDenoise}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold uppercase border transition-all ${
              isDenoising
                ? 'bg-blue-600/20 text-blue-400 border-blue-500/50'
                : 'bg-bg-main/60 text-neutral-500 border-border-main hover:text-neutral-300 hover:border-neutral-600'
            }`}
          >
            <Wind size={9} /> Denoise
          </button>
          <button
            onClick={() => setIsReversed(!isReversed)}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold uppercase border transition-all ${
              isReversed
                ? 'bg-orange-600/20 text-orange-400 border-orange-500/50'
                : 'bg-bg-main/60 text-neutral-500 border-border-main hover:text-neutral-300 hover:border-neutral-600'
            }`}
          >
            <RotateCcw size={9} /> Reverse
          </button>
          <button
            onClick={() => setIsStemMode(!isStemMode)}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold uppercase border transition-all ${
              isStemMode
                ? 'bg-red-600/20 text-red-400 border-red-500/50'
                : 'bg-bg-main/60 text-neutral-500 border-border-main hover:text-neutral-300 hover:border-neutral-600'
            }`}
          >
            <Layers size={9} /> Stems
          </button>
          {/* Play / Stop for loaded sample */}
          <button
            onClick={isPlaying ? handleStop : handlePlay}
            disabled={!hasFile}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold uppercase border transition-all ${
              isPlaying
                ? 'bg-red-600/20 text-red-400 border-red-500/50'
                : hasFile
                  ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/50 hover:bg-emerald-600/30'
                  : 'bg-bg-main/60 text-neutral-700 border-border-main cursor-not-allowed'
            }`}
          >
            {isPlaying ? <><Square size={9} /> Stop</> : <><Play size={9} /> Play</>}
          </button>
        </div>

        {/* Right: key detection + mode + load */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-bg-main/60 px-2.5 py-1 rounded-lg border border-border-main">
            <Music size={9} className="text-brand" />
            <span className="text-xs font-mono text-neutral-500 uppercase">Key:</span>
            <span className="text-[13px] font-black text-brand uppercase">{detectedKey || projectKey}</span>
            {detectedKey && (
              <span className="text-xs text-neutral-500 ml-1">(detected)</span>
            )}
          </div>
          <select
            className="bg-bg-main/60 border border-border-main text-xs text-neutral-300 rounded-md px-1.5 py-1 outline-none focus:border-brand transition-colors"
            onChange={(e) => engine?.setPolyMode(e.target.value as 'poly' | 'mono' | 'legato')}
          >
            <option value="poly">Poly</option>
            <option value="mono">Mono</option>
            <option value="legato">Legato</option>
          </select>
          {/* Hidden file inputs for XPM / SXQ */}
          <input ref={xpmInputRef} type="file" accept=".xpm,.xml" className="hidden" onChange={handleXpmFile} />
          <input ref={sxqInputRef} type="file" accept=".sxq,.json" className="hidden" onChange={handleSxqFile} />
          <div className="relative group">
            <button className="flex items-center gap-1.5 px-2.5 py-1 bg-brand hover:opacity-90 text-white rounded-md font-bold text-xs uppercase transition-all shadow-md shadow-brand/20">
              <Plus size={9} /> Load Kit
            </button>
            <div className="absolute right-0 top-full mt-1.5 w-36 bg-bg-surface border border-border-main rounded-lg shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 p-1.5 flex flex-col gap-0.5">
              <button
                onClick={handleXpmClick}
                className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-bg-main/80 rounded-md text-xs text-neutral-300 transition-colors text-left">
                <FileCode size={9} className="text-brand" /> .XPM (Program)
              </button>
              <button
                onClick={handleSxqClick}
                className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-bg-main/80 rounded-md text-xs text-neutral-300 transition-colors text-left">
                <FileCode size={9} className="text-blue-400" /> .SXQ (Sequence)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Stem bar (conditional) ───────────────────────── */}
      {isStemMode && (
        <div className="flex items-center gap-2 bg-bg-main/60 px-3 py-1.5 rounded-lg border border-border-main animate-in">
          <span className="text-xs font-mono text-neutral-500 uppercase mr-1">Focus:</span>
          {stems.map(stem => (
            <button
              key={stem}
              onClick={() => setActiveStem(stem)}
              className={`px-2.5 py-0.5 rounded-md text-xs font-bold uppercase transition-all border ${
                activeStem === stem
                  ? 'border-transparent text-white'
                  : 'bg-bg-surface border-border-main text-neutral-500 hover:text-neutral-300'
              }`}
              style={activeStem === stem ? { backgroundColor: stemColors[stem] + '33', borderColor: stemColors[stem] + '80', color: stemColors[stem] } : {}}
            >
              {stem}
            </button>
          ))}
          <div className="h-3 w-px bg-border-main mx-1"></div>
          <button className="flex items-center gap-1.5 px-2.5 py-0.5 bg-bg-surface hover:bg-bg-main text-red-400 text-xs font-bold uppercase rounded-md border border-red-900/30 transition-colors">
            <Zap size={9} /> Separate
          </button>
          <span className="ml-auto text-xs font-mono text-neutral-600 italic uppercase">Cuts sync across stems</span>
        </div>
      )}

      {/* ── Waveform + ADSR row ──────────────────────────── */}
      <div className="flex-1 flex gap-3 min-h-0">
        {/* Waveform */}
        <div
          className={`relative flex-1 rounded-xl border-2 transition-all ${
            isDragging
              ? 'border-brand border-dashed bg-brand/5'
              : 'border-border-main bg-bg-main/50 hover:border-neutral-700'
          } overflow-hidden flex items-center justify-center`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" style={{ transform: isReversed ? 'scaleX(-1)' : 'none' }}>
            {isChopped && slices.map((slice, i) => {
              const start = i === 0 ? 0 : slices[i - 1];
              const width = slice - start;
              return (
                <rect key={`region-${i}`} x={`${start}%`} y="0" width={`${width}%`} height="100%"
                  fill={i % 2 === 0 ? activeColor : '#fff'} opacity="0.04" />
              );
            })}
            <WaveformBars
              waveform={waveform}
              fill={isChopped ? (lofiMode ? '#d97706' : activeColor) : '#444'}
              opacity="0.85"
            />
            {isChopped && slices.map((slice, i) => (
              <g key={`slice-${i}`}>
                <line x1={`${slice}%`} y1="0" x2={`${slice}%`} y2="100%"
                  stroke={lofiMode ? '#d97706' : activeColor} strokeWidth="1" strokeDasharray="4 4" opacity="0.7" />
                <polygon points={`${slice},0 ${slice - 4},7 ${slice + 4},7`}
                  fill={lofiMode ? '#d97706' : activeColor} />
              </g>
            ))}
          </svg>

          {!hasFile && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-2">
              <UploadCloud className="w-7 h-7 text-neutral-600 opacity-50" />
              <span className="text-sm font-bold font-mono text-neutral-600 uppercase tracking-widest">Drop Audio File</span>
              <span className="text-xs font-mono text-neutral-700 uppercase">WAV / MP3 / OGG</span>
            </div>
          )}

          <button
            onClick={() => setIsChopped(!isChopped)}
            className={`absolute bottom-2.5 right-2.5 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
              isChopped
                ? 'bg-bg-surface/80 text-neutral-400 border border-border-main hover:border-neutral-600'
                : 'bg-brand/20 text-brand border border-brand/50 hover:bg-brand/30'
            }`}
          >
            <Scissors size={11} />
            {isChopped ? 'Reset Chops' : 'Auto-Chop'}
          </button>

          {/* Volume indicator after normalize */}
          {volumeDisplay !== null && (
            <div className="absolute bottom-2.5 left-2.5 bg-emerald-900/80 text-emerald-300 text-xs font-bold font-mono px-2 py-1 rounded border border-emerald-500/40">
              VOL: {volumeDisplay}%
            </div>
          )}
        </div>

        {/* ADSR + Quick Controls */}
        <div className="w-44 flex flex-col gap-3 shrink-0">
          {/* ADSR */}
          <div className="flex-1 flex flex-col gap-1.5 min-h-0">
            <span className="text-xs font-bold font-mono text-neutral-500 uppercase tracking-widest">Amp Envelope</span>
            <div className="flex-1 bg-bg-main/80 rounded-lg border border-border-main relative overflow-hidden min-h-0 vignette">
              <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="adsrGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={activeColor} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={activeColor} stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                <path
                  d={`M 0 100 L ${adsr.a / 2} 0 L ${(adsr.a + adsr.d) / 2} ${100 - adsr.s} L 80 ${100 - adsr.s} L 100 100 Z`}
                  fill="url(#adsrGrad)"
                />
                <path
                  d={`M 0 100 L ${adsr.a / 2} 0 L ${(adsr.a + adsr.d) / 2} ${100 - adsr.s} L 80 ${100 - adsr.s} L 100 100`}
                  fill="none" stroke={activeColor} strokeWidth="2"
                />
              </svg>
              <div className="absolute bottom-1 left-0 w-full flex justify-around px-2">
                {['A', 'D', 'S', 'R'].map(l => (
                  <span key={l} className="text-xs font-black font-mono text-neutral-600">{l}</span>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {(['a', 'd', 's', 'r'] as const).map(k => {
                const labelMap = { a: 'Attack', d: 'Decay', s: 'Sustain', r: 'Release' } as const;
                return (
                  <input key={k} type="range" min={0} max={100} step={1} value={adsr[k]}
                    aria-label={labelMap[k]}
                    onChange={e => setAdsr({ ...adsr, [k]: parseInt(e.target.value, 10) })}
                    className="h-1 w-full bg-neutral-800 appearance-none rounded-full accent-brand cursor-pointer"
                  />
                );
              })}
            </div>
          </div>

           {/* Pitch + Filter knobs */}
          <div className="flex justify-around py-1">
            <Knob label="Pitch" value={pitch} onChange={setPitch} min={-24} max={24} color={activeColor} />
            <Knob label="Filter" value={filter} onChange={setFilter} color={activeColor} />
          </div>

          {/* Pad Assignment for MPC Workflow */}
          {hasLoadedBuffer && (
            <div className="mt-3 pt-3 border-t border-neutral-800">
              <div className="text-xs font-bold font-mono text-neutral-500 uppercase tracking-widest mb-2">Assign to Pad</div>
              <div className="grid grid-cols-4 gap-1">
                {Array.from({ length: 16 }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      const buffer = loadedBufferRef.current;
                      if (!buffer) return;
                      // Build a Sample object from the loaded buffer and assign it directly to the target pad
                      const sampleName = padRef.current?.sample?.name ?? 'sample';
                      const sample: EngineSample = {
                        id: `pad-assign-${i}-${Date.now()}`,
                        name: sampleName,
                        buffer,
                        category: 'user',
                      };
                      updatePad(i, { sample });
                      // Visual feedback
                      if (assignPadTimerRef.current !== null) clearTimeout(assignPadTimerRef.current);
                      setAssignedPadNotif(i);
                      assignPadTimerRef.current = setTimeout(() => {
                        if (mountedRef.current) setAssignedPadNotif(null);
                        assignPadTimerRef.current = null;
                      }, 1500);
                    }}
                    className={`aspect-square rounded border flex items-center justify-center text-xs font-bold transition-colors ${
                      assignedPadNotif === i
                        ? "bg-emerald-600/30 border-emerald-500 text-emerald-300"
                        : "bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-400 hover:text-white"
                    }`}
                    title={`Assign to Pad ${i + 1}`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-[11px] text-neutral-600 font-mono">
                {assignedPadNotif !== null
                  ? `Assigned to Pad ${assignedPadNotif + 1}`
                  : "Click pad number to assign current sample to Drum Machine"}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});