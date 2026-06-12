import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTBMAudio } from '../contexts/TBMAudioContext';

const NUM_BARS = 64;

/**
 * Spectrum analyser that taps into TBMAudioEngine's persistent AnalyserNode.
 * Falls back to an animated simulation only if the engine is not yet ready.
 */
export const SpectrumAnalyzer = React.memo(function SpectrumAnalyzer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const [source, setSource] = useState<'engine' | 'simulated'>('simulated');
  const sourceRef = useRef<'engine' | 'simulated'>('simulated');

  const { getEngineAnalyser } = useTBMAudio();

  // Stable setter that only triggers a React re-render when the value actually changes
  const updateSource = useCallback((val: 'engine' | 'simulated') => {
    if (sourceRef.current !== val) {
      sourceRef.current = val;
      setSource(val);
    }
  }, []);

  // Resize canvas to match its display size for sharp rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w = Math.round(rect.width * dpr);
      const h = Math.round(rect.height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    resizeCanvas();
    const ro = new ResizeObserver(resizeCanvas);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Try to get the engine analyser — may be null on first render before engine init
    const analyser = getEngineAnalyser();
    if (analyser) {
      // Pre-allocate the data array for the engine analyser
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
      queueMicrotask(() => {
        if (!cancelled) updateSource('engine');
      });
    } else {
      queueMicrotask(() => {
        if (!cancelled) updateSource('simulated');
      });
    }

    const draw = (ts: number) => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) { animRef.current = requestAnimationFrame(draw); return; }
      const w = canvas.width;
      const h = canvas.height;
      const context = canvas.getContext('2d');
      if (!context) { animRef.current = requestAnimationFrame(draw); return; }

      context.clearRect(0, 0, w, h);
      const barW = w / NUM_BARS;

      // Try engine analyser on each frame (it may become available after init)
      const liveAnalyser = getEngineAnalyser();

      // SpectrumAnalyzer 5.1: cache a single gradient per draw frame instead of
      // creating 64 new gradient objects every frame (was 3840 allocations/second).
      // Gradient runs bottom-to-top so that even short (quiet) bars receive the
      // brightest color segment — previously the gradient went top-to-bottom so
      // short bars only ever hit the dim bottom portion of the gradient, making
      // quiet frequencies visually invisible.
      const grad = context.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, 'rgba(252, 100, 100, 0.9)');
      grad.addColorStop(0.5, 'rgba(200, 50, 50, 0.6)');
      grad.addColorStop(1, 'rgba(100, 20, 20, 0.4)');
      context.fillStyle = grad;

      if (liveAnalyser && dataArrayRef.current) {
        if (dataArrayRef.current.length !== liveAnalyser.frequencyBinCount) {
          dataArrayRef.current = new Uint8Array(liveAnalyser.frequencyBinCount);
        }
        liveAnalyser.getByteFrequencyData(dataArrayRef.current);
        const data = dataArrayRef.current;

        for (let i = 0; i < NUM_BARS; i++) {
          const idx = Math.floor((i / NUM_BARS) * data.length);
          const pct = data[idx] / 255;
          const barH = Math.max(2, pct * h);
          context.fillRect(i * barW + 0.5, h - barH, barW - 1, barH);
        }

        // Update label if it was simulated before (ref check avoids unnecessary re-renders)
        updateSource('engine');
      } else {
        // Animated simulation – smooth musical-looking curve (fallback)
        const t = ts / 1000;
        for (let i = 0; i < NUM_BARS; i++) {
          const norm = i / NUM_BARS;
          const env = 1 - Math.pow(norm, 1.6);
          const pct = Math.max(0.03,
            env * (
              0.35 + 0.25 * Math.sin(t * 1.7 + norm * 8)
                   + 0.15 * Math.sin(t * 3.1 + norm * 20)
                   + 0.10 * Math.sin(t * 5.3 + norm * 40)
            )
          );
          const barH = pct * h;
          context.fillRect(i * barW + 0.5, h - barH, barW - 1, barH);
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelled = true;
      cancelAnimationFrame(animRef.current);
      dataArrayRef.current = null;
    };
  }, [getEngineAnalyser, updateSource]);

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <h3 className="text-[13px] font-bold text-neutral-500 uppercase tracking-widest drop-shadow-[0_0_4px_rgba(255,199,44,0.15)]">
          Spectrum Analysis{source === 'simulated' ? ' · Simulated' : ' · Live'}
        </h3>
        <div className="flex gap-2 text-xs font-mono text-neutral-600">
          <span>20Hz</span>
          <span>1kHz</span>
          <span>20kHz</span>
        </div>
      </div>
      <div className="flex-1 bg-black/40 rounded border border-neutral-800 overflow-hidden relative vignette">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ willChange: 'contents' }}
        />
      </div>
    </div>
  );
});
