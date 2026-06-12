import React, { useState, useCallback, useEffect, useRef } from "react";
import { Volume2, Mic2, Music, ChevronDown, ChevronUp } from "lucide-react";
import { useTBMAudio } from "../contexts/TBMAudioContext";
import { Knob } from "./Knob";

interface ChannelProps {
  label: string;
  icon: React.ReactNode;
  color: string;
  onVolumeChange?: (vol: number) => void;
  onMuteChange?: (muted: boolean) => void;
  onSoloChange?: (solo: boolean) => void;
  onPanChange?: (pan: number) => void;
}

const Channel = React.memo(function Channel({
  label,
  icon,
  color,
  onVolumeChange,
  onMuteChange,
  onSoloChange,
  onPanChange,
}: ChannelProps) {
  const [vol, setVol] = useState(75);
  const [pan, setPan] = useState(0); // -50 to +50 for display; send as -1..+1
  const [isMuted, setIsMuted] = useState(false);
  const [isSolo, setIsSolo] = useState(false);

  const handleVolChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = parseInt(e.target.value);
      setVol(v);
      onVolumeChange?.(v / 100);
    },
    [onVolumeChange],
  );

  const handleMuteToggle = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      onMuteChange?.(next);
      return next;
    });
  }, [onMuteChange]);

  const handleSoloToggle = useCallback(() => {
    setIsSolo((prev) => {
      const next = !prev;
      onSoloChange?.(next);
      return next;
    });
  }, [onSoloChange]);

  // Pan knob drag: click+drag vertically to adjust pan
  const panDragRef = useRef<{ startY: number; startPan: number } | null>(null);
  // MiniMixer 4.1: track active listeners so they can be removed on unmount
  const panListenersRef = useRef<{ move: (e: MouseEvent) => void; up: () => void } | null>(null);

  // Cleanup pan drag listeners on unmount
  useEffect(() => {
    return () => {
      if (panListenersRef.current) {
        window.removeEventListener("mousemove", panListenersRef.current.move);
        window.removeEventListener("mouseup", panListenersRef.current.up);
        panListenersRef.current = null;
      }
    };
  }, []);

  const handlePanMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      panDragRef.current = { startY: e.clientY, startPan: pan };

      const onMouseMove = (ev: MouseEvent) => {
        if (!panDragRef.current) return;
        const delta = (panDragRef.current.startY - ev.clientY) * 0.5;
        const newPan = Math.max(
          -50,
          Math.min(50, panDragRef.current.startPan + delta),
        );
        setPan(newPan);
        // Convert -50..+50 to -1..+1
        onPanChange?.(newPan / 50);
      };
      const onMouseUp = () => {
        panDragRef.current = null;
        panListenersRef.current = null;
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };
      panListenersRef.current = { move: onMouseMove, up: onMouseUp };
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [pan, onPanChange],
  );

  return (
    <div className="flex flex-col items-center gap-2 w-16 group">
      {/* Pan Knob (Mini) */}
      <div
        className="relative w-8 h-8 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center cursor-ns-resize"
        onMouseDown={handlePanMouseDown}
        title={`Pan: ${pan > 0 ? "R" : pan < 0 ? "L" : "C"}${Math.abs(Math.round(pan))}`}
      >
        <div
          className="w-0.5 h-3 bg-neutral-400 absolute top-0.5 rounded-full"
          style={{
            transform: `rotate(${pan * 1.5}deg)`,
            transformOrigin: "bottom center",
          }}
        ></div>
        <span className="text-xs font-mono text-neutral-500 absolute -top-4">
          PAN
        </span>
      </div>

      {/* Fader Track */}
      <div className="relative w-6 h-32 bg-neutral-950 rounded-sm border border-neutral-800 flex justify-center py-2">
        <div className="absolute inset-0 flex flex-col justify-between px-1 py-4 pointer-events-none">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="w-full h-px bg-neutral-800"></div>
          ))}
        </div>
        <input
          type="range"
          min="0"
          max="100"
          step={1}
          value={vol}
          aria-label="Volume"
          onChange={handleVolChange}
          className="appearance-none w-32 h-6 bg-transparent cursor-pointer -rotate-90 absolute top-1/2 -translate-y-1/2 accent-white"
          style={{ width: "110px" }}
        />
        {/* Fader Cap (Visual) */}
        <div
          className="absolute w-5 h-8 bg-neutral-200 rounded-sm shadow-md pointer-events-none flex flex-col items-center justify-center gap-0.5"
          style={{ bottom: `${vol * 0.8 + 10}px`, willChange: "bottom" }}
        >
          <div className="w-3 h-px bg-neutral-400"></div>
          <div className="w-3 h-px bg-neutral-400"></div>
        </div>
      </div>

      {/* M/S Buttons */}
      <div className="flex gap-1">
        <button
          onClick={handleMuteToggle}
          className={`w-5 h-5 rounded-sm text-[13px] font-bold flex items-center justify-center transition-colors ${
            isMuted
              ? "bg-red-600 text-white"
              : "bg-neutral-800 text-neutral-500 hover:bg-neutral-700"
          }`}
        >
          M
        </button>
        <button
          onClick={handleSoloToggle}
          className={`w-5 h-5 rounded-sm text-[13px] font-bold flex items-center justify-center transition-colors ${
            isSolo
              ? "bg-yellow-500 text-black"
              : "bg-neutral-800 text-neutral-500 hover:bg-neutral-700"
          }`}
        >
          S
        </button>
      </div>

      <div className="flex flex-col items-center">
        <div className="p-1 rounded bg-neutral-800 mb-1" style={{ color }}>
          {icon}
        </div>
        <span className="text-xs font-mono text-neutral-500 uppercase tracking-tighter">
          {label}
        </span>
      </div>
    </div>
  );
});

export const MiniMixer = React.memo(function MiniMixer() {
  const {
    engine,
    setDeckVolume,
    setDJMasterVolume,
    djEngine: _djEngine,
    getEngineAnalyser,
  } = useTBMAudio();

  const [inGain, setInGain] = useState(0);
  const [outGain, setOutGain] = useState(0);
  const [isDraggingInGain, setIsDraggingInGain] = useState(false);
  const [isDraggingOutGain, setIsDraggingOutGain] = useState(false);

  // MPC-style sample parameters
  const [showSampleParams, setShowSampleParams] = useState(true);
  const [attack, setAttack] = useState(0);
  const [decay, setDecay] = useState(30);
  const [sustain, setSustain] = useState(80);
  const [release, setRelease] = useState(25);
  const [tune, setTune] = useState(50);       // 50 = center (0 semitones)
  const [filterCutoff, setFilterCutoff] = useState(100);
  const [filterRes, setFilterRes] = useState(0);
  const [velocitySens, setVelocitySens] = useState(75);
  const [layerMode, setLayerMode] = useState<'velocity' | 'round-robin' | 'random'>('velocity');

  // RMS / LUFS meter state
  const rmsMeterRef = useRef<HTMLDivElement>(null);
  const lufsMeterRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  // 400ms sliding window for LUFS approx (at 60fps ≈ 24 frames)
  const lufsWindowRef = useRef<number[]>([]);

  // ── rAF meter loop ──
  useEffect(() => {
    const analyser = getEngineAnalyser();
    if (!analyser) return;

    const bufferLength = analyser.fftSize;
    const dataArray = new Float32Array(bufferLength);

    const tick = () => {
      analyser.getFloatTimeDomainData(dataArray);

      // RMS
      let sumSq = 0;
      for (let i = 0; i < bufferLength; i++)
        sumSq += dataArray[i] * dataArray[i];
      const rms = Math.sqrt(sumSq / bufferLength);
      const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -100;
      const rmsH = Math.max(0, Math.min(100, ((rmsDb + 60) / 60) * 100));
      if (rmsMeterRef.current) {
        rmsMeterRef.current.style.height = `${rmsH}%`;
      }

      // LUFS approx — 400ms window
      const meanSq = sumSq / bufferLength;
      lufsWindowRef.current.push(meanSq);
      if (lufsWindowRef.current.length > 24) lufsWindowRef.current.shift();
      const windowMean =
        lufsWindowRef.current.reduce((a, b) => a + b, 0) /
        lufsWindowRef.current.length;
      const lufsDb =
        windowMean > 0 ? 10 * Math.log10(windowMean) - 0.691 : -100;
      const lufsH = Math.max(0, Math.min(100, ((lufsDb + 60) / 60) * 100));
      if (lufsMeterRef.current) {
        lufsMeterRef.current.style.height = `${lufsH}%`;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [getEngineAnalyser]);

   // Keep refs to the current fader positions so mute can restore them
  const deckAVolumeRef = useRef(0.75);
  const deckBVolumeRef = useRef(0.68);
  // MiniMixer 4.5/4.6: store normalized (0–1) value, not the raw 0–100 fader value.
  // Previously the fader value (0-100) was stored here, then divided by 100 again in
  // handleChordsMute and the solo effect — resulting in the channel being inaudible
  // (volume was e.g. 0.65/100 = 0.0065).
  const chordsVolumeRef = useRef(0.65); // normalized 0..1

  // Track per-channel mute state so the solo-bus effect can respect it when
  // solos are cleared (audit fix: previously all channels were restored to fader
  // volume on unsolo, ignoring mute — a muted channel would become audible).
  const deckAMutedRef = useRef(false);
  const deckBMutedRef = useRef(false);
  const chordsMutedRef = useRef(false);

  // Solo bus state
  const [soloedChannels, setSoloedChannels] = useState<Set<string>>(new Set());

  // Channel volume callbacks → deck volumes
  const handleDeckAVolume = useCallback(
    (vol: number) => {
      deckAVolumeRef.current = vol;
      setDeckVolume("A", vol);
    },
    [setDeckVolume],
  );

  const handleDeckBVolume = useCallback(
    (vol: number) => {
      deckBVolumeRef.current = vol;
      setDeckVolume("B", vol);
    },
    [setDeckVolume],
  );

  // Chords channel → pad index 2 (third pad) or synth engine
  const handleChordsVolume = useCallback(
    (vol: number) => {
      // MiniMixer 4.5/4.6: vol is already normalized to 0–1 by Channel's handleVolChange
      // (it divides by 100). Store it as-is so mute/solo can restore without double division.
      chordsVolumeRef.current = vol;
      engine?.setPadVolume(2, vol);
    },
    [engine],
  );

  // Mute handlers — set volume to 0 when muted, restore user's fader position when unmuted.
  // When another channel is soloed this channel is already silenced by the solo-bus useEffect;
  // skip the mute toggle so it doesn't fight the solo-bus restore on unmute.
  const handleDeckAMute = useCallback(
    (muted: boolean) => {
      deckAMutedRef.current = muted;
      if (soloedChannels.size > 0 && !soloedChannels.has("chops")) return;
      setDeckVolume("A", muted ? 0 : deckAVolumeRef.current);
    },
    [setDeckVolume, soloedChannels],
  );

  const handleDeckBMute = useCallback(
    (muted: boolean) => {
      deckBMutedRef.current = muted;
      if (soloedChannels.size > 0 && !soloedChannels.has("808")) return;
      setDeckVolume("B", muted ? 0 : deckBVolumeRef.current);
    },
    [setDeckVolume, soloedChannels],
  );

  const handleChordsMute = useCallback(
    (muted: boolean) => {
      chordsMutedRef.current = muted;
      if (soloedChannels.size > 0 && !soloedChannels.has("chords")) return;
      // MiniMixer 4.5/4.6: chordsVolumeRef is already normalized (0–1)
      engine?.setPadVolume(2, muted ? 0 : chordsVolumeRef.current);
    },
    [engine, soloedChannels],
  );

  // Solo bus handler
  const handleSoloChange = useCallback((channelId: string, solo: boolean) => {
    setSoloedChannels((prev) => {
      const newSet = new Set(prev);
      if (solo) {
        newSet.add(channelId);
      } else {
        newSet.delete(channelId);
      }
      return newSet;
    });
  }, []);

  // Apply solo bus logic to all channels
  useEffect(() => {
    const hasSolo = soloedChannels.size > 0;

    // Deck A (chops)
    if (hasSolo) {
      const shouldPlay = soloedChannels.has("chops");
      setDeckVolume("A", shouldPlay ? deckAVolumeRef.current : 0);
    } else {
      // Restore based on mute state — a muted channel must stay at 0
      setDeckVolume("A", deckAMutedRef.current ? 0 : deckAVolumeRef.current);
    }

    // Deck B (808)
    if (hasSolo) {
      const shouldPlay = soloedChannels.has("808");
      setDeckVolume("B", shouldPlay ? deckBVolumeRef.current : 0);
    } else {
      setDeckVolume("B", deckBMutedRef.current ? 0 : deckBVolumeRef.current);
    }

    // Chords channel
    if (hasSolo) {
      const shouldPlay = soloedChannels.has("chords");
      // MiniMixer 4.5/4.6: chordsVolumeRef is already normalized (0–1)
      engine?.setPadVolume(2, shouldPlay ? chordsVolumeRef.current : 0);
    } else {
      engine?.setPadVolume(2, chordsMutedRef.current ? 0 : chordsVolumeRef.current);
    }
  }, [soloedChannels, setDeckVolume, engine]);

  // Pan change → engine.setPadPan (track index = channel index)
  const handleChopsPan = useCallback(
    (pan: number) => {
      // Chops channel → pad index 0
      engine?.setPadPan(0, pan);
    },
    [engine],
  );

  const handle808Pan = useCallback(
    (pan: number) => {
      // 808 channel → pad index 1
      engine?.setPadPan(1, pan);
    },
    [engine],
  );

  const handleChordsPan = useCallback(
    (pan: number) => {
      // Chords channel → pad index 2
      engine?.setPadPan(2, pan);
    },
    [engine],
  );

  // Mouse drag handlers for IN/OUT GAIN knobs
  // MiniMixer 4.2: track listeners via ref so they can be removed on unmount
  const inGainListenersRef = useRef<{ move: (e: MouseEvent) => void; up: () => void } | null>(null);
  const outGainListenersRef = useRef<{ move: (e: MouseEvent) => void; up: () => void } | null>(null);

  useEffect(() => {
    return () => {
      if (inGainListenersRef.current) {
        document.removeEventListener("mousemove", inGainListenersRef.current.move);
        document.removeEventListener("mouseup", inGainListenersRef.current.up);
        inGainListenersRef.current = null;
      }
      if (outGainListenersRef.current) {
        document.removeEventListener("mousemove", outGainListenersRef.current.move);
        document.removeEventListener("mouseup", outGainListenersRef.current.up);
        outGainListenersRef.current = null;
      }
    };
  }, []);

  const handleInGainMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDraggingInGain(true);

      const startY = e.clientY;
      const startValue = inGain;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaY = startY - moveEvent.clientY;
        const newValue = Math.max(-24, Math.min(12, startValue + deltaY));
        setInGain(newValue);
      };

      const handleMouseUp = () => {
        setIsDraggingInGain(false);
        inGainListenersRef.current = null;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      inGainListenersRef.current = { move: handleMouseMove, up: handleMouseUp };
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [inGain],
  );

  const handleOutGainMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDraggingOutGain(true);

      const startY = e.clientY;
      const startValue = outGain;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaY = startY - moveEvent.clientY;
        const newValue = Math.max(-24, Math.min(12, startValue + deltaY));
        setOutGain(newValue);
      };

      const handleMouseUp = () => {
        setIsDraggingOutGain(false);
        outGainListenersRef.current = null;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      outGainListenersRef.current = { move: handleMouseMove, up: handleMouseUp };
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [outGain],
  );

  // Master out gain → DJ master volume
  useEffect(() => {
    const linearGain = Math.max(0, Math.min(1, (outGain + 24) / 36));
    setDJMasterVolume(linearGain);
  }, [outGain, setDJMasterVolume]);

  return (
    <div className="h-full flex flex-col bg-neutral-950/50 rounded-xl border border-neutral-800/60 p-3">
      {/* Header bar — mixing board label */}
      <div className="flex justify-between items-center mb-3 pb-2 border-b border-neutral-800/50">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]"></div>
          <h2 className="text-sm font-black text-neutral-400 uppercase tracking-widest">
            Channel Strip
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-neutral-900 border border-neutral-800">
            <div
              className={`w-1.5 h-1.5 rounded-full ${soloedChannels.size > 0 ? "bg-yellow-500 animate-pulse" : "bg-red-500"} shadow-[0_0_5px_rgba(239,68,68,0.5)]`}
            ></div>
            <span className="text-xs font-bold font-mono text-neutral-500 uppercase">
              {soloedChannels.size > 0
                ? `SOLO (${soloedChannels.size})`
                : "VCA Group 1"}
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs font-mono text-neutral-600">
            <span>48kHz</span>
            <span className="text-neutral-700">/</span>
            <span>24bit</span>
          </div>
        </div>
      </div>

      {/* Channel strips + Master */}
      <div className="flex-1 flex items-start gap-1">
        {/* Individual Channel Strips */}
        <div className="flex items-start gap-0.5 flex-1 justify-around">
          <Channel
            label="Chops"
            icon={<Volume2 size={12} />}
            color="#FF6B6B"
            onVolumeChange={handleDeckAVolume}
            onMuteChange={handleDeckAMute}
            onSoloChange={(solo) => handleSoloChange("chops", solo)}
            onPanChange={handleChopsPan}
          />
          <Channel
            label="808"
            icon={<Mic2 size={12} />}
            color="#4C83FF"
            onVolumeChange={handleDeckBVolume}
            onMuteChange={handleDeckBMute}
            onSoloChange={(solo) => handleSoloChange("808", solo)}
            onPanChange={handle808Pan}
          />
          <Channel
            label="Chords"
            icon={<Music size={12} />}
            color="#FFD700"
            onVolumeChange={handleChordsVolume}
            onMuteChange={handleChordsMute}
            onSoloChange={(solo) => handleSoloChange("chords", solo)}
            onPanChange={handleChordsPan}
          />
        </div>

        {/* Master Section Divider */}
        <div className="flex flex-col items-center self-stretch mx-1">
          <div className="w-px flex-1 bg-gradient-to-b from-transparent via-neutral-700 to-transparent"></div>
        </div>

        {/* ═══ MASTER CHANNEL ═══ */}
        <div className="flex flex-col items-center gap-2 px-3 py-2 bg-neutral-900/80 rounded-lg border border-neutral-800/60 min-w-[90px]">
          {/* Master label */}
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.6)]"></div>
            <span className="text-xs font-black text-neutral-400 uppercase tracking-widest">MST</span>
          </div>

          {/* IN/OUT Gain knobs row */}
          <div className="flex gap-3">
            {/* Input Gain */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-[7px] font-mono text-neutral-600 uppercase tracking-wider">IN</span>
              <div
                className={`relative w-9 h-9 rounded-full border-2 flex items-center justify-center cursor-ns-resize shadow-inner ${isDraggingInGain ? "bg-neutral-700 border-red-500/60 shadow-red-500/10" : "bg-neutral-800 border-neutral-700"}`}
                onMouseDown={handleInGainMouseDown}
                title={`Input Gain: ${inGain}dB`}
              >
                <div
                  className="w-0.5 h-3.5 bg-red-500 rounded-full"
                  style={{
                    transform: `rotate(${inGain * 4}deg)`,
                    transformOrigin: "bottom center",
                  }}
                ></div>
                {/* Knob detent markers */}
                <div className="absolute inset-0 rounded-full">
                  <div className="absolute top-0 left-1/2 w-px h-1 -translate-x-1/2 bg-neutral-700"></div>
                  <div className="absolute bottom-0 left-1/2 w-px h-1 -translate-x-1/2 bg-neutral-700"></div>
                  <div className="absolute top-1/2 left-0 w-1 h-px -translate-y-1/2 bg-neutral-700"></div>
                  <div className="absolute top-1/2 right-0 w-1 h-px -translate-y-1/2 bg-neutral-700"></div>
                </div>
              </div>
              <span className="text-[8px] font-mono text-neutral-500">{inGain > 0 ? '+' : ''}{inGain}dB</span>
            </div>

            {/* Output Gain */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-[7px] font-mono text-neutral-600 uppercase tracking-wider">OUT</span>
              <div
                className={`relative w-9 h-9 rounded-full border-2 flex items-center justify-center cursor-ns-resize shadow-inner ${isDraggingOutGain ? "bg-neutral-700 border-emerald-500/60 shadow-emerald-500/10" : "bg-neutral-800 border-neutral-700"}`}
                onMouseDown={handleOutGainMouseDown}
                title={`Output Gain: ${outGain}dB`}
              >
                <div
                  className="w-0.5 h-3.5 bg-emerald-500 rounded-full"
                  style={{
                    transform: `rotate(${outGain * 4}deg)`,
                    transformOrigin: "bottom center",
                  }}
                ></div>
                <div className="absolute inset-0 rounded-full">
                  <div className="absolute top-0 left-1/2 w-px h-1 -translate-x-1/2 bg-neutral-700"></div>
                  <div className="absolute bottom-0 left-1/2 w-px h-1 -translate-x-1/2 bg-neutral-700"></div>
                  <div className="absolute top-1/2 left-0 w-1 h-px -translate-y-1/2 bg-neutral-700"></div>
                  <div className="absolute top-1/2 right-0 w-1 h-px -translate-y-1/2 bg-neutral-700"></div>
                </div>
              </div>
              <span className="text-[8px] font-mono text-neutral-500">{outGain > 0 ? '+' : ''}{outGain}dB</span>
            </div>
          </div>

          {/* Meter bridge */}
          <div className="flex gap-2 mt-1 p-2 bg-neutral-950 rounded-md border border-neutral-800/60">
            {/* RMS meter */}
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[7px] font-mono text-neutral-600 uppercase tracking-wider">RMS</span>
              <div className="w-2.5 h-20 bg-neutral-900 rounded-sm relative overflow-hidden border border-neutral-800/40">
                {/* dB scale lines */}
                <div className="absolute inset-0 flex flex-col justify-between py-1 pointer-events-none">
                  {[0, 1, 2, 3, 4].map(i => (
                    <div key={i} className="w-full h-px bg-neutral-800/60"></div>
                  ))}
                </div>
                <div
                  ref={rmsMeterRef}
                  className="absolute bottom-0 w-full bg-gradient-to-t from-blue-600 via-blue-500 to-cyan-400 transition-none"
                  style={{ height: `0%` }}
                ></div>
              </div>
            </div>
            {/* LUFS meter */}
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[7px] font-mono text-neutral-600 uppercase tracking-wider">LUFS</span>
              <div className="w-2.5 h-20 bg-neutral-900 rounded-sm relative overflow-hidden border border-neutral-800/40">
                <div className="absolute inset-0 flex flex-col justify-between py-1 pointer-events-none">
                  {[0, 1, 2, 3, 4].map(i => (
                    <div key={i} className="w-full h-px bg-neutral-800/60"></div>
                  ))}
                </div>
                <div
                  ref={lufsMeterRef}
                  className="absolute bottom-0 w-full bg-gradient-to-t from-emerald-600 via-emerald-500 to-green-400 transition-none"
                  style={{ height: `0%` }}
                ></div>
              </div>
            </div>
            {/* dB scale labels */}
            <div className="flex flex-col justify-between text-[6px] font-mono text-neutral-700 py-1">
              <span>0</span>
              <span>-12</span>
              <span>-24</span>
              <span>-36</span>
              <span>-60</span>
            </div>
          </div>

          {/* Clip / Signal indicators */}
          <div className="flex gap-2 mt-1">
            <div className="flex flex-col items-center gap-0.5">
              <div className="w-3 h-3 rounded-full bg-neutral-900 border border-neutral-800 shadow-inner"></div>
              <span className="text-[6px] font-mono text-neutral-600 uppercase">CLIP</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <div className="w-3 h-3 rounded-full bg-emerald-900/60 border border-emerald-800/40 shadow-[0_0_4px_rgba(16,185,129,0.2)]"></div>
              <span className="text-[6px] font-mono text-neutral-600 uppercase">SIG</span>
            </div>
          </div>

          {/* Master label */}
          <div className="flex items-center gap-1 mt-1 pt-1 border-t border-neutral-800/50">
            <div className="w-1.5 h-5 bg-red-600 rounded-sm shadow-[0_0_8px_rgba(220,38,38,0.4)]"></div>
            <span className="text-xs font-bold font-mono text-neutral-400 uppercase tracking-wider">
              Master
            </span>
          </div>
        </div>
      </div>

      {/* ═══ MPC-STYLE SAMPLE PARAMETERS ═══ */}
      <div className="mt-2 pt-2 border-t border-neutral-800/50">
        <button
          onClick={() => setShowSampleParams(!showSampleParams)}
          className="flex items-center justify-between w-full mb-2 group"
        >
          <span className="text-xs font-black text-neutral-500 uppercase tracking-widest">Sample Params</span>
          {showSampleParams ? <ChevronUp size={12} className="text-neutral-600" /> : <ChevronDown size={12} className="text-neutral-600" />}
        </button>

        {showSampleParams && (
          <div className="flex flex-col gap-3">
            {/* ADSR Envelope */}
            <div className="bg-neutral-900/60 rounded-lg border border-neutral-800/50 p-2">
              <span className="text-[7px] font-bold font-mono text-neutral-600 uppercase tracking-widest block mb-1.5">ADSR Envelope</span>
              <div className="flex justify-between gap-1">
                <Knob label="ATK" value={attack} onChange={setAttack} color="#ef4444" />
                <Knob label="DEC" value={decay} onChange={setDecay} color="#f97316" />
                <Knob label="SUS" value={sustain} onChange={setSustain} color="#eab308" />
                <Knob label="REL" value={release} onChange={setRelease} color="#22c55e" />
              </div>
            </div>

            {/* Tune / Pitch */}
            <div className="bg-neutral-900/60 rounded-lg border border-neutral-800/50 p-2">
              <span className="text-[7px] font-bold font-mono text-neutral-600 uppercase tracking-widest block mb-1.5">Tune / Pitch</span>
              <div className="flex justify-center">
                <Knob label="TUNE" value={tune} onChange={setTune} color="#3b82f6" />
              </div>
              <div className="text-center mt-1">
                <span className="text-[8px] font-mono text-neutral-500">
                  {tune === 50 ? '0 st' : tune > 50 ? `+${Math.round((tune - 50) * 24 / 50)} st` : `${Math.round((tune - 50) * 24 / 50)} st`}
                </span>
              </div>
            </div>

            {/* Filter */}
            <div className="bg-neutral-900/60 rounded-lg border border-neutral-800/50 p-2">
              <span className="text-[7px] font-bold font-mono text-neutral-600 uppercase tracking-widest block mb-1.5">Filter</span>
              <div className="flex justify-around gap-1">
                <Knob label="CUTOFF" value={filterCutoff} onChange={setFilterCutoff} color="#a855f7" />
                <Knob label="RES" value={filterRes} onChange={setFilterRes} color="#ec4899" />
              </div>
            </div>

            {/* Velocity / Layer */}
            <div className="bg-neutral-900/60 rounded-lg border border-neutral-800/50 p-2">
              <span className="text-[7px] font-bold font-mono text-neutral-600 uppercase tracking-widest block mb-1.5">Velocity & Layers</span>
              <div className="flex justify-center mb-2">
                <Knob label="VEL" value={velocitySens} onChange={setVelocitySens} color="#06b6d4" />
              </div>
              <div className="flex gap-1">
                {(['velocity', 'round-robin', 'random'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setLayerMode(mode)}
                    className={`flex-1 text-[8px] font-bold font-mono uppercase py-1 rounded transition-colors ${
                      layerMode === mode
                        ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-600/40'
                        : 'bg-neutral-800 text-neutral-600 border border-neutral-700 hover:text-neutral-400'
                    }`}
                  >
                    {mode === 'round-robin' ? 'R-R' : mode === 'velocity' ? 'VEL' : 'RND'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
