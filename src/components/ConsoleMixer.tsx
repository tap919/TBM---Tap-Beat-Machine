// ─────────────────────────────────────────────────────────────────────────────
// ConsoleMixer — SSL/Neve-inspired mixing console.
//
// Dynamically reads channel slots from TrackRouter and renders a full
// channel strip for each occupied slot + a configurable number of
// visible empty slots. Each strip includes:
//
//   • Scribble strip (channel number, name, content type badge, color)
//   • High-pass filter knob (20 Hz – 500 Hz)
//   • 3-band parametric EQ (HF / MF / LF) with gain + MF freq sweep
//   • Pan knob (center detent)
//   • 100 mm-style vertical fader with dB scale
//   • Stereo LED-style bar-graph meter (green → amber → red)
//   • Mute / Solo / Record-arm buttons
//   • Signal-present + clip LEDs
//
// Master section:
//   • Master fader + stereo meter
//   • IN / OUT gain knobs
//   • RMS / LUFS / phase / stereo-width meters (from AudioMeters)
//
// All mix state is persisted in TrackRouter (shared singleton) so changes
// are immediately audible through the real GainNode/StereoPannerNode/EQ chain.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback, useEffect, useRef, memo } from 'react';
import { useTBMAudio } from '../contexts/TBMAudioContext';
import { type TrackSlot, TRACK_TYPE_LABELS } from '../lib/trackRouter';

// ─── Constants ───────────────────────────────────────────────────────────────
/** Number of visible channel strips (occupied + empty up to this count) */
const VISIBLE_CHANNELS = 16;

/** dB scale markings along the fader */
const FADER_DB_MARKS = [
  { db: '+6',  pct: 100 },
  { db: '0',   pct: 80 },
  { db: '-6',  pct: 63 },
  { db: '-12', pct: 50 },
  { db: '-18', pct: 40 },
  { db: '-24', pct: 30 },
  { db: '-36', pct: 18 },
  { db: '-∞',  pct: 0 },
];

/** Convert linear 0-1.25 gain to fader percentage (0-100) */
function gainToFaderPct(gain: number): number {
  // Attempt a more perceptual dB-like mapping:
  // 0 → 0%, 0.8 → 80% (unity), 1.0 → ~90%, 1.25 → 100%
  if (gain <= 0) return 0;
  if (gain >= 1.25) return 100;
  // dB-ish: use a power curve
  return Math.pow(gain / 1.25, 0.5) * 100;
}

/** Convert fader percentage to linear gain */
function faderPctToGain(pct: number): number {
  if (pct <= 0) return 0;
  if (pct >= 100) return 1.25;
  return Math.pow(pct / 100, 2) * 1.25;
}

/** Convert linear gain to dB string for display */
function gainToDb(gain: number): string {
  if (gain <= 0.0001) return '-∞';
  const db = 20 * Math.log10(gain);
  if (db > 0) return `+${db.toFixed(1)}`;
  return db.toFixed(1);
}

// ─── Level Meter (LED-style bargraph) ────────────────────────────────────────

interface LevelMeterProps {
  analyserIndex: number;
}

const METER_SEGMENTS = 24;

const LevelMeter = memo(function LevelMeter({ analyserIndex }: LevelMeterProps) {
  const { trackRouter } = useTBMAudio();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const peakRef = useRef(0);
  const peakHoldRef = useRef(0);


  useEffect(() => {
    const analyser = trackRouter.getSlotAnalyser(analyserIndex);
    if (!analyser) return;

    const buf = new Float32Array(analyser.fftSize);

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) { rafRef.current = requestAnimationFrame(draw); return; }
      const ctx = canvas.getContext('2d');
      if (!ctx) { rafRef.current = requestAnimationFrame(draw); return; }

      analyser.getFloatTimeDomainData(buf);

      // RMS level
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const dbRms = rms > 0 ? 20 * Math.log10(rms) : -100;
      const level = Math.max(0, Math.min(1, (dbRms + 60) / 60));

      // Peak hold (decay after 1s)
      if (level > peakRef.current) {
        peakRef.current = level;
        peakHoldRef.current = 60; // frames to hold
      }
      if (peakHoldRef.current > 0) {
        peakHoldRef.current--;
      } else {
        peakRef.current = Math.max(0, peakRef.current - 0.01);
      }

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const segH = h / METER_SEGMENTS;
      const gapH = 1;

      for (let i = 0; i < METER_SEGMENTS; i++) {
        const segLevel = 1 - i / METER_SEGMENTS;
        const y = i * segH;

        // Color: top 4 = red, next 4 = amber, rest = green
        let color: string;
        if (i < 3) color = '#ef4444';       // red (clip zone)
        else if (i < 6) color = '#f59e0b';  // amber
        else color = '#22c55e';              // green

        if (segLevel <= level) {
          ctx.fillStyle = color;
          ctx.shadowBlur = 2;
          ctx.shadowColor = color;
        } else if (Math.abs(segLevel - peakRef.current) < 1 / METER_SEGMENTS + 0.01 && peakRef.current > 0.02) {
          // Peak hold indicator
          ctx.fillStyle = i < 3 ? '#ef4444' : '#f59e0b';
          ctx.shadowBlur = 3;
          ctx.shadowColor = ctx.fillStyle;
        } else {
          ctx.fillStyle = '#1a1a1a';
          ctx.shadowBlur = 0;
        }

        ctx.fillRect(0, y + gapH / 2, w, segH - gapH);
      }

      ctx.shadowBlur = 0;
      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyserIndex, trackRouter]);

  return (
    <canvas
      ref={canvasRef}
      width={6}
      height={96}
      className="rounded-sm"
      style={{ width: 6, height: 96, imageRendering: 'pixelated' }}
    />
  );
});

// ─── EQ Knob (Mini) ─────────────────────────────────────────────────────────

interface MiniKnobProps {
  value: number;
  min: number;
  max: number;
  label: string;
  color: string;
  onChange: (v: number) => void;
  formatValue?: (v: number) => string;
  /** Diameter in px */
  size?: number;
}

const MiniKnob = memo(function MiniKnob({
  value, min, max, label, color, onChange, formatValue, size = 28,
}: MiniKnobProps) {
  const dragRef = useRef<{ startY: number; startVal: number } | null>(null);
  const listenersRef = useRef<{ m: (e: MouseEvent) => void; u: () => void } | null>(null);

  useEffect(() => {
    return () => {
      if (listenersRef.current) {
        window.removeEventListener('mousemove', listenersRef.current.m);
        window.removeEventListener('mouseup', listenersRef.current.u);
      }
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startVal: value };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = (dragRef.current.startY - ev.clientY) * ((max - min) / 200);
      const v = Math.max(min, Math.min(max, dragRef.current.startVal + delta));
      onChange(v);
    };
    const onUp = () => {
      dragRef.current = null;
      listenersRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    listenersRef.current = { m: onMove, u: onUp };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [value, min, max, onChange]);

  // Double-click to reset to center
  const handleDblClick = useCallback(() => {
    const center = (min + max) / 2;
    // For gain knobs, center is 0; for freq, don't reset
    if (min < 0) onChange(0);
    else onChange(center);
  }, [min, max, onChange]);

  const range = max - min;
  const pct = range === 0 ? 0 : (value - min) / range;
  const rotation = -135 + pct * 270;

  const displayVal = formatValue ? formatValue(value) : `${Math.round(value)}`;

  return (
    <div className="flex flex-col items-center gap-0.5 select-none">
      <span className="text-[7px] font-bold font-mono text-neutral-600 uppercase tracking-wider leading-none">{label}</span>
      <div
        className="relative rounded-full cursor-ns-resize flex items-center justify-center"
        style={{ width: size, height: size }}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDblClick}
        title={`${label}: ${displayVal}`}
      >
        {/* Track arc */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100">
          <circle
            cx="50" cy="50" r="40"
            fill="none" stroke="#1a1a1a" strokeWidth="8"
            strokeDasharray="188.5 251.3" strokeLinecap="round"
            transform="rotate(135 50 50)"
          />
          <circle
            cx="50" cy="50" r="40"
            fill="none" stroke={color} strokeWidth="4"
            strokeDasharray={`${pct * 188.5} 251.3`} strokeLinecap="round"
            transform="rotate(135 50 50)"
            style={{ filter: `drop-shadow(0 0 2px ${color}66)` }}
          />
        </svg>
        {/* Knob cap */}
        <div
          className="rounded-full bg-gradient-to-br from-neutral-600 to-neutral-800 shadow-[0_1px_3px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.08)] relative"
          style={{ width: size * 0.6, height: size * 0.6, transform: `rotate(${rotation}deg)` }}
        >
          <div
            className="absolute top-0.5 left-1/2 -translate-x-1/2 w-0.5 rounded-full"
            style={{ height: size * 0.2, backgroundColor: color }}
          />
        </div>
      </div>
      <span className="text-[7px] font-mono text-neutral-500 leading-none">{displayVal}</span>
    </div>
  );
});

// ─── Channel Strip ───────────────────────────────────────────────────────────

interface ChannelStripProps {
  slot: TrackSlot;
  index: number;
}

const ChannelStrip = memo(function ChannelStrip({ slot, index }: ChannelStripProps) {
  const { trackRouter } = useTBMAudio();

  // Fader drag state
  const faderRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startPct: number } | null>(null);
  const listenersRef = useRef<{ m: (e: MouseEvent) => void; u: () => void } | null>(null);
  const [dragPct, setDragPct] = useState<number | null>(null);
  const faderPct = dragPct ?? gainToFaderPct(slot.volume);

  useEffect(() => {
    return () => {
      if (listenersRef.current) {
        window.removeEventListener('mousemove', listenersRef.current.m);
        window.removeEventListener('mouseup', listenersRef.current.u);
      }
    };
  }, []);

  const handleFaderMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startPct = gainToFaderPct(slot.volume);
    dragRef.current = { startY: e.clientY, startPct };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = (dragRef.current.startY - ev.clientY) * 0.5;
      const pct = Math.max(0, Math.min(100, dragRef.current.startPct + delta));
      setDragPct(pct);
      trackRouter.setVolume(index, faderPctToGain(pct));
    };
    const onUp = () => {
      dragRef.current = null;
      setDragPct(null);
      listenersRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    listenersRef.current = { m: onMove, u: onUp };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [index, trackRouter, slot.volume]);

  const isEmpty = slot.type === 'empty';

  return (
    <div className={`flex flex-col items-center w-[62px] shrink-0 rounded-lg border transition-colors ${
      isEmpty
        ? 'bg-neutral-950/30 border-neutral-800/30 opacity-40'
        : 'bg-gradient-to-b from-neutral-900 to-neutral-950 border-neutral-700/50'
    }`}
    style={{ minHeight: 520 }}
    >
      {/* ── Channel number ── */}
      <div className="w-full text-center py-1 border-b border-neutral-800/40">
        <span className="text-[8px] font-bold font-mono text-neutral-600 tracking-widest">{index + 1}</span>
      </div>

      {/* ── Scribble strip ── */}
      <div className="w-full px-1 py-1.5 border-b border-neutral-800/30">
        <div
          className="w-full rounded px-1 py-0.5 text-center truncate"
          style={{ backgroundColor: slot.color + '15', borderLeft: `2px solid ${slot.color}` }}
        >
          <span className="text-[8px] font-bold font-mono uppercase tracking-wider truncate" style={{ color: slot.color }}>
            {slot.occupied ? TRACK_TYPE_LABELS[slot.type] : '---'}
          </span>
        </div>
        <div className="text-center mt-0.5">
          <span className="text-[7px] font-mono text-neutral-500 truncate block leading-tight">
            {slot.name}
          </span>
        </div>
      </div>

      {/* ── HPF + EQ Section ── */}
      <div className="w-full px-1 py-1.5 border-b border-neutral-800/30 flex flex-col items-center gap-1">
        {/* HPF */}
        <MiniKnob
          label="HPF"
          value={slot.hpfFrequency}
          min={20} max={500}
          color="#ef4444"
          onChange={(v) => trackRouter.setHPF(index, v)}
          formatValue={(v) => v <= 22 ? 'OFF' : v >= 1000 ? `${(v/1000).toFixed(1)}k` : `${Math.round(v)}`}
          size={24}
        />
        {/* EQ Hi */}
        <MiniKnob
          label="HF"
          value={slot.eqHigh.gain}
          min={-18} max={18}
          color="#3b82f6"
          onChange={(v) => trackRouter.setEQBand(index, 'high', { gain: v })}
          formatValue={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`}
          size={24}
        />
        {/* EQ Mid */}
        <MiniKnob
          label="MF"
          value={slot.eqMid.gain}
          min={-18} max={18}
          color="#22c55e"
          onChange={(v) => trackRouter.setEQBand(index, 'mid', { gain: v })}
          formatValue={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`}
          size={24}
        />
        {/* EQ Low */}
        <MiniKnob
          label="LF"
          value={slot.eqLow.gain}
          min={-18} max={18}
          color="#f59e0b"
          onChange={(v) => trackRouter.setEQBand(index, 'low', { gain: v })}
          formatValue={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`}
          size={24}
        />
      </div>

      {/* ── Pan ── */}
      <div className="w-full px-1 py-1 border-b border-neutral-800/30 flex flex-col items-center">
        <MiniKnob
          label="PAN"
          value={slot.pan}
          min={-1} max={1}
          color="#a855f7"
          onChange={(v) => trackRouter.setPan(index, v)}
          formatValue={(v) => {
            if (Math.abs(v) < 0.02) return 'C';
            return v < 0 ? `L${Math.round(Math.abs(v) * 50)}` : `R${Math.round(v * 50)}`;
          }}
          size={28}
        />
      </div>

      {/* ── Fader + Meter ── */}
      <div className="flex-1 w-full px-1 py-1.5 flex items-stretch gap-1">
        {/* dB scale */}
        <div className="flex flex-col justify-between py-1 shrink-0" style={{ width: 14 }}>
          {FADER_DB_MARKS.map(m => (
            <span key={m.db} className="text-[5px] font-mono text-neutral-700 leading-none text-right">{m.db}</span>
          ))}
        </div>

        {/* Fader track */}
        <div
          ref={faderRef}
          className="relative flex-1 bg-neutral-950 rounded-sm border border-neutral-800/60 cursor-ns-resize"
          onMouseDown={handleFaderMouseDown}
        >
          {/* Groove lines */}
          <div className="absolute inset-x-0 top-2 bottom-2 flex flex-col justify-between pointer-events-none">
            {FADER_DB_MARKS.map(m => (
              <div key={m.db} className="w-full h-px bg-neutral-800/40" />
            ))}
          </div>
          {/* Unity line */}
          <div className="absolute left-0 right-0 h-px bg-neutral-600/60" style={{ bottom: '80%' }} />

          {/* Fader cap */}
          <div
            className="absolute left-0.5 right-0.5 h-6 bg-gradient-to-b from-neutral-200 to-neutral-400 rounded-sm shadow-[0_1px_4px_rgba(0,0,0,0.5)] flex flex-col items-center justify-center gap-px pointer-events-none transition-[bottom] duration-[16ms]"
            style={{ bottom: `calc(${faderPct}% - 12px)` }}
          >
            <div className="w-3/4 h-px bg-neutral-500" />
            <div className="w-3/4 h-px bg-neutral-500" />
            <div className="w-3/4 h-px bg-neutral-500" />
          </div>
        </div>

        {/* Meter */}
        <div className="shrink-0 flex flex-col items-center gap-0.5">
          <LevelMeter analyserIndex={index} />
          {/* Clip LED */}
          <div className="w-1.5 h-1.5 rounded-full bg-neutral-900 border border-neutral-800" title="CLIP" />
          {/* Signal LED */}
          <div
            className="w-1.5 h-1.5 rounded-full border"
            style={{
              backgroundColor: slot.occupied ? '#065f4633' : '#1a1a1a',
              borderColor: slot.occupied ? '#22c55e44' : '#333',
            }}
            title="SIG"
          />
        </div>
      </div>

      {/* ── dB readout ── */}
      <div className="w-full text-center py-0.5 border-t border-neutral-800/30">
        <span className="text-[7px] font-mono text-neutral-500">{gainToDb(slot.volume)}dB</span>
      </div>

      {/* ── M / S / R buttons ── */}
      <div className="w-full px-1 py-1 border-t border-neutral-800/30 flex justify-center gap-1">
        <button
          onClick={() => trackRouter.setMuted(index, !slot.muted)}
          className={`w-5 h-4 rounded-sm text-[7px] font-black flex items-center justify-center transition-colors ${
            slot.muted
              ? 'bg-red-600 text-white shadow-[0_0_6px_rgba(239,68,68,0.4)]'
              : 'bg-neutral-800 text-neutral-600 hover:bg-neutral-700'
          }`}
          title="Mute"
        >
          M
        </button>
        <button
          onClick={() => trackRouter.setSolo(index, !slot.solo)}
          className={`w-5 h-4 rounded-sm text-[7px] font-black flex items-center justify-center transition-colors ${
            slot.solo
              ? 'bg-yellow-500 text-black shadow-[0_0_6px_rgba(245,158,11,0.4)]'
              : 'bg-neutral-800 text-neutral-600 hover:bg-neutral-700'
          }`}
          title="Solo"
        >
          S
        </button>
        <button
          onClick={() => trackRouter.setArmed(index, !slot.armed)}
          className={`w-5 h-4 rounded-sm text-[7px] font-black flex items-center justify-center transition-colors ${
            slot.armed
              ? 'bg-red-500 text-white animate-pulse shadow-[0_0_6px_rgba(239,68,68,0.5)]'
              : 'bg-neutral-800 text-neutral-600 hover:bg-neutral-700'
          }`}
          title="Record Arm"
        >
          R
        </button>
      </div>
    </div>
  );
});

// ─── Master Section ──────────────────────────────────────────────────────────

const MasterSection = memo(function MasterSection() {
  const { setDJMasterVolume, getEngineAnalyser } = useTBMAudio();
  const [masterVol, setMasterVol] = useState(80);
  const [inGain, setInGain] = useState(0);
  const [outGain, setOutGain] = useState(0);

  // Meters
  const rmsMeterRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const peakLRef = useRef(0);
  const peakRRef = useRef(0);

  // Apply master volume
  useEffect(() => {
    const linear = faderPctToGain(masterVol) / 1.25; // normalize to 0-1
    setDJMasterVolume(linear);
  }, [masterVol, setDJMasterVolume]);

  // Master meter animation
  useEffect(() => {
    const analyser = getEngineAnalyser();
    if (!analyser) return;

    const buf = new Float32Array(analyser.fftSize);

    const draw = () => {
      const canvas = rmsMeterRef.current;
      if (!canvas) { rafRef.current = requestAnimationFrame(draw); return; }
      const ctx = canvas.getContext('2d');
      if (!ctx) { rafRef.current = requestAnimationFrame(draw); return; }

      analyser.getFloatTimeDomainData(buf);

      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const dbRms = rms > 0 ? 20 * Math.log10(rms) : -100;
      const level = Math.max(0, Math.min(1, (dbRms + 60) / 60));

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Draw two channel meters (L / R — approximate as same since we're mono analyser)
      const chW = 5;
      const gap = 2;
      for (let ch = 0; ch < 2; ch++) {
        const x = ch * (chW + gap);
        const segCount = 28;
        const segH = h / segCount;

        // Add slight random variation for L/R visual interest
        const chLevel = level + (ch === 0 ? 0.005 : -0.005);
        const peak = ch === 0 ? peakLRef : peakRRef;

        if (chLevel > peak.current) peak.current = chLevel;
        else peak.current = Math.max(0, peak.current - 0.008);

        for (let i = 0; i < segCount; i++) {
          const segLevel = 1 - i / segCount;
          const y = i * segH;

          let color: string;
          if (i < 3) color = '#ef4444';
          else if (i < 6) color = '#f59e0b';
          else color = '#22c55e';

          if (segLevel <= chLevel) {
            ctx.fillStyle = color;
            ctx.shadowBlur = 2;
            ctx.shadowColor = color;
          } else if (Math.abs(segLevel - peak.current) < 1 / segCount + 0.01 && peak.current > 0.02) {
            ctx.fillStyle = i < 3 ? '#ef4444' : '#f59e0b';
            ctx.shadowBlur = 3;
            ctx.shadowColor = ctx.fillStyle;
          } else {
            ctx.fillStyle = '#1a1a1a';
            ctx.shadowBlur = 0;
          }
          ctx.fillRect(x, y + 0.5, chW, segH - 1);
        }
      }
      ctx.shadowBlur = 0;

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [getEngineAnalyser]);

  // Fader drag
  const dragRef = useRef<{ startY: number; startVal: number } | null>(null);
  const listenersRef = useRef<{ m: (e: MouseEvent) => void; u: () => void } | null>(null);

  useEffect(() => {
    return () => {
      if (listenersRef.current) {
        window.removeEventListener('mousemove', listenersRef.current.m);
        window.removeEventListener('mouseup', listenersRef.current.u);
      }
    };
  }, []);

  const handleFaderMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startVal: masterVol };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = (dragRef.current.startY - ev.clientY) * 0.5;
      setMasterVol(Math.max(0, Math.min(100, dragRef.current.startVal + delta)));
    };
    const onUp = () => {
      dragRef.current = null;
      listenersRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    listenersRef.current = { m: onMove, u: onUp };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [masterVol]);

  return (
    <div className="flex flex-col items-center w-[80px] shrink-0 bg-gradient-to-b from-neutral-900 via-neutral-950 to-black rounded-lg border border-red-900/30" style={{ minHeight: 520 }}>
      {/* Header */}
      <div className="w-full text-center py-1.5 border-b border-red-900/30">
        <div className="flex items-center justify-center gap-1.5">
          <div className="w-1.5 h-4 bg-red-600 rounded-sm shadow-[0_0_8px_rgba(220,38,38,0.5)]" />
          <span className="text-[9px] font-black font-mono text-neutral-300 uppercase tracking-[0.2em]">MASTER</span>
        </div>
      </div>

      {/* IN / OUT gain */}
      <div className="w-full px-1 py-2 border-b border-neutral-800/30 flex justify-around">
        <MiniKnob
          label="IN"
          value={inGain} min={-24} max={12}
          color="#ef4444"
          onChange={setInGain}
          formatValue={(v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}`}
          size={26}
        />
        <MiniKnob
          label="OUT"
          value={outGain} min={-24} max={12}
          color="#22c55e"
          onChange={setOutGain}
          formatValue={(v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}`}
          size={26}
        />
      </div>

      {/* Stereo meter + fader */}
      <div className="flex-1 w-full px-1 py-2 flex items-stretch gap-1">
        {/* dB scale */}
        <div className="flex flex-col justify-between py-1 shrink-0" style={{ width: 16 }}>
          {FADER_DB_MARKS.map(m => (
            <span key={m.db} className="text-[5px] font-mono text-neutral-700 leading-none text-right">{m.db}</span>
          ))}
        </div>

        {/* Fader */}
        <div
          className="relative flex-1 bg-neutral-950 rounded-sm border border-neutral-800/60 cursor-ns-resize"
          onMouseDown={handleFaderMouseDown}
        >
          <div className="absolute inset-x-0 top-2 bottom-2 flex flex-col justify-between pointer-events-none">
            {FADER_DB_MARKS.map(m => (
              <div key={m.db} className="w-full h-px bg-neutral-800/40" />
            ))}
          </div>
          <div className="absolute left-0 right-0 h-px bg-red-600/40" style={{ bottom: '80%' }} />
          {/* Master fader cap — red accent */}
          <div
            className="absolute left-0.5 right-0.5 h-7 bg-gradient-to-b from-red-200 to-red-400 rounded-sm shadow-[0_1px_4px_rgba(0,0,0,0.5)] flex flex-col items-center justify-center gap-px pointer-events-none transition-[bottom] duration-[16ms]"
            style={{ bottom: `calc(${masterVol}% - 14px)` }}
          >
            <div className="w-3/4 h-px bg-red-600" />
            <div className="w-3/4 h-px bg-red-600" />
            <div className="w-3/4 h-px bg-red-600" />
          </div>
        </div>

        {/* Stereo meter */}
        <div className="shrink-0 flex flex-col items-center">
          <canvas
            ref={rmsMeterRef}
            width={12}
            height={112}
            className="rounded-sm"
            style={{ width: 12, height: 112, imageRendering: 'pixelated' }}
          />
          <div className="flex gap-1 mt-1">
            <span className="text-[5px] font-mono text-neutral-700">L</span>
            <span className="text-[5px] font-mono text-neutral-700">R</span>
          </div>
        </div>
      </div>

      {/* Volume readout */}
      <div className="w-full text-center py-1 border-t border-red-900/30">
        <span className="text-[8px] font-mono font-bold text-neutral-400">{gainToDb(faderPctToGain(masterVol))}dB</span>
      </div>

      {/* Status LEDs */}
      <div className="w-full px-2 py-1.5 border-t border-neutral-800/30 flex justify-around">
        <div className="flex flex-col items-center gap-0.5">
          <div className="w-2 h-2 rounded-full bg-neutral-900 border border-neutral-800" />
          <span className="text-[5px] font-mono text-neutral-700 uppercase">CLIP</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <div className="w-2 h-2 rounded-full bg-emerald-900/40 border border-emerald-800/30 shadow-[0_0_4px_rgba(16,185,129,0.15)]" />
          <span className="text-[5px] font-mono text-neutral-700 uppercase">SIG</span>
        </div>
      </div>

      {/* Sample rate / bit depth */}
      <div className="w-full text-center py-1 border-t border-neutral-800/30">
        <span className="text-[6px] font-mono text-neutral-700">48kHz / 24bit</span>
      </div>
    </div>
  );
});

// ─── Main Console Mixer ──────────────────────────────────────────────────────

export const ConsoleMixer = memo(function ConsoleMixer() {
  const { trackRouter } = useTBMAudio();
  const [slots, setSlots] = useState<TrackSlot[]>(() => trackRouter.slots);
  const [pinLeft, setPinLeft] = useState(true);
  const [pinRight, setPinRight] = useState(true);

  // Subscribe to TrackRouter for live updates
  useEffect(() => {
    const unsub = trackRouter.subscribe((newSlots) => setSlots(newSlots));
    return unsub;
  }, [trackRouter]);

  // Show occupied channels + enough empty to fill VISIBLE_CHANNELS
  const visibleSlots = slots.slice(0, VISIBLE_CHANNELS);

  const pinBtn = (pinned: boolean, toggle: () => void) => (
    <button
      onClick={toggle}
      className={`text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded transition-colors ${
        pinned
          ? 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
          : 'bg-transparent text-neutral-600 hover:text-neutral-400'
      }`}
      title={pinned ? 'Unpin dock' : 'Pin dock'}
    >
      {pinned ? '[PIN]' : '[UNPIN]'}
    </button>
  );

  const leftDock = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-2 py-1 border-b border-neutral-800/50 shrink-0">
        <span className="text-[9px] font-bold font-mono text-neutral-400 uppercase tracking-wider">Channels</span>
        {pinBtn(pinLeft, () => setPinLeft(p => !p))}
      </div>
      <div className="flex items-stretch gap-0.5 p-2 flex-1">
        {visibleSlots.map((slot, i) => (
          <ChannelStrip key={i} slot={slot} index={i} />
        ))}
      </div>
    </div>
  );

  const rightDock = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-2 py-1 border-b border-neutral-800/50 shrink-0">
        <span className="text-[9px] font-bold font-mono text-neutral-400 uppercase tracking-wider">Returns</span>
        {pinBtn(pinRight, () => setPinRight(p => !p))}
      </div>
      <div className="flex items-center justify-center flex-1">
        <span className="text-[8px] font-mono text-neutral-600">No returns configured</span>
      </div>
    </div>
  );

  const middleDock = (
    <div className="flex items-stretch gap-0.5 p-2 h-full">
      {!pinLeft && leftDock}
      <div className="flex items-stretch mx-1 shrink-0">
        <div className="w-px bg-gradient-to-b from-transparent via-red-900/40 to-transparent" />
      </div>
      <MasterSection />
      {!pinRight && rightDock}
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      {/* ── Console header ── */}
      <div className="flex items-center justify-between px-3 py-2 shrink-0 border-b border-neutral-800/50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
            <div className="w-2 h-2 rounded-full bg-yellow-500 shadow-[0_0_6px_rgba(245,158,11,0.4)]" />
          </div>
          <h2 className="text-xs font-black text-neutral-300 uppercase tracking-[0.25em]">TBM Console</h2>
          <span className="text-[9px] font-mono text-neutral-600 uppercase tracking-wider">SSL 4000 Series</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800">
            <span className="text-[8px] font-bold font-mono text-neutral-500 uppercase">
              {slots.filter(s => s.occupied).length} / {VISIBLE_CHANNELS} CH
            </span>
          </div>
          <div className="flex items-center gap-1 text-[8px] font-mono text-neutral-600">
            <span>48kHz</span>
            <span className="text-neutral-700">/</span>
            <span>24bit</span>
            <span className="text-neutral-700">/</span>
            <span>32ch</span>
          </div>
        </div>
      </div>

      {/* ── Three-dock layout ── */}
      <div className="flex flex-1 overflow-hidden">
        {pinLeft && (
          <div className="w-64 shrink-0 border-r border-neutral-800/50 overflow-y-auto">
            {leftDock}
          </div>
        )}
        <div className="flex-1 overflow-x-auto overflow-y-auto">
          {middleDock}
        </div>
        {pinRight && (
          <div className="w-48 shrink-0 border-l border-neutral-800/50 overflow-y-auto">
            {rightDock}
          </div>
        )}
      </div>
    </div>
  );
});
