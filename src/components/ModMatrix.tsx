import React, { useState, useCallback, useEffect, useRef } from "react";
import { Plus, Trash2, ArrowRight, Zap, Activity, Timer } from "lucide-react";
import { useTBMAudio } from "../contexts/TBMAudioContext";

interface ModRoute {
  id: string;
  source: string;
  target: string;
  amount: number;
  active: boolean;
}

// ── LFO shape generators (return -1 to 1) ──
function lfoSine(phase: number): number {
  return Math.sin(phase * Math.PI * 2);
}
function lfoSaw(phase: number): number {
  return 1 - 2 * (phase % 1);
}
function lfoTriangle(phase: number): number {
  const p = phase % 1;
  return p < 0.5 ? -1 + 4 * p : 3 - 4 * p;
}
function lfoSquare(phase: number): number {
  return phase % 1 < 0.5 ? 1 : -1;
}
function lfoSampleAndHold(phase: number): number {
  // Deterministic S&H: quantized phase drives a simple hash
  const step = Math.floor(phase * 8);
  // Simple LCG hash for deterministic but pseudo-random output
  const hash = ((step * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  return hash * 2 - 1;
}

type LfoShapeName = "sine" | "triangle" | "saw" | "square" | "sample-and-hold";

const LFO_SHAPE_FNS: Record<LfoShapeName, (phase: number) => number> = {
  sine: lfoSine,
  triangle: lfoTriangle,
  saw: lfoSaw,
  square: lfoSquare,
  "sample-and-hold": lfoSampleAndHold,
};

const LFO_SHAPE_LABELS: Record<LfoShapeName, string> = {
  sine: "Sine",
  triangle: "Triangle",
  saw: "Saw",
  square: "Square",
  "sample-and-hold": "S&H",
};

const LFO_SHAPES: LfoShapeName[] = [
  "sine",
  "triangle",
  "saw",
  "square",
  "sample-and-hold",
];

// SVG path for LFO visualizer from sampled points
function buildSvgPath(points: number[]): string {
  return points
    .map((y, i) => {
      const x = (i / (points.length - 1)) * 100;
      const sy = 20 - y * 19; // map -1..1 → 39..1, center at 20
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${sy.toFixed(1)}`;
    })
    .join(" ");
}

// ── Map target names to engine calls ──
type TargetApplier = (
  value: number,
  ctx: ReturnType<typeof useTBMAudio>,
) => void;

const TARGET_MAP: Record<string, TargetApplier> = {
  "Filter Cutoff": (v, ctx) => {
    const freqMax = 2000 + v * 4000;
    ctx.setDeckEffect("A", 0, "autowah", {
      freqMin: 200,
      freqMax: Math.max(200, freqMax),
      sensitivity: 0.7,
    });
  },
  Pitch: (v, ctx) => {
    const rate = Math.pow(2, (v * 12) / 12);
    ctx.setDeckPlaybackRate("A", rate);
  },
  Pan: (v, ctx) => {
    const eng = ctx.engine;
    if (eng?.setPadPan) eng.setPadPan(0, Math.max(-1, Math.min(1, v)));
  },
  Drive: (v, ctx) => {
    const drive = Math.max(0, (v + 1) * 2);
    ctx.setDeckEffect("A", 3, "distortion", { drive, tone: 0.6 });
    ctx.setDeckEffectEnabled("A", 3, drive > 0.1);
  },
  "Reverb Mix": (v, ctx) => {
    const wetDry = Math.max(0, Math.min(1, (v + 1) / 2));
    ctx.setDeckEffectWetDry("A", 1, wetDry);
  },
  "Sample Start": (v, ctx) => {
    const eng = ctx.engine;
    if (eng?.setPadStartOffset) {
      const offset = Math.max(0, Math.min(1, (v + 1) / 2));
      eng.setPadStartOffset(0, offset);
    }
  },
  Glide: (v, ctx) => {
    const delayMs = Math.max(10, 80 + v * 70);
    ctx.setDeckEffectParam("A", 1, "delayMs", delayMs);
  },
};

export const ModMatrix = React.memo(function ModMatrix() {
  const audioCtx = useTBMAudio();
  const {
    engine,
    midiAccess,
    setDeckEffect: _setDeckEffect,
    setDeckEffectEnabled: _setDeckEffectEnabled,
    setDeckEffectParam: _setDeckEffectParam,
    setDeckEffectWetDry: _setDeckEffectWetDry,
    setDeckPlaybackRate: _setDeckPlaybackRate,
  } = audioCtx;

  const [routes, setRoutes] = useState<ModRoute[]>([
    {
      id: "1",
      source: "LFO 1",
      target: "Filter Cutoff",
      amount: 45,
      active: true,
    },
    { id: "2", source: "Env 2", target: "Pitch", amount: -12, active: true },
    { id: "3", source: "Velocity", target: "Drive", amount: 30, active: false },
  ]);

  // LFO visualizer SVG paths
  const lfo1PathRef = useRef<SVGPathElement>(null);
  const lfo2PathRef = useRef<SVGPathElement>(null);

  // LFO shape state
  const [lfo1Shape, setLfo1Shape] = useState<LfoShapeName>("sine");
  const [lfo2Shape, setLfo2Shape] = useState<LfoShapeName>("saw");

  // ADSR parameters for Env 1 (0-1 range)
  const [envAttack, setEnvAttack] = useState(0.1);
  const [envDecay, setEnvDecay] = useState(0.2);
  const [envSustain, setEnvSustain] = useState(0.5);
  const [envRelease, setEnvRelease] = useState(0.3);

  // Env 1 & 2 values (computed from ADSR phase)
  const env1ValueRef = useRef(0);
  const env2ValueRef = useRef(0);
  const envPhaseRef = useRef(0);

  // Build reactive Env 1 SVG path from ADSR parameters
  const env1Path = React.useMemo(() => {
    const a = envAttack;
    const d = envDecay;
    const s = envSustain;
    const r = envRelease;
    const total = a + d + 0.3 + r; // 0.3 = sustain hold time
    const ax = (a / total) * 100;
    const dx = ax + (d / total) * 100;
    const sx = dx + (0.3 / total) * 100;
    const sY = 40 - s * 38; // map 0-1 to 40-2
    return `M 0 40 L ${ax.toFixed(1)} 2 L ${dx.toFixed(1)} ${sY.toFixed(1)} L ${sx.toFixed(1)} ${sY.toFixed(1)} L 100 40`;
  }, [envAttack, envDecay, envSustain, envRelease]);

  const sources = [
    "LFO 1",
    "LFO 2",
    "Env 1",
    "Env 2",
    "Velocity",
    "Aftertouch",
    "Mod Wheel",
  ];
  const targets = [
    "Filter Cutoff",
    "Pitch",
    "Pan",
    "Drive",
    "Reverb Mix",
    "Sample Start",
    "Glide",
  ];

  // MIDI dynamic source refs
  const aftertouchRef = useRef(0);
  const modWheelRef = useRef(0);

  // Subscribe to midiAccess for Aftertouch + ModWheel
  useEffect(() => {
    if (!midiAccess) return;
    const handleMsg = (e: Event) => {
      const msg = e as MIDIMessageEvent;
      const [status, num, val] = Array.from(msg.data ?? []);
      if ((status & 0xf0) === 0xd0) {
        // Channel pressure (aftertouch) — 2-byte message: [status, pressure].
        // `num` is the pressure byte; `val` is always undefined for this message type.
        aftertouchRef.current = (num ?? 0) / 127;
      } else if ((status & 0xf0) === 0xb0 && num === 1) {
        // CC #1 = Mod Wheel
        modWheelRef.current = val / 127;
      }
    };
    for (const input of (midiAccess as any).inputs.values()) {
      input.addEventListener("midimessage", handleMsg);
    }
    return () => {
      for (const input of (midiAccess as any).inputs.values()) {
        input.removeEventListener("midimessage", handleMsg);
      }
    };
  }, [midiAccess]);

  // ── Sync LFO shapes to engine ──
  useEffect(() => {
    if (!engine || !engine.setLfoShape) return;
    const engineShapeMap: Record<
      LfoShapeName,
      "sine" | "triangle" | "sawtooth" | "square"
    > = {
      sine: "sine",
      triangle: "triangle",
      saw: "sawtooth",
      square: "square",
      "sample-and-hold": "square", // closest native type; actual S&H runs in our own function
    };
    engine.setLfoShape(0, engineShapeMap[lfo1Shape]);
    engine.setLfoShape(1, engineShapeMap[lfo2Shape]);
  }, [engine, lfo1Shape, lfo2Shape]);

  const addRoute = useCallback(() => {
    const newRoute: ModRoute = {
      id: Math.random().toString(36).slice(2, 11),
      source: sources[0],
      target: targets[0],
      amount: 50,
      active: true,
    };
    setRoutes((prev) => [...prev, newRoute]);
  }, []);

  const removeRoute = useCallback((id: string) => {
    setRoutes((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const updateRoute = useCallback((id: string, updates: Partial<ModRoute>) => {
    setRoutes((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...updates } : r)),
    );
  }, []);

  // ── LFO modulation loop ──
  const lfo1ShapeRef = useRef(lfo1Shape);
  lfo1ShapeRef.current = lfo1Shape;
  const lfo2ShapeRef = useRef(lfo2Shape);
  lfo2ShapeRef.current = lfo2Shape;
  const envAttackRef = useRef(envAttack);
  envAttackRef.current = envAttack;
  const envDecayRef = useRef(envDecay);
  envDecayRef.current = envDecay;
  const envSustainRef = useRef(envSustain);
  envSustainRef.current = envSustain;
  const envReleaseRef = useRef(envRelease);
  envReleaseRef.current = envRelease;
  const routesRef = useRef(routes);
  routesRef.current = routes;
  const audioCtxRef = useRef(audioCtx);
  audioCtxRef.current = audioCtx;
  const rafRef = useRef<number>(0);
  const lfo1PhaseRef = useRef(0);
  const lfo2PhaseRef = useRef(0);
  const lastTimeRef = useRef(0);
  const hasActiveLFORef = useRef(false);

  // Update hasActiveLFORef when routes change
  useEffect(() => {
    hasActiveLFORef.current = routes.some(
      (r) =>
        r.active && ["LFO 1", "LFO 2", "Env 1", "Env 2"].includes(r.source),
    );

    // If no active LFO routes, stop the animation loop
    if (!hasActiveLFORef.current && rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    // If active LFO routes and no animation loop, start it
    else if (hasActiveLFORef.current && !rafRef.current) {
      lastTimeRef.current = 0;
      const startTick = () => {
        rafRef.current = requestAnimationFrame(tickRef.current);
      };
      rafRef.current = requestAnimationFrame(startTick);
    }
  }, [routes]);

  const tickRef = useRef<(time: number) => void>(() => {});
  
  const tick = useCallback((time: number) => {
    const dt =
      lastTimeRef.current > 0 ? (time - lastTimeRef.current) / 1000 : 0.016;
    lastTimeRef.current = time;

    // Prefer engine LFO phase if available, else maintain local phase
    const eng = (audioCtxRef.current as any).engine;
    if (eng?.getLfoPhase) {
      lfo1PhaseRef.current = eng.getLfoPhase(0);
      lfo2PhaseRef.current = eng.getLfoPhase(1);
    } else {
      lfo1PhaseRef.current = (lfo1PhaseRef.current + 0.8 * dt) % 1;
      lfo2PhaseRef.current = (lfo2PhaseRef.current + 1.5 * dt) % 1;
    }

    // Advance envelope phase (simple looping ADSR cycle)
    const envTotal =
      envAttackRef.current + envDecayRef.current + 0.3 + envReleaseRef.current;
    envPhaseRef.current = (envPhaseRef.current + dt) % envTotal;
    const ep = envPhaseRef.current;
    const a = envAttackRef.current;
    const d = envDecayRef.current;
    const s = envSustainRef.current;
    const r = envReleaseRef.current;
    let envVal: number;
    if (ep < a) {
      envVal = ep / a; // attack: 0→1
    } else if (ep < a + d) {
      envVal = 1 - (1 - s) * ((ep - a) / d); // decay: 1→sustain
    } else if (ep < a + d + 0.3) {
      envVal = s; // sustain hold
    } else {
      envVal = s * (1 - (ep - a - d - 0.3) / r); // release: sustain→0
    }
    env1ValueRef.current = Math.max(0, Math.min(1, envVal));
    // Env 2: faster cycle with inverted ADSR
    env2ValueRef.current = 1 - env1ValueRef.current;

    const currentRoutes = routesRef.current;
    const ctx = audioCtxRef.current;

    const lfo1ShapeFn = LFO_SHAPE_FNS[lfo1ShapeRef.current];
    const lfo2ShapeFn = LFO_SHAPE_FNS[lfo2ShapeRef.current];

    // Only process if we have active modulation routes
    if (hasActiveLFORef.current) {
      for (const route of currentRoutes) {
        if (!route.active) continue;

        let sourceValue = 0;
        if (route.source === "LFO 1") {
          sourceValue = lfo1ShapeFn(lfo1PhaseRef.current);
        } else if (route.source === "LFO 2") {
          sourceValue = lfo2ShapeFn(lfo2PhaseRef.current);
        } else if (route.source === "Env 1") {
          sourceValue = env1ValueRef.current * 2 - 1; // map 0-1 → -1..1
        } else if (route.source === "Env 2") {
          sourceValue = env2ValueRef.current * 2 - 1;
        } else if (route.source === "Aftertouch") {
          sourceValue = aftertouchRef.current * 2 - 1;
        } else if (route.source === "Mod Wheel") {
          sourceValue = modWheelRef.current * 2 - 1;
        } else if (route.source === "Velocity") {
          const velMap = (ctx as any).engine?.velocityMap as
            | Map<number, number>
            | undefined;
          const lastVel = velMap ? ([...velMap.values()].pop() ?? 0.8) : 0.8;
          sourceValue = lastVel * 2 - 1;
        } else {
          continue;
        }

        const scaledValue = sourceValue * (route.amount / 100);
        const applier = TARGET_MAP[route.target];
        if (applier) applier(scaledValue, ctx);
      }

      // Update LFO SVG paths every 4 frames (throttle) only when active
      if (Math.floor(time / 16) % 4 === 0) {
        const pts1 = Array.from({ length: 33 }, (_, i) =>
          lfo1ShapeFn((lfo1PhaseRef.current + i / 32) % 1),
        );
        const pts2 = Array.from({ length: 33 }, (_, i) =>
          lfo2ShapeFn((lfo2PhaseRef.current + i / 32) % 1),
        );
        if (lfo1PathRef.current)
          lfo1PathRef.current.setAttribute("d", buildSvgPath(pts1));
        if (lfo2PathRef.current)
          lfo2PathRef.current.setAttribute("d", buildSvgPath(pts2));
      }
    }

    // Only continue the loop if we have active LFO routes
    if (hasActiveLFORef.current) {
      rafRef.current = requestAnimationFrame(tickRef.current);
    } else {
      rafRef.current = 0;
    }
  }, []);

  // Store the latest tick function in the ref
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    tickRef.current = tick;
  }, [tick]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, []);

  // ── Apply static (non-LFO/non-Env) route changes when routes update ──
  useEffect(() => {
    for (const route of routes) {
      if (!route.active) continue;
      if (
        [
          "LFO 1",
          "LFO 2",
          "Env 1",
          "Env 2",
          "Aftertouch",
          "Mod Wheel",
          "Velocity",
        ].includes(route.source)
      )
        continue;
      const scaledValue = route.amount / 100;
      const applier = TARGET_MAP[route.target];
      if (applier) applier(scaledValue, audioCtx);
    }
  }, [routes, audioCtx]);

  return (
    <div className="h-full flex flex-col gap-6 p-2">
      <div className="flex justify-between items-center relative edge-glow-bottom pb-2">
        <div className="flex flex-col">
          <h2 className="text-sm font-bold text-neutral-200 uppercase tracking-widest flex items-center gap-2">
            <Zap className="text-red-500" size={16} /> Modulation Matrix
          </h2>
          <span className="text-[13px] text-neutral-500 uppercase font-mono">
            Route modulators to any parameter
          </span>
        </div>
        <button
          onClick={addRoute}
          className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded font-bold text-xs uppercase transition-all border border-neutral-700"
        >
          <Plus size={14} /> Add Route
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
        <div className="grid grid-cols-1 gap-2">
          {routes.map((route) => (
            <div
              key={route.id}
              className={`group flex items-center gap-4 p-3 rounded-lg border transition-all ${
                route.active
                  ? "bg-neutral-900 border-neutral-800"
                  : "bg-neutral-950 border-neutral-900 opacity-50"
              }`}
            >
              <div className="flex flex-col gap-1 w-32">
                <span className="text-xs font-mono text-neutral-600 uppercase">
                  Source
                </span>
                <select
                  value={route.source}
                  onChange={(e) =>
                    updateRoute(route.id, { source: e.target.value })
                  }
                  className="bg-neutral-950 border border-neutral-800 text-[13px] text-red-500 font-bold rounded px-2 py-1 outline-none"
                >
                  {sources.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>

              <ArrowRight className="text-neutral-700" size={14} />

              <div className="flex flex-col gap-1 w-32">
                <span className="text-xs font-mono text-neutral-600 uppercase">
                  Target
                </span>
                <select
                  value={route.target}
                  onChange={(e) =>
                    updateRoute(route.id, { target: e.target.value })
                  }
                  className="bg-neutral-950 border border-neutral-800 text-[13px] text-blue-400 font-bold rounded px-2 py-1 outline-none"
                >
                  {targets.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className="flex-1 flex flex-col gap-1">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-mono text-neutral-600 uppercase">
                    Amount
                  </span>
                  <span
                    className={`text-[13px] font-mono ${route.amount >= 0 ? "text-emerald-500" : "text-orange-500"}`}
                  >
                    {route.amount > 0 ? "+" : ""}
                    {route.amount}%
                  </span>
                </div>
                <input
                  type="range"
                  min="-100"
                  max="100"
                  step={1}
                  value={route.amount}
                  aria-label="Modulation Amount"
                  onChange={(e) =>
                    updateRoute(route.id, { amount: parseInt(e.target.value, 10) })
                  }
                  className="w-full h-1 bg-neutral-950 appearance-none accent-red-500 rounded-full"
                />
              </div>

              <div className="flex items-center gap-2 ml-4">
                <button
                  onClick={() =>
                    updateRoute(route.id, { active: !route.active })
                  }
                  className={`w-8 h-4 rounded-full relative transition-colors ${route.active ? "bg-red-600" : "bg-neutral-800"}`}
                >
                  <div
                    className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-all ${route.active ? "left-4.5" : "left-0.5"}`}
                  ></div>
                </button>
                <button
                  onClick={() => removeRoute(route.id)}
                  className="p-1.5 text-neutral-600 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modulator Visualizers */}
      <div className="grid grid-cols-3 gap-4 h-32 pt-3 border-t border-neutral-800 separator-glow">
        <div className="bg-neutral-950 rounded-lg border border-neutral-800 p-3 flex flex-col gap-2 vignette">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-1">
              <Activity size={10} className="text-emerald-500" /> LFO 1
            </span>
            <select
              value={lfo1Shape}
              onChange={(e) => setLfo1Shape(e.target.value as LfoShapeName)}
              className="bg-neutral-900 border border-neutral-700 text-xs font-mono text-neutral-400 rounded px-1 py-0.5 outline-none"
            >
              {LFO_SHAPES.map((s) => (
                <option key={s} value={s}>
                  {LFO_SHAPE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <svg className="w-full h-full" viewBox="0 0 100 40">
              <path
                ref={lfo1PathRef}
                d="M 0 20 Q 25 0 50 20 T 100 20"
                fill="none"
                stroke="#10b981"
                strokeWidth="2"
              />
            </svg>
          </div>
        </div>
        <div className="bg-neutral-950 rounded-lg border border-neutral-800 p-3 flex flex-col gap-2 vignette">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-1">
              <Activity size={10} className="text-blue-500" /> LFO 2
            </span>
            <select
              value={lfo2Shape}
              onChange={(e) => setLfo2Shape(e.target.value as LfoShapeName)}
              className="bg-neutral-900 border border-neutral-700 text-xs font-mono text-neutral-400 rounded px-1 py-0.5 outline-none"
            >
              {LFO_SHAPES.map((s) => (
                <option key={s} value={s}>
                  {LFO_SHAPE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <svg className="w-full h-full" viewBox="0 0 100 40">
              <path
                ref={lfo2PathRef}
                d="M 0 40 L 50 0 L 50 40 L 100 0"
                fill="none"
                stroke="#f43f5e"
                strokeWidth="2"
              />
            </svg>
          </div>
        </div>
        <div className="bg-neutral-950 rounded-lg border border-neutral-800 p-3 flex flex-col gap-1 vignette">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-1">
              <Timer size={10} className="text-red-500" /> Env 1
            </span>
            <span className="text-xs font-mono text-neutral-700">ADSR</span>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <svg className="w-full h-full" viewBox="0 0 100 40">
              <path d={env1Path} fill="none" stroke="#ef4444" strokeWidth="2" />
            </svg>
          </div>
          <div className="flex gap-1">
            <input
              type="range"
              min="0.01"
              max="1"
              step="0.01"
              value={envAttack}
              onChange={(e) => setEnvAttack(parseFloat(e.target.value))}
              className="flex-1 h-1 appearance-none accent-red-500 bg-neutral-800 rounded"
              title={`A: ${envAttack.toFixed(2)}`}
            />
            <input
              type="range"
              min="0.01"
              max="1"
              step="0.01"
              value={envDecay}
              onChange={(e) => setEnvDecay(parseFloat(e.target.value))}
              className="flex-1 h-1 appearance-none accent-red-500 bg-neutral-800 rounded"
              title={`D: ${envDecay.toFixed(2)}`}
            />
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={envSustain}
              onChange={(e) => setEnvSustain(parseFloat(e.target.value))}
              className="flex-1 h-1 appearance-none accent-red-500 bg-neutral-800 rounded"
              title={`S: ${envSustain.toFixed(2)}`}
            />
            <input
              type="range"
              min="0.01"
              max="1"
              step="0.01"
              value={envRelease}
              onChange={(e) => setEnvRelease(parseFloat(e.target.value))}
              className="flex-1 h-1 appearance-none accent-red-500 bg-neutral-800 rounded"
              title={`R: ${envRelease.toFixed(2)}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
});
