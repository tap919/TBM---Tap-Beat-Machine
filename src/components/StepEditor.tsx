import React, { useState, useRef, useCallback, useEffect } from 'react';

export type StepParam = 'velocity' | 'pan' | 'pitch' | 'cutoff';

interface StepEditorProps {
  pattern: boolean[][];
  pads: any[];
  onUpdateStep: (padIndex: number, step: number, param: StepParam, value: number) => void;
  selectedPad: number;
  height?: number;
  currentStep?: number;
}

const DEFAULTS: Record<StepParam, number> = {
  velocity: 100,
  pan: 64,
  pitch: 0,
  cutoff: 127,
};

const MODES: StepParam[] = ['velocity', 'pan', 'pitch', 'cutoff'];
const MODE_LABELS: Record<StepParam, string> = {
  velocity: 'Velocity',
  pan: 'Pan',
  pitch: 'Pitch',
  cutoff: 'Cutoff',
};

const BAR_COLOR: Record<StepParam, string> = {
  velocity: 'bg-brand',
  pan: 'bg-cyan-500',
  pitch: 'bg-amber-500',
  cutoff: 'bg-violet-500',
};

const TABS_H = 20;
const STEP_NUM_H = 12;

export default function StepEditor({
  pattern,
  pads: _pads,
  onUpdateStep,
  selectedPad,
  height = 60,
  currentStep = -1,
}: StepEditorProps) {
  const [mode, setMode] = useState<StepParam>('velocity');
  const [latch, setLatch] = useState(false);
  const [values, setValues] = useState<Record<string, number>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ step: number } | null>(null);

  const barAreaH = height - TABS_H - STEP_NUM_H;

  const getVal = useCallback(
    (step: number, m: StepParam) => values[`${selectedPad}-${step}-${m}`] ?? DEFAULTS[m],
    [selectedPad, values],
  );

  const updateVal = useCallback(
    (step: number, m: StepParam, v: number) => {
      setValues(prev => ({ ...prev, [`${selectedPad}-${step}-${m}`]: v }));
    },
    [selectedPad],
  );

  const commit = useCallback(
    (step: number, m: StepParam) => {
      onUpdateStep(selectedPad, step, m, getVal(step, m));
    },
    [selectedPad, onUpdateStep, getVal],
  );

  const reset = useCallback(
    (step: number, m: StepParam) => {
      setValues(prev => {
        const next = { ...prev };
        delete next[`${selectedPad}-${step}-${m}`];
        return next;
      });
      onUpdateStep(selectedPad, step, m, DEFAULTS[m]);
    },
    [selectedPad, onUpdateStep],
  );

  const yToValue = useCallback(
    (clientY: number): number => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return DEFAULTS[mode];
      const ratio = 1 - Math.max(0, Math.min(1, (clientY - rect.top - TABS_H) / barAreaH));
      switch (mode) {
        case 'velocity':
        case 'cutoff':
          return Math.round(ratio * 127);
        case 'pan':
          return Math.round(ratio * 127);
        case 'pitch':
          return Math.round((ratio - 0.5) * 48);
      }
    },
    [mode, barAreaH],
  );

  useEffect(() => {
    if (!dragRef.current) return;
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      updateVal(dragRef.current.step, mode, yToValue(e.clientY));
    };
    const onUp = () => {
      if (dragRef.current) {
        commit(dragRef.current.step, mode);
        dragRef.current = null;
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [mode, commit, updateVal, yToValue]);

  return (
    <div ref={containerRef} className="bg-bg-surface border-t border-border-main select-none" style={{ height }}>
      <div className="flex items-center gap-1 px-2" style={{ height: TABS_H }}>
        {MODES.map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider transition-all ${
              mode === m ? 'bg-brand text-white' : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
        <button
          onClick={() => setLatch(!latch)}
          className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider transition-all ${
            latch ? 'bg-amber-600 text-white' : 'text-neutral-600 hover:text-neutral-400'
          }`}
        >
          Latch
        </button>
      </div>

      <div className="flex px-1 gap-px" style={{ height: barAreaH }}>
        {Array.from({ length: 16 }, (_, step) => {
          const val = getVal(step, mode);
          const active = pattern[selectedPad]?.[step];
          const current = currentStep === step;

          return (
            <div
              key={step}
              className="flex-1 flex flex-col cursor-pointer group"
              onMouseDown={e => {
                if (e.button === 2) { e.preventDefault(); reset(step, mode); return; }
                e.preventDefault();
                const v = yToValue(e.clientY);
                updateVal(step, mode, v);
                if (latch) commit(step, mode);
                else dragRef.current = { step };
              }}
            >
              <div className="flex-1 w-full relative">
                {(mode === 'pan' || mode === 'pitch') && (
                  <div className="absolute inset-x-0 top-1/2 h-px bg-neutral-700 pointer-events-none" />
                )}
                <div
                  className={`absolute inset-x-0.5 transition-all duration-75 ${
                    active ? BAR_COLOR[mode] : 'bg-neutral-700'
                  } ${current ? 'ring-1 ring-brand/70' : ''}`}
                  style={getBarStyle(val, mode)}
                />
              </div>
              <span
                className={`text-[9px] font-mono leading-none text-center mt-0.5 ${
                  current ? 'text-brand' : active ? 'text-neutral-400' : 'text-neutral-700'
                }`}
              >
                {step + 1}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getBarStyle(val: number, mode: StepParam): React.CSSProperties {
  switch (mode) {
    case 'velocity':
    case 'cutoff': {
      const pct = (val / 127) * 100;
      return { bottom: 0, height: `${pct}%`, borderRadius: '2px 2px 0 0' };
    }
    case 'pan': {
      const offset = val - 64;
      const mag = Math.abs(offset) / 64;
      const pct = Math.min(mag * 100, 100);
      if (offset >= 0) return { bottom: '50%', height: `${pct}%`, borderRadius: '2px 2px 0 0' };
      return { top: '50%', height: `${pct}%`, borderRadius: '0 0 2px 2px' };
    }
    case 'pitch': {
      const mag = Math.abs(val) / 24;
      const pct = Math.min(mag * 100, 100);
      if (val >= 0) return { bottom: '50%', height: `${pct}%`, borderRadius: '2px 2px 0 0' };
      return { top: '50%', height: `${pct}%`, borderRadius: '0 0 2px 2px' };
    }
  }
}
