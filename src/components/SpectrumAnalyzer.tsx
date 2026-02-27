import React, { useEffect, useRef, useState } from 'react';

const NUM_BARS = 64;

/** Attempt to capture microphone/system audio for a real spectrum; fall back to animated simulation. */
export function SpectrumAnalyzer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [hasAudio, setHasAudio] = useState(false);
  const timeRef = useRef(0);

  useEffect(() => {
    let ctx: AudioContext | null = null;
    let cancelled = false;

    const start = async () => {
      try {
        // Request microphone to get a real signal
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        source.connect(analyser);
        analyserRef.current = analyser;
        setHasAudio(true);
      } catch {
        // No mic access – animated simulation
        setHasAudio(false);
      }
    };

    start();

    const draw = (ts: number) => {
      timeRef.current = ts;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const w = canvas.width;
      const h = canvas.height;
      const context = canvas.getContext('2d');
      if (!context) return;

      context.clearRect(0, 0, w, h);

      const barW = w / NUM_BARS;
      const analyser = analyserRef.current;

      if (analyser) {
        // Real audio data
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        for (let i = 0; i < NUM_BARS; i++) {
          const idx = Math.floor((i / NUM_BARS) * data.length);
          const pct = data[idx] / 255;
          const barH = Math.max(2, pct * h);
          const grad = context.createLinearGradient(0, h - barH, 0, h);
          grad.addColorStop(0, 'rgba(252, 100, 100, 0.9)');
          grad.addColorStop(0.5, 'rgba(200, 50, 50, 0.6)');
          grad.addColorStop(1, 'rgba(100, 20, 20, 0.4)');
          context.fillStyle = grad;
          context.fillRect(i * barW + 0.5, h - barH, barW - 1, barH);
        }
      } else {
        // Animated simulation – smooth musical-looking curve
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
          const grad = context.createLinearGradient(0, h - barH, 0, h);
          grad.addColorStop(0, 'rgba(252, 100, 100, 0.9)');
          grad.addColorStop(0.5, 'rgba(180, 40, 40, 0.6)');
          grad.addColorStop(1, 'rgba(80, 15, 15, 0.35)');
          context.fillStyle = grad;
          context.fillRect(i * barW + 0.5, h - barH, barW - 1, barH);
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelled = true;
      cancelAnimationFrame(animRef.current);
      analyserRef.current = null;
      streamRef.current?.getTracks().forEach(t => t.stop());
      ctx?.close();
    };
  }, []);

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <h3 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
          Spectrum Analysis{hasAudio ? '' : ' · Simulated'}
        </h3>
        <div className="flex gap-2 text-[8px] font-mono text-neutral-600">
          <span>20Hz</span>
          <span>1kHz</span>
          <span>20kHz</span>
        </div>
      </div>
      <div className="flex-1 bg-black/40 rounded border border-neutral-800 overflow-hidden relative">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          width={512}
          height={120}
        />
      </div>
    </div>
  );
}

