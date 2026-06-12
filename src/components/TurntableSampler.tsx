import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import {
  Play,
  Square,
  Upload,
  Disc3,
  Lock,
  Unlock,
  Scissors,
  Zap,
  ChevronRight,
  Loader2,
  Music,
  RotateCcw,
  Save,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { useTBMAudio } from "../contexts/TBMAudioContext";
import { useMidi } from "../contexts/MidiContext";
import { Knob } from "./Knob";
import {
  separateStems,
  getStemJob,
  stemDownloadUrl,
} from "../lib/api";
import { CrossfaderCurve } from "../lib/TBMAudioEngine";

// ─── Waveform extraction ────────────────────────────────────────────────────
function extractWaveform(
  buffer: AudioBuffer | null,
  barCount: number = 200,
): number[] {
  if (!buffer) return [];
  const data = buffer.getChannelData(0);
  const samplesPerBar = Math.floor(data.length / barCount);
  const result: number[] = [];
  for (let i = 0; i < barCount; i++) {
    let sum = 0;
    const offset = i * samplesPerBar;
    const end = Math.min(offset + samplesPerBar, data.length);
    for (let j = offset; j < end; j++) sum += Math.abs(data[j]);
    result.push(Math.min(1, (sum / (end - offset)) * 3 + 0.05));
  }
  return result;
}

// ─── Transient detection ────────────────────────────────────────────────────
// Onset-detection via spectral flux / energy windowing.  Returns positions as
// fractions (0–1) of the total buffer length.
function detectTransients(
  buffer: AudioBuffer,
  sensitivity: number = 0.4,
): number[] {
  const data = buffer.getChannelData(0);
  const windowSize = Math.max(512, Math.floor(buffer.sampleRate * 0.01)); // ~10ms
  const hopSize = Math.floor(windowSize / 2);
  const energies: number[] = [];

  for (let i = 0; i + windowSize <= data.length; i += hopSize) {
    let sum = 0;
    for (let j = i; j < i + windowSize; j++) sum += data[j] * data[j];
    energies.push(sum / windowSize);
  }

  // Adaptive threshold: median-filtered energy * sensitivity multiplier
  const medianWindow = 11;
  const threshold = sensitivity * 0.15;
  const onsets: number[] = [];

  for (let i = 1; i < energies.length; i++) {
    const flux = energies[i] - energies[i - 1];
    // Local median for adaptive threshold
    const start = Math.max(0, i - Math.floor(medianWindow / 2));
    const end = Math.min(energies.length, i + Math.ceil(medianWindow / 2));
    const window = energies.slice(start, end).sort((a, b) => a - b);
    const median = window[Math.floor(window.length / 2)];

    if (flux > Math.max(threshold, median * 1.5)) {
      const pos = (i * hopSize) / data.length;
      // Minimum distance between onsets: ~50ms
      if (onsets.length === 0 || pos - onsets[onsets.length - 1] > 0.003) {
        onsets.push(pos);
      }
    }
  }
  return onsets;
}

// Energy-envelope peak detection for Chop Mode
function detectEnergyEnvelope(
  buffer: AudioBuffer,
  sensitivity: number = 0.5,
): number[] {
  const data = buffer.getChannelData(0);
  const frameSize = Math.max(256, Math.floor(buffer.sampleRate * 0.005));
  const hopSize = Math.floor(frameSize / 2);

  const energies: number[] = [];
  for (let i = 0; i + frameSize <= data.length; i += hopSize) {
    let sum = 0;
    for (let j = i; j < i + frameSize; j++) sum += Math.abs(data[j]);
    energies.push(sum / frameSize);
  }

  const maxEnergy = Math.max(...energies, 0.0001);
  const normalized = energies.map(e => e / maxEnergy);

  const threshold = 1 - sensitivity;
  const minPeak = 0.1 + threshold * 0.4;
  const peaks: number[] = [];

  for (let i = 1; i < normalized.length - 1; i++) {
    if (normalized[i] > normalized[i - 1] && normalized[i] > normalized[i + 1] && normalized[i] > minPeak) {
      const pos = (i * hopSize) / data.length;
      if (peaks.length === 0 || pos - peaks[peaks.length - 1] > 0.005) {
        peaks.push(pos);
      }
    }
  }
  return peaks;
}

// ─── Slice an AudioBuffer at positions (fractions 0–1) ──────────────────────
function sliceBuffer(
  ctx: AudioContext,
  buffer: AudioBuffer,
  positions: number[],
): AudioBuffer[] {
  const sorted = [0, ...positions.filter((p) => p > 0 && p < 1), 1].sort(
    (a, b) => a - b,
  );
  // Deduplicate
  const unique = sorted.filter((p, i) => i === 0 || p - sorted[i - 1] > 0.0001);

  const slices: AudioBuffer[] = [];
  for (let i = 0; i < unique.length - 1; i++) {
    const startSample = Math.floor(unique[i] * buffer.length);
    const endSample = Math.floor(unique[i + 1] * buffer.length);
    const length = endSample - startSample;
    if (length < 1) continue;
    const sliceBuf = ctx.createBuffer(
      buffer.numberOfChannels,
      length,
      buffer.sampleRate,
    );
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const src = buffer.getChannelData(ch);
      const dst = sliceBuf.getChannelData(ch);
      for (let j = 0; j < length; j++) dst[j] = src[startSample + j];
    }
    slices.push(sliceBuf);
  }
  return slices;
}

// ─── AudioBuffer → WAV Blob ─────────────────────────────────────────────────
function bufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataLength = buffer.length * blockAlign;
  const headerLength = 44;
  const totalLength = headerLength + dataLength;

  const arrayBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++)
      view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, totalLength - 8, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataLength, true);

  // Interleave channels
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(
        offset,
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
        true,
      );
      offset += 2;
    }
  }
  return new Blob([arrayBuffer], { type: "audio/wav" });
}

// ─── Types ──────────────────────────────────────────────────────────────────
type ChopMode = "manual" | "transient" | "live" | "energy";
type SlicePlayMode = "one-shot" | "gate" | "loop";

interface StemProgram {
  name: string;
  slices: File[];
  loadedToBank?: "A" | "B" | "C" | "D";
}

interface SliceProgram {
  id: string;
  name: string;
  fileName: string;
  slicePositions: number[];
  createdAt: number;
}

interface StemChopState {
  status: "idle" | "separating" | "slicing" | "done" | "error";
  progress: number;
  phase: string;
  programs: StemProgram[];
  error?: string;
}

interface TurntableSamplerProps {
  onGoToDrums?: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────
export function TurntableSampler({ onGoToDrums }: TurntableSamplerProps = {}) {
  // ── Audio context ──
  const {
    audioContext,
    resumeAudio,
    engine,
    djEngine: _djEngine,
    loadFileToDeck,
    djPlay,
    djPause,
    djStop,
    getDeckState,
    setCrossfaderPosition,
    setCrossfaderCurve,
    setDeckVolume,
    setDeckBpm,
    setDeckPlaybackRate,
    setVinylConfig,
    setDeckEffect,
    setDeckEffectEnabled,
    setDeckEffectWetDry,
    setDJMasterVolume,
    detectBpm,
    loadSampleToPad,
    pads,
    updatePad: _updatePad,
  } = useTBMAudio();

  // ── Loaded audio state ──
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [detectedBpm, setDetectedBpm] = useState(0);

  // ── Turntable controls ──
  const [vinylRpm, setVinylRpm] = useState(33.3);
  const [pitchSemitones, setPitchSemitones] = useState(0);
  const [keyLock, setKeyLock] = useState(false);
  const [speedMult, setSpeedMult] = useState(1.0);
  const [volume, setVolume] = useState(85);

  // ── Vinyl simulation ──
  const [inertia, setInertia] = useState(72);
  const [friction, setFriction] = useState(85);
  const [vinylNoise, setVinylNoise] = useState(30);
  const [pitchDrift, setPitchDrift] = useState(15);
  const [vinylDrive, setVinylDrive] = useState(38);
  const [wear, setWear] = useState(22);
  const [crackle, setCrackle] = useState(28);

  // ── Effects ──
  const [echoWet, setEchoWet] = useState(0);
  const [reverbWet, setReverbWet] = useState(0);
  const [lofiTone, setLofiTone] = useState(0);
  const [drive, setDrive] = useState(0);

  // ── Chop state ──
  const [chopMode, setChopMode] = useState<ChopMode>("manual");
  const [slicePositions, setSlicePositions] = useState<number[]>([]);
  const slicePositionsRef = useRef<number[]>([]);
  const [flashSlice, setFlashSlice] = useState<number | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoSliceCount, setAutoSliceCount] = useState(8);
  const [sensitivity, setSensitivity] = useState(50);
  const [slicePlayModes, setSlicePlayModes] = useState<SlicePlayMode[]>([]);
  const [globalSliceMode, setGlobalSliceMode] = useState<SlicePlayMode>("one-shot");
  const [savedPrograms, setSavedPrograms] = useState<SliceProgram[]>(() => {
    const stored = localStorage.getItem('tbm_slice_programs');
    return stored ? JSON.parse(stored) : [];
  });
  const [newProgramName, setNewProgramName] = useState('');

  // ── Stem chop ──
  const [stemState, setStemState] = useState<StemChopState>({
    status: "idle",
    progress: 0,
    phase: "",
    programs: [],
  });
  const stemPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Guard against setState on unmounted component (stemPoll callbacks are async)
  const mountedRef = useRef(true);

  // ── Platter animation ──
  const platterDomRef = useRef<HTMLDivElement>(null);
  const platAnimRef = useRef<number>(0);
  const platAngleRef = useRef(0);

  // ── Dragging state for slice markers ──
  const [draggingSlice, setDraggingSlice] = useState<number | null>(null);
   const waveformRef = useRef<HTMLDivElement>(null);

  // ── Playhead animation ──
  const playheadRef = useRef<HTMLDivElement>(null);
  const playheadAnimRef = useRef<number>(0);

  // ── File input ──
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Waveform data ──
  const waveform = useMemo(() => extractWaveform(buffer, 300), [buffer]);

  // Keep slicePositions ref in sync
  useEffect(() => {
    slicePositionsRef.current = slicePositions;
  }, [slicePositions]);

  // ── MIDI pad listening for live chop mode ──
  const { activeNotes } = useMidi();
  const prevActiveNotesRef = useRef<Map<number, any>>(new Map());

  // Listen to pad triggers in live chop mode
  useEffect(() => {
    if (chopMode !== 'live' || !buffer) return;

    const prev = prevActiveNotesRef.current;
    const newNotes: number[] = [];

    // Find newly added notes (pad presses)
    activeNotes.forEach((state, note) => {
      if (!prev.has(note)) {
        newNotes.push(note);
      }
    });
    prevActiveNotesRef.current = new Map(activeNotes);

    if (newNotes.length === 0) return;

    // Get current deck position
    const deckState = getDeckState('A');
    if (!deckState || deckState.duration <= 0) return;

    const positionFraction = deckState.position / deckState.duration;
    // Ensure fraction is between 0 and 1
    if (positionFraction <= 0 || positionFraction >= 1) return;

    // Avoid adding slice positions too close together (minimum 0.01 = 1% of total duration)
    const MIN_DISTANCE = 0.01;
    const isTooClose = slicePositionsRef.current.some(pos => Math.abs(pos - positionFraction) < MIN_DISTANCE);
    if (isTooClose) return;

    // Add new slice position
    setSlicePositions(prev => [...prev, positionFraction].sort((a, b) => a - b));

    // Visual feedback
    setFlashSlice(positionFraction);
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = setTimeout(() => {
      setFlashSlice(null);
    }, 300);
  }, [activeNotes, chopMode, buffer, getDeckState]);

  // ── Sync turntable playback rate to engine ──
  useEffect(() => {
    const rpmRate = vinylRpm / 33.3;
    const pitchRate = keyLock ? 1 : Math.pow(2, pitchSemitones / 12);
    const finalRate = rpmRate * speedMult * pitchRate;
    setDeckPlaybackRate("A", finalRate);
  }, [vinylRpm, speedMult, pitchSemitones, keyLock, setDeckPlaybackRate]);

  // ── Sync volume (deck only — master stays at unity) ──
  useEffect(() => {
    setDeckVolume("A", volume / 100);
  }, [volume, setDeckVolume]);

  // ── Crossfader: hard-left for Deck A only (run once on mount) ──
  const crossfaderInitRef = useRef(false);
  useEffect(() => {
    if (crossfaderInitRef.current) return;
    crossfaderInitRef.current = true;
    setCrossfaderPosition(0);
    setCrossfaderCurve("hard_cut" as CrossfaderCurve);
    setDJMasterVolume(1.0); // Master at unity — deck volume is the sole control
  }, [setCrossfaderPosition, setCrossfaderCurve, setDJMasterVolume]);

  // ── Sync vinyl simulation ──
  useEffect(() => {
    setVinylConfig("A", {
      inertia: inertia / 100,
      friction: friction / 100,
      noiseLevel: vinylNoise / 100,
      pitchDrift: (pitchDrift / 100) * 0.01,
      drive: vinylDrive / 100,
      wear: wear / 100,
      crackleRate: crackle / 100,
    });
  }, [
    inertia,
    friction,
    vinylNoise,
    pitchDrift,
    vinylDrive,
    wear,
    crackle,
    setVinylConfig,
  ]);

  // ── Sync effects chain ──
  useEffect(() => {
    // Echo slot 0
    if (echoWet > 0) {
      setDeckEffect("A", 0, "echo", { delayMs: 125, feedback: 0.35 });
      setDeckEffectEnabled("A", 0, true);
      setDeckEffectWetDry("A", 0, echoWet / 100);
    } else {
      setDeckEffectEnabled("A", 0, false);
    }
    // Reverb slot 1
    if (reverbWet > 0) {
      setDeckEffect("A", 1, "reverb", { roomSize: 0.3, damping: 0.5 });
      setDeckEffectEnabled("A", 1, true);
      setDeckEffectWetDry("A", 1, reverbWet / 100);
    } else {
      setDeckEffectEnabled("A", 1, false);
    }
    // Lo-Fi slot 2
    if (lofiTone > 0) {
      setDeckEffect("A", 2, "bitcrusher", {
        bits: Math.max(4, 16 - (lofiTone / 100) * 12),
        sampleRateReduction: 1 - (lofiTone / 100) * 0.7,
      });
      setDeckEffectEnabled("A", 2, true);
      setDeckEffectWetDry("A", 2, lofiTone / 100);
    } else {
      setDeckEffectEnabled("A", 2, false);
    }
    // Drive slot 3
    if (drive > 0) {
      setDeckEffect("A", 3, "distortion", {
        drive: (drive / 100) * 3,
        tone: 0.6,
      });
      setDeckEffectEnabled("A", 3, true);
      setDeckEffectWetDry("A", 3, Math.min(1, drive / 80));
    } else {
      setDeckEffectEnabled("A", 3, false);
    }
  }, [
    echoWet,
    reverbWet,
    lofiTone,
    drive,
    setDeckEffect,
    setDeckEffectEnabled,
    setDeckEffectWetDry,
  ]);

  // ── Play/pause wiring ──
  useEffect(() => {
    if (isPlaying) {
      // Ensure AudioContext is resumed before starting playback
      (async () => {
        await resumeAudio();
        djPlay("A");
      })();
    } else {
      djPause("A");
    }
  }, [isPlaying, djPlay, djPause, resumeAudio]);

  // ── Platter animation ──
  useEffect(() => {
    if (!isPlaying) {
      cancelAnimationFrame(platAnimRef.current);
      return;
    }
    let last = performance.now();
    const spin = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const rps = vinylRpm / 60;
      platAngleRef.current =
        (platAngleRef.current + rps * 360 * dt * speedMult) % 360;
      if (platterDomRef.current) {
        platterDomRef.current.style.transform = `rotate(${platAngleRef.current}deg)`;
      }
      platAnimRef.current = requestAnimationFrame(spin);
    };
    platAnimRef.current = requestAnimationFrame(spin);
    return () => cancelAnimationFrame(platAnimRef.current);
  }, [isPlaying, vinylRpm, speedMult]);

  // ── Waveform playhead animation ──
  useEffect(() => {
    if (!isPlaying) {
      cancelAnimationFrame(playheadAnimRef.current);
      // Reset playhead to start when stopped
      if (playheadRef.current) {
        playheadRef.current.style.left = "0%";
      }
      return;
    }
    const tick = () => {
      const state = getDeckState("A");
      if (state && state.duration > 0 && playheadRef.current) {
        const pct = Math.min(100, Math.max(0, (state.position / state.duration) * 100));
        playheadRef.current.style.left = `${pct}%`;
      }
      playheadAnimRef.current = requestAnimationFrame(tick);
    };
    playheadAnimRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(playheadAnimRef.current);
  }, [isPlaying, getDeckState]);

  // ── Chop operations ──
  const generateEqualSlices = (count: number): number[] => {
    return Array.from({ length: count - 1 }, (_, i) => (i + 1) / count);
  };

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(platAnimRef.current);
      cancelAnimationFrame(playheadAnimRef.current);
      if (stemPollRef.current) clearInterval(stemPollRef.current);
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, []);

  const saveCurrentProgram = useCallback((name: string) => {
    if (!buffer || slicePositions.length === 0) return;
    const newProgram: SliceProgram = {
      id: Date.now().toString(),
      name,
      fileName,
      slicePositions: [...slicePositions],
      createdAt: Date.now(),
    };
    const updated = [...savedPrograms, newProgram];
    setSavedPrograms(updated);
    localStorage.setItem('tbm_slice_programs', JSON.stringify(updated));
  }, [buffer, slicePositions, fileName, savedPrograms]);

  const loadProgram = useCallback((program: SliceProgram) => {
    if (program.fileName !== fileName && fileName) {
      const ok = window.confirm(
        `This program was saved with "${program.fileName}" but "${fileName}" is currently loaded.\n\nLoad anyway? Slice positions may not align correctly.`
      );
      if (!ok) return;
    }
    setSlicePositions([...program.slicePositions]);
  }, [fileName]);

  const deleteProgram = useCallback((programId: string) => {
    const updated = savedPrograms.filter(p => p.id !== programId);
    setSavedPrograms(updated);
    localStorage.setItem('tbm_slice_programs', JSON.stringify(updated));
  }, [savedPrograms]);

  // ── Load audio file ──
  const handleFileLoad = useCallback(
    async (file: File) => {
      if (!audioContext) return;
      await resumeAudio();
      const buf = await loadFileToDeck("A", file);
      if (buf) {
        setBuffer(buf);
        setFileName(file.name);
        const bpm = detectBpm(buf);
        if (bpm > 0) {
          setDetectedBpm(bpm);
          setDeckBpm("A", bpm);
        }
        // Auto-generate initial slices
        setSlicePositions(generateEqualSlices(autoSliceCount));
      }
    },
    [
      audioContext,
      resumeAudio,
      loadFileToDeck,
      detectBpm,
      setDeckBpm,
      autoSliceCount,
    ],
  );

  const handleFileDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith("audio/")) handleFileLoad(file);
    },
    [handleFileLoad],
  );

  const handleAutoChop = useCallback(() => {
    if (!buffer) return;
    if (chopMode === "transient") {
      const transients = detectTransients(buffer, sensitivity / 100);
      const limited = transients.length > 15 ? transients.slice(0, 15) : transients;
      setSlicePositions(limited);
    } else if (chopMode === "energy") {
      const peaks = detectEnergyEnvelope(buffer, sensitivity / 100);
      const limited = peaks.length > 15 ? peaks.slice(0, 15) : peaks;
      setSlicePositions(limited);
    } else {
      setSlicePositions(generateEqualSlices(autoSliceCount));
    }
  }, [chopMode, buffer, sensitivity, autoSliceCount]);

  // ── Assign slices to pads ──
  const handleAssignToPads = useCallback(async () => {
    if (!buffer || !audioContext || !engine) return;
    const slices = sliceBuffer(audioContext, buffer, slicePositions);
    for (let i = 0; i < Math.min(slices.length, 16); i++) {
      const wavBlob = bufferToWav(slices[i]);
      const file = new File(
        [wavBlob],
        `${fileName.replace(/\.[^.]+$/, "")}_chop_${i + 1}.wav`,
        { type: "audio/wav" },
      );
      await loadSampleToPad(i, file);
      // Apply slice play mode to pad
      const mode = slicePlayModes[i] ?? globalSliceMode;
      _updatePad(i, {
        loop: mode === "loop",
        release: mode === "gate" ? 0.002 : mode === "loop" ? 0 : 0.1,
      });
    }
  }, [buffer, audioContext, engine, slicePositions, fileName, loadSampleToPad, slicePlayModes, globalSliceMode, _updatePad]);

  const handleGoToDrums = useCallback(async () => {
    await handleAssignToPads();
    if (onGoToDrums) onGoToDrums();
  }, [handleAssignToPads, onGoToDrums]);

  // ── Stem chop: separate + re-chop per stem ──
  const handleStemChop = useCallback(async () => {
    if (!buffer || !audioContext) return;
    setStemState({
      status: "separating",
      progress: 0,
      phase: "Uploading...",
      programs: [],
    });

    try {
      // Convert full buffer to WAV file for API
      const wavBlob = bufferToWav(buffer);
      const file = new File([wavBlob], fileName || "turntable_sample.wav", {
        type: "audio/wav",
      });
      const job = await separateStems(file, "htdemucs");

      // Poll for completion
      stemPollRef.current = setInterval(async () => {
        if (!mountedRef.current) {
          if (stemPollRef.current) clearInterval(stemPollRef.current);
          return;
        }
        try {
          const status = await getStemJob(job.id);
          if (!mountedRef.current) return;
          setStemState((prev) => ({
            ...prev,
            progress: status.progress,
            phase: status.phase || `Separating... ${status.progress}%`,
          }));

          if (status.status === "done") {
            if (stemPollRef.current) clearInterval(stemPollRef.current);
            stemPollRef.current = null;

            setStemState((prev) => ({
              ...prev,
              status: "slicing",
              phase: "Loading stems & applying chops...",
            }));

            // Download each stem, decode, apply same chop points, store as programs
            const stemNames = status.stems; // ['drums', 'bass', 'vocals', 'other']
            const programs: StemProgram[] = [];

            for (let si = 0; si < stemNames.length && si < 4; si++) {
              const url = stemDownloadUrl(job.id, stemNames[si]);
              const resp = await fetch(url);
              const arrayBuf = await resp.arrayBuffer();
              const stemBuffer = await audioContext.decodeAudioData(arrayBuf);
              const stemSlices = sliceBuffer(
                audioContext,
                stemBuffer,
                slicePositions,
              );

              // Convert slices to Files and store — don't load to pads yet
              const sliceFiles: File[] = [];
              for (let ci = 0; ci < Math.min(stemSlices.length, 16); ci++) {
                const wavBlob = bufferToWav(stemSlices[ci]);
                sliceFiles.push(
                  new File([wavBlob], `${stemNames[si]}_chop_${ci + 1}.wav`, {
                    type: "audio/wav",
                  }),
                );
              }
              programs.push({ name: stemNames[si], slices: sliceFiles });
            }

            if (!mountedRef.current) return;
            setStemState({
              status: "done",
              progress: 100,
              phase: "Complete",
              programs,
            });
          } else if (status.status === "error") {
            if (stemPollRef.current) clearInterval(stemPollRef.current);
            stemPollRef.current = null;
            setStemState({
              status: "error",
              progress: 0,
              phase: "",
              programs: [],
              error: status.error || "Separation failed",
            });
          }
        } catch (err) {
          if (stemPollRef.current) clearInterval(stemPollRef.current);
          stemPollRef.current = null;
          setStemState({
            status: "error",
            progress: 0,
            phase: "",
            programs: [],
            error: String(err),
          });
        }
      }, 2000);
    } catch (err) {
      setStemState({
        status: "error",
        progress: 0,
        phase: "",
        programs: [],
        error: String(err),
      });
    }
  }, [buffer, audioContext, fileName, slicePositions]);

  // ── Load a stem program into a chosen bank ──
  const BANK_OFFSETS = { A: 0, B: 16, C: 32, D: 48 } as const;

  const loadProgramToBank = useCallback(
    async (programIndex: number, bank: "A" | "B" | "C" | "D") => {
      const prog = stemState.programs[programIndex];
      if (!prog) return;
      const offset = BANK_OFFSETS[bank];
      for (let i = 0; i < prog.slices.length; i++) {
        const padIndex = offset + i;
        // Validate pad index against actual pad count to prevent out-of-bounds errors
        if (padIndex >= pads.length) {
          console.warn(`[TurntableSampler] Pad index ${padIndex} exceeds pad count ${pads.length}, skipping remaining slices for bank ${bank}`);
          break;
        }
        await loadSampleToPad(padIndex, prog.slices[i]);
      }
      setStemState((prev) => ({
        ...prev,
        programs: prev.programs.map((p, idx) =>
          idx === programIndex ? { ...p, loadedToBank: bank } : p,
        ),
      }));
    },
    [stemState.programs, loadSampleToPad, pads.length],
  );

  // ── Slice marker drag handling ──
  const handleSliceMouseDown = useCallback(
    (index: number, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDraggingSlice(index);
    },
    [],
  );

  useEffect(() => {
    if (draggingSlice === null) return;
    const handleMove = (e: MouseEvent) => {
      if (!waveformRef.current) return;
      const rect = waveformRef.current.getBoundingClientRect();
      const pos = Math.max(
        0.01,
        Math.min(0.99, (e.clientX - rect.left) / rect.width),
      );
      setSlicePositions((prev) => {
        const next = [...prev];
        next[draggingSlice] = pos;
        const sorted = next.sort((a, b) => a - b);
        // After sorting, the dragged slice may have moved to a new index —
        // update draggingSlice so the next handleMove targets the correct entry
        const newIndex = sorted.indexOf(pos);
        if (newIndex !== -1 && newIndex !== draggingSlice) {
          // Use setTimeout to avoid setState-in-setState; the effect will pick it up
          setTimeout(() => setDraggingSlice(newIndex), 0);
        }
        return sorted;
      });
    };
    const handleUp = () => setDraggingSlice(null);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [draggingSlice]);

  // ── Add slice on waveform click ──
  const handleWaveformClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!waveformRef.current || !buffer) return;
      const rect = waveformRef.current.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / rect.width;
      if (pos > 0.01 && pos < 0.99) {
        setSlicePositions((prev) => [...prev, pos].sort((a, b) => a - b));
      }
    },
    [buffer],
  );

  const sliceCount = slicePositions.length + 1;

  // ── Slice region colors ──
  const SLICE_COLORS = [
    "#ef4444",
    "#3b82f6",
    "#f59e0b",
    "#10b981",
    "#8b5cf6",
    "#ec4899",
    "#06b6d4",
    "#84cc16",
    "#f97316",
    "#6366f1",
    "#14b8a6",
    "#e11d48",
    "#a855f7",
    "#0ea5e9",
    "#eab308",
    "#22c55e",
  ];

  return (
    <div className="h-full flex flex-col gap-0 bg-neutral-900 rounded-xl border border-neutral-800 overflow-hidden vignette">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFileLoad(f);
          e.target.value = "";
        }}
      />

      {/* ═══════════════════════════════════════════════════════════════════
          TOP 2/3 — Turntable Section
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="flex-[2] flex flex-col min-h-0 border-b border-neutral-800">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800 bg-neutral-950/60 shrink-0 relative edge-glow-bottom">
          <div className="flex items-center gap-2">
            <Disc3 size={16} className="text-brand" />
            <span className="text-xs font-bold uppercase tracking-widest text-neutral-300">
              Turntable Sampler
            </span>
          </div>
          <div className="flex items-center gap-3">
            {detectedBpm > 0 && (
              <span className="text-xs font-mono text-neutral-500">
                BPM:{" "}
                <span className="text-red-400 font-bold">
                  {Math.round(detectedBpm)}
                </span>
              </span>
            )}
            <span className="text-xs font-mono text-neutral-600 truncate max-w-50">
              {fileName || "No file loaded"}
            </span>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1 rounded-md text-[13px] font-bold uppercase bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700 transition-all"
            >
              <Upload size={11} /> Load
            </button>
          </div>
        </div>

        {/* Main turntable area */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Vinyl platter */}
          <div
            className="w-70 shrink-0 flex items-center justify-center bg-neutral-950/40 border-r border-neutral-800 p-4"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleFileDrop}
          >
            <div className="relative w-52 h-52">
              {/* Platter base */}
              <div className="absolute inset-0 rounded-full bg-linear-to-br from-neutral-800 to-neutral-900 shadow-[inset_0_2px_20px_rgba(0,0,0,0.5)]" />
              {/* Vinyl disc (rotates) */}
              <div
                ref={platterDomRef}
                className="absolute inset-2 rounded-full bg-linear-to-br from-neutral-950 to-neutral-900"
                style={{
                   transform: `rotate(${platAngleRef.current}deg)`, // eslint-disable-line react-hooks/refs
                  willChange: "transform",
                }}
              >
                {/* Grooves */}
                {[0.3, 0.4, 0.5, 0.6, 0.7, 0.8].map((r) => (
                  <div
                    key={r}
                    className="absolute rounded-full border border-neutral-800/30"
                    style={{ inset: `${(1 - r) * 50}%` }}
                  />
                ))}
                {/* Label */}
                <div className="absolute inset-[30%] rounded-full bg-linear-to-br from-red-900 to-red-950 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-neutral-400" />
                </div>
                {/* Position marker */}
                <div className="absolute top-1/2 right-2 w-4 h-px bg-red-500" />
              </div>
              {/* Drop zone overlay */}
              {!buffer && (
                <div className="absolute inset-0 rounded-full flex items-center justify-center bg-neutral-900/60 backdrop-blur-sm">
                  <span className="text-xs font-mono text-neutral-600 text-center">
                    Drop audio
                    <br />
                    or click Load
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Controls grid */}
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto custom-scrollbar p-3 gap-3">
            {/* Transport + RPM + Pitch */}
            <div className="flex items-start gap-3 flex-wrap bg-neutral-950/60 rounded-lg p-3 border border-neutral-800/50">
              {/* Transport */}
              <div className="flex gap-1.5">
                <button
                  onClick={() => buffer && setIsPlaying(!isPlaying)}
                  className={`p-2.5 rounded-lg transition-colors ${isPlaying ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30" : "bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700"}`}
                  disabled={!buffer}
                >
                  <Play size={16} fill={isPlaying ? "currentColor" : "none"} />
                </button>
                <button
                  onClick={() => {
                    setIsPlaying(false);
                    djStop("A");
                  }}
                  className="p-2.5 rounded-lg bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors"
                >
                  <Square size={16} fill="currentColor" />
                </button>
              </div>

              {/* RPM selector */}
              <div className="flex bg-neutral-900 rounded-lg p-1 border border-neutral-700/50 gap-0.5">
                {[33.3, 45, 78].map((rpm) => (
                  <button
                    key={rpm}
                    onClick={() => setVinylRpm(rpm)}
                    className={`px-3 py-1.5 rounded-md text-[13px] font-bold transition-all ${vinylRpm === rpm ? "bg-brand text-white shadow-lg shadow-brand/20" : "text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800"}`}
                  >
                    {rpm}
                  </button>
                ))}
              </div>

              {/* Pitch (semitones) */}
              <div className="flex items-center gap-2 bg-neutral-900 rounded-lg px-3 py-1.5 border border-neutral-700/50">
                <span className="text-xs font-mono text-neutral-500 uppercase">
                  Pitch
                </span>
                <input
                  type="range"
                  min={-12}
                  max={12}
                  step={1}
                  value={pitchSemitones}
                  onChange={(e) => setPitchSemitones(parseInt(e.target.value))}
                  className="w-24 h-1 bg-neutral-800 appearance-none accent-red-500"
                />
                <span className="text-[13px] font-mono text-neutral-400 w-6 text-center">
                  {pitchSemitones > 0 ? "+" : ""}
                  {pitchSemitones}
                </span>
              </div>

              {/* Key Lock */}
              <button
                onClick={() => setKeyLock(!keyLock)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-bold transition-all border ${
                  keyLock
                    ? "bg-blue-600/20 text-blue-400 border-blue-500/50"
                    : "bg-neutral-900 text-neutral-500 border-neutral-700/50 hover:border-neutral-600 hover:text-neutral-300"
                }`}
              >
                {keyLock ? <Lock size={11} /> : <Unlock size={11} />} Key Lock
              </button>

              {/* Speed multiplier */}
              <div className="flex items-center gap-2 bg-neutral-900 rounded-lg px-3 py-1.5 border border-neutral-700/50">
                <span className="text-xs font-mono text-neutral-500 uppercase">
                  Speed
                </span>
                <select
                  value={speedMult}
                  onChange={(e) => setSpeedMult(parseFloat(e.target.value))}
                  className="bg-neutral-800 border border-neutral-700 text-[13px] text-neutral-400 rounded px-2 py-1 outline-none"
                >
                  <option value={0.5}>0.5x</option>
                  <option value={0.75}>0.75x</option>
                  <option value={1.0}>1.0x</option>
                  <option value={1.25}>1.25x</option>
                  <option value={1.5}>1.5x</option>
                  <option value={2.0}>2.0x</option>
                </select>
              </div>
            </div>

            {/* Vinyl Sim knobs */}
            <div className="flex flex-col gap-2 pt-2 border-t border-neutral-800 separator-glow">
              <span className="text-xs font-bold text-neutral-500 uppercase tracking-widest">
                Vinyl Simulation
              </span>
              <div className="flex gap-3 flex-wrap bg-neutral-950/60 rounded-lg p-3 border border-neutral-800/50">
                <Knob
                  label="Inertia"
                  value={inertia}
                  onChange={setInertia}
                  color="#ef4444"
                />
                <Knob
                  label="Friction"
                  value={friction}
                  onChange={setFriction}
                  color="#ef4444"
                />
                <Knob
                  label="Noise"
                  value={vinylNoise}
                  onChange={setVinylNoise}
                  color="#f59e0b"
                />
                <Knob
                  label="Drift"
                  value={pitchDrift}
                  onChange={setPitchDrift}
                  color="#f59e0b"
                />
                <Knob
                  label="Drive"
                  value={vinylDrive}
                  onChange={setVinylDrive}
                  color="#8b5cf6"
                />
                <Knob
                  label="Wear"
                  value={wear}
                  onChange={setWear}
                  color="#8b5cf6"
                />
                <Knob
                  label="Crackle"
                  value={crackle}
                  onChange={setCrackle}
                  color="#6366f1"
                />
                <Knob
                  label="Volume"
                  value={volume}
                  onChange={setVolume}
                  color="#10b981"
                />
              </div>
            </div>

            {/* Effects knobs */}
            <div className="flex flex-col gap-2 pt-2 border-t border-neutral-800 separator-glow">
              <span className="text-xs font-bold text-neutral-500 uppercase tracking-widest">
                Effects
              </span>
              <div className="flex gap-3 flex-wrap bg-neutral-950/60 rounded-lg p-3 border border-neutral-800/50">
                <Knob
                  label="Echo"
                  value={echoWet}
                  onChange={setEchoWet}
                  color="#3b82f6"
                />
                <Knob
                  label="Reverb"
                  value={reverbWet}
                  onChange={setReverbWet}
                  color="#06b6d4"
                />
                <Knob
                  label="Lo-Fi"
                  value={lofiTone}
                  onChange={setLofiTone}
                  color="#f97316"
                />
                <Knob
                  label="Drive"
                  value={drive}
                  onChange={setDrive}
                  color="#ef4444"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          BOTTOM 1/3 — Waveform Chop View + Controls
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="flex-[1] flex flex-col min-h-0">
        {/* Chop toolbar */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-neutral-800 bg-neutral-950/60 shrink-0 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Scissors size={12} className="text-red-400" />
            <span className="text-[13px] font-bold text-neutral-300 uppercase tracking-wider">
              Chop
            </span>
          </div>

          {/* Mode toggle */}
          <div className="flex bg-neutral-950 rounded p-0.5 border border-neutral-800">
            <button
              onClick={() => {
                setChopMode("manual");
                setSlicePositions(generateEqualSlices(autoSliceCount));
              }}
              className={`px-2 py-0.5 rounded text-xs font-bold uppercase transition-all ${chopMode === "manual" ? "bg-brand text-white" : "text-neutral-500 hover:text-neutral-300"}`}
            >
              Manual
            </button>
            <button
              onClick={() => {
                setChopMode("transient");
                if (buffer) {
                  // Directly run transient detection here to avoid stale chopMode
                  const transients = detectTransients(buffer, sensitivity / 100);
                  const limited = transients.length > 15 ? transients.slice(0, 15) : transients;
                  setSlicePositions(limited);
                }
              }}
              className={`px-2 py-0.5 rounded text-xs font-bold uppercase transition-all ${chopMode === "transient" ? "bg-brand text-white" : "text-neutral-500 hover:text-neutral-300"}`}
            >
              Transient
            </button>
            <button
              onClick={() => {
                setChopMode("live");
                setSlicePositions([]);
              }}
              className={`px-2 py-0.5 rounded text-xs font-bold uppercase transition-all ${chopMode === "live" ? "bg-brand text-white" : "text-neutral-500 hover:text-neutral-300"}`}
            >
              Live
            </button>
            <button
              onClick={() => {
                setChopMode("energy");
                if (buffer) {
                  const peaks = detectEnergyEnvelope(buffer, sensitivity / 100);
                  const limited = peaks.length > 15 ? peaks.slice(0, 15) : peaks;
                  setSlicePositions(limited);
                }
              }}
              className={`px-2 py-0.5 rounded text-xs font-bold uppercase transition-all ${chopMode === "energy" ? "bg-brand text-white" : "text-neutral-500 hover:text-neutral-300"}`}
            >
              Energy
            </button>
          </div>

          {/* Slice count (manual mode) */}
          {chopMode === "manual" && (
            <div className="flex items-center gap-1">
              <span className="text-xs font-mono text-neutral-600">
                Slices:
              </span>
              <select
                value={autoSliceCount}
                onChange={(e) => {
                  const n = parseInt(e.target.value);
                  setAutoSliceCount(n);
                  setSlicePositions(generateEqualSlices(n));
                }}
                className="bg-neutral-950 border border-neutral-800 text-[13px] text-neutral-400 rounded px-1.5 py-0.5 outline-none"
              >
                {[2, 4, 8, 12, 16].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Sensitivity (transient mode) */}
          {chopMode === "transient" && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-neutral-600">
                Sensitivity:
              </span>
              <input
                type="range"
                min={10}
                max={100}
                value={sensitivity}
                onChange={(e) => setSensitivity(parseInt(e.target.value))}
                className="w-20 h-1 bg-neutral-800 appearance-none accent-red-500"
              />
              <button
                onClick={handleAutoChop}
                className="px-2 py-0.5 rounded text-xs font-bold bg-neutral-800 text-neutral-400 hover:text-white"
              >
                <Zap size={10} className="inline mr-1" />
                Detect
              </button>
            </div>
          )}

          {/* Live chop mode instructions */}
          {chopMode === "live" && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-neutral-600">
                Live: Press pads to mark slices
              </span>
              <span className="text-xs font-mono text-green-400">
                {slicePositions.length} markers
              </span>
            </div>
          )}

          {/* Slice Play Mode selector */}
          <div className="flex items-center gap-1">
            <span className="text-xs font-mono text-neutral-600">Play:</span>
            <select
              value={globalSliceMode}
              onChange={(e) => setGlobalSliceMode(e.target.value as SlicePlayMode)}
              className="bg-neutral-950 border border-neutral-800 text-[11px] text-neutral-400 rounded px-1.5 py-0.5 outline-none"
            >
              <option value="one-shot">One-Shot</option>
              <option value="gate">Gate</option>
              <option value="loop">Loop</option>
            </select>
          </div>

          <div className="flex-1" />

          <span className="text-xs font-mono text-neutral-600">
            {sliceCount} regions
          </span>

          {/* Action buttons */}
          <button
            onClick={handleAssignToPads}
            disabled={!buffer || slicePositions.length === 0}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-bold uppercase bg-brand text-white hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-md"
          >
            <Music size={11} /> To Pads
          </button>
          <button
            onClick={handleGoToDrums}
            disabled={!buffer || slicePositions.length === 0}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-bold uppercase bg-emerald-600 text-white hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-md"
          >
            <ChevronRight size={11} /> To Drums
          </button>
          <button
            onClick={handleStemChop}
            disabled={
              !buffer ||
              slicePositions.length === 0 ||
              stemState.status === "separating" ||
              stemState.status === "slicing"
            }
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-bold uppercase bg-linear-to-r from-purple-600 to-pink-600 text-white hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-md"
          >
            {stemState.status === "separating" ||
            stemState.status === "slicing" ? (
              <>
                <Loader2 size={10} className="animate-spin" /> {stemState.phase}
              </>
            ) : (
              <>
                <Scissors size={10} /> Stem Chop
              </>
            )}
          </button>
          <button
            onClick={() => {
              setSlicePositions([]);
              setStemState({
                status: "idle",
                progress: 0,
                phase: "",
                programs: [],
              });
            }}
            className="p-1.5 rounded-lg bg-neutral-800 text-neutral-500 hover:text-white hover:bg-neutral-700 transition-colors"
            title="Clear slices"
          >
            <RotateCcw size={12} />
          </button>
        </div>

        {/* Waveform + slice markers */}
        <div className="flex-1 flex flex-col min-h-0 px-4 py-2">
          {buffer ? (
            <>
              <div
                ref={waveformRef}
                className="flex-1 relative bg-neutral-950 rounded-lg border border-neutral-800 overflow-hidden cursor-crosshair min-h-20"
                onClick={chopMode === "manual" ? handleWaveformClick : undefined}
              >
                {/* Colored region backgrounds */}
                {(() => {
                  const all = [0, ...slicePositions, 1];
                  return all.slice(0, -1).map((start, i) => (
                    <div
                      key={i}
                      className="absolute inset-y-0"
                      style={{
                        left: `${start * 100}%`,
                        width: `${(all[i + 1] - start) * 100}%`,
                        backgroundColor:
                          SLICE_COLORS[i % SLICE_COLORS.length] + "10",
                      }}
                    />
                  ));
                })()}

                {/* Waveform bars */}
                <svg
                  className="absolute inset-0 w-full h-full"
                  preserveAspectRatio="none"
                  viewBox={`0 0 ${waveform.length} 100`}
                >
                  {waveform.map((val, i) => (
                    <rect
                      key={i}
                      x={i}
                      y={50 - val * 45}
                      width={0.8}
                      height={val * 90}
                      fill="#ef4444"
                      opacity={0.6}
                    />
                  ))}
                </svg>

                {/* Slice markers (draggable) */}
                {slicePositions.map((pos, i) => (
                  <div
                    key={i}
                    className="absolute inset-y-0 w-0.75 cursor-col-resize group z-10"
                    style={{ left: `calc(${pos * 100}% - 1.5px)` }}
                    onMouseDown={(e) => handleSliceMouseDown(i, e)}
                  >
                    <div className="absolute inset-y-0 w-px left-px bg-white/70 group-hover:bg-white transition-colors" />
                    {/* Handle */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white border-2 border-neutral-800 group-hover:border-brand transition-colors" />
                    {/* Pad number */}
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 text-[7px] font-bold text-neutral-500">
                      {i + 1}
                    </div>
                  </div>
                ))}

                {/* Flash indicator for live mode */}
                {flashSlice !== null && (
                  <div
                    className="absolute inset-y-0 w-0.5 z-20"
                    style={{
                      left: `calc(${flashSlice * 100}% - 1px)`,
                      backgroundColor: '#00ff00',
                      boxShadow: '0 0 8px #00ff00'
                    }}
                  />
                )}

                {/* Playhead position indicator */}
                <div
                  ref={playheadRef}
                  className="absolute inset-y-0 z-30 pointer-events-none"
                  style={{ left: "0%", width: "2px" }}
                >
                  <div className="absolute inset-0 bg-white" style={{ boxShadow: "0 0 6px rgba(255,255,255,0.5)" }} />
                  <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-t-[5px] border-l-transparent border-r-transparent border-t-white" />
                </div>

                {/* Click hint for manual mode */}
                {chopMode === "manual" && slicePositions.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[13px] text-neutral-600 font-mono">
                      Click to add slice markers
                    </span>
                  </div>
                )}
              </div>
              {slicePositions.length > 0 && (
                <div className="mt-2 bg-neutral-950 rounded-lg border border-neutral-800 p-3">
                  <div className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Slice Editor</div>
                  <div className="space-y-1">
                    {slicePositions.map((pos, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs font-mono text-neutral-400 w-6">#{i+1}</span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="0.1"
                          value={pos * 100}
                          onChange={(e) => {
                            const newPos = parseFloat(e.target.value) / 100;
                            const newPositions = [...slicePositions];
                            newPositions[i] = newPos;
                            setSlicePositions(newPositions.sort((a,b) => a - b));
                          }}
                          className="flex-1 h-1 bg-neutral-800 accent-red-500"
                        />
                        <span className="text-xs font-mono text-neutral-400 w-12">{Math.round(pos * 1000) / 10}%</span>
                        <button
                          onClick={() => {
                            setSlicePositions(prev => prev.filter((_, idx) => idx !== i));
                          }}
                          className="p-1 text-neutral-500 hover:text-red-400"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Saved Programs */}
              {savedPrograms.length > 0 && (
                <div className="mt-2 bg-neutral-950 rounded-lg border border-neutral-800 p-3">
                  <div className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Saved Programs</div>
                  <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                    {savedPrograms.map((program) => {
                      const fileMismatch = fileName && program.fileName !== fileName;
                      return (
                      <div key={program.id} className="flex items-center justify-between">
                        <div className="min-w-0 flex items-start gap-1">
                          {fileMismatch && (
                            <span
                              title={`Saved with "${program.fileName}" — current file is "${fileName}"`}
                              className="shrink-0 mt-0.5"
                            >
                              <AlertTriangle size={11} className="text-amber-400" />
                            </span>
                          )}
                          <div className="min-w-0">
                            <div className="text-xs font-mono text-neutral-300 truncate">{program.name}</div>
                            <div className={`text-[11px] font-mono truncate ${fileMismatch ? "text-amber-500/70" : "text-neutral-500"}`}>
                              {program.slicePositions.length} slices • {program.fileName}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => loadProgram(program)}
                            className="p-1 text-neutral-500 hover:text-green-400"
                            title="Load program"
                          >
                            <RotateCcw size={12} />
                          </button>
                          <button
                            onClick={() => deleteProgram(program.id)}
                            className="p-1 text-neutral-500 hover:text-red-400"
                            title="Delete program"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Save Program Form */}
              {slicePositions.length > 0 && (
                <div className="mt-2 bg-neutral-950 rounded-lg border border-neutral-800 p-3">
                  <div className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Save Program</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newProgramName}
                      onChange={(e) => setNewProgramName(e.target.value)}
                      placeholder="Program name"
                      className="flex-1 bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-xs font-mono text-neutral-300 outline-none focus:border-brand"
                    />
                    <button
                      onClick={() => {
                        if (newProgramName.trim()) {
                          saveCurrentProgram(newProgramName.trim());
                          setNewProgramName('');
                        }
                      }}
                      className="flex items-center gap-1 px-3 py-1 bg-brand text-white text-xs font-bold uppercase rounded hover:opacity-90"
                    >
                      <Save size={12} /> Save
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-neutral-950 rounded-lg border border-neutral-800 border-dashed">
              <span className="text-[13px] text-neutral-600 font-mono">
                Load audio to begin chopping
              </span>
            </div>
          )}

          {/* Stem chop progress / results */}
          {stemState.status !== "idle" && (
            <div className="mt-2 flex items-center gap-3 px-3 py-2 bg-neutral-950 rounded border border-neutral-800">
              {(stemState.status === "separating" ||
                stemState.status === "slicing") && (
                <>
                  <Loader2 size={12} className="animate-spin text-purple-400" />
                  <div className="flex-1">
                    <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-linear-to-r from-purple-500 to-pink-500 rounded-full transition-all"
                        style={{ width: `${stemState.progress}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-xs font-mono text-neutral-500">
                    {stemState.phase}
                  </span>
                </>
              )}
              {stemState.status === "done" && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-bold text-emerald-400">
                    Stem programs ready:
                  </span>
                  {stemState.programs.map((p, pi) => (
                    <div key={p.name} className="flex items-center gap-2">
                      <span className="text-xs font-mono text-neutral-400 bg-neutral-900 px-2 py-0.5 rounded min-w-20">
                        {p.name} ({p.slices.length})
                      </span>
                      {(["A", "B", "C", "D"] as const).map((bank) => (
                        <button
                          key={bank}
                          onClick={() => loadProgramToBank(pi, bank)}
                          className={`text-xs font-bold px-1.5 py-0.5 rounded transition-colors ${
                            p.loadedToBank === bank
                              ? "bg-emerald-600 text-white"
                              : "bg-neutral-800 text-neutral-500 hover:bg-neutral-700 hover:text-white"
                          }`}
                        >
                          {p.loadedToBank === bank ? `✓ ${bank}` : bank}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              {stemState.status === "error" && (
                <span className="text-[13px] text-red-400">
                  {stemState.error}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
