import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Knob } from './Knob';
import { Save, Upload, Download, Play, RotateCcw, Plus, X, ChevronRight } from 'lucide-react';

export interface MacroSnapshot {
  id: string;
  name: string;
  values: number[];
}

interface MacroControlsProps {
  onMacroChange: (index: number, value: number) => void;
  snapshots: MacroSnapshot[];
  onSaveSnapshot: (name: string) => void;
  onLoadSnapshot: (id: string) => void;
  onMorphToSnapshot: (id: string, duration: number) => void;
}

const MACRO_LABELS = ['Macro 1', 'Macro 2', 'Macro 3', 'Macro 4', 'Macro 5', 'Macro 6', 'Macro 7', 'Macro 8'];

export const MacroControls: React.FC<MacroControlsProps> = ({
  onMacroChange,
  snapshots,
  onSaveSnapshot,
  onLoadSnapshot,
  onMorphToSnapshot,
}) => {
  const [values, setValues] = useState<number[]>(Array(8).fill(0.5));
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const [morphDuration, setMorphDuration] = useState(2);
  const [isMorphing, setIsMorphing] = useState(false);
  const [morphProgress, setMorphProgress] = useState(0);
  const morphRafRef = useRef<number | null>(null);

  const handleKnobChange = useCallback((index: number, val: number) => {
    const normalized = val / 100;
    setValues(prev => {
      const next = [...prev];
      next[index] = normalized;
      return next;
    });
    onMacroChange(index, normalized);
  }, [onMacroChange]);

  const handleSave = useCallback(() => {
    if (saveName.trim()) {
      onSaveSnapshot(saveName.trim());
      setSaveName('');
      setSaveDialogOpen(false);
    }
  }, [saveName, onSaveSnapshot]);

  const handleLoad = useCallback((id: string) => {
    setSelectedSnapshotId(id);
    onLoadSnapshot(id);
  }, [onLoadSnapshot]);

  const handleMorph = useCallback(() => {
    if (!selectedSnapshotId) return;
    setIsMorphing(true);
    setMorphProgress(0);
    onMorphToSnapshot(selectedSnapshotId, morphDuration);
  }, [selectedSnapshotId, morphDuration, onMorphToSnapshot]);

  useEffect(() => {
    return () => {
      if (morphRafRef.current !== null) cancelAnimationFrame(morphRafRef.current);
    };
  }, []);

  return (
    <div className="h-full flex flex-col p-6 gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-200">Macro Controls</h2>
          <p className="text-[11px] font-mono text-neutral-500 mt-0.5">8 assignable macro knobs</p>
        </div>
        <button
          onClick={() => setSaveDialogOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand/15 border border-brand/30 text-brand text-[11px] font-bold uppercase tracking-wider hover:bg-brand/25 transition-all"
        >
          <Save size={12} /> Save Snapshot
        </button>
      </div>

      <div className="grid grid-cols-4 gap-6 justify-items-center">
        {values.map((val, idx) => (
          <Knob
            key={idx}
            label={MACRO_LABELS[idx]}
            value={Math.round(val * 100)}
            onChange={(v) => handleKnobChange(idx, v)}
            color={['#4C83FF', '#FF6B6B', '#51CF66', '#FFD43B', '#CC5DE8', '#20C997', '#FF922B', '#748FFC'][idx]}
          />
        ))}
      </div>

      {saveDialogOpen && (
        <div className="bg-bg-main/80 border border-border-main rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">Save Current Values</span>
            <button onClick={() => setSaveDialogOpen(false)} className="text-neutral-600 hover:text-neutral-300">
              <X size={14} />
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Snapshot name..."
              className="flex-1 bg-bg-main border border-border-main rounded-lg px-3 py-1.5 text-sm font-mono text-neutral-200 outline-none focus:border-brand/60"
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              autoFocus
            />
            <button
              onClick={handleSave}
              disabled={!saveName.trim()}
              className="px-4 py-1.5 rounded-lg bg-brand text-white text-xs font-bold uppercase tracking-wider hover:opacity-90 disabled:opacity-40 transition-all"
            >
              Save
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">Snapshots</span>
          {snapshots.length > 0 && (
            <span className="text-[10px] font-mono text-neutral-600">{snapshots.length} saved</span>
          )}
        </div>
        <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
          {snapshots.length === 0 ? (
            <p className="text-[13px] text-neutral-600 italic">No snapshots saved yet</p>
          ) : (
            snapshots.map((snap) => (
              <button
                key={snap.id}
                onClick={() => handleLoad(snap.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-[13px] transition-all ${
                  selectedSnapshotId === snap.id
                    ? 'bg-brand/10 border border-brand/30 text-brand'
                    : 'bg-bg-main/50 border border-transparent text-neutral-400 hover:text-neutral-200 hover:border-neutral-700'
                }`}
              >
                <ChevronRight size={12} className="shrink-0" />
                <span className="font-bold uppercase tracking-wider">{snap.name}</span>
                <span className="ml-auto font-mono text-[10px] text-neutral-600">
                  {snap.values.map(v => Math.round(v * 100)).join(' | ')}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="border-t border-border-main pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">Morph to Snapshot</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-neutral-600">{morphDuration.toFixed(1)}s</span>
            <input
              type="range"
              min={0.5}
              max={10}
              step={0.5}
              value={morphDuration}
              onChange={(e) => setMorphDuration(Number(e.target.value))}
              className="w-20 h-1 accent-brand"
            />
          </div>
        </div>
        {isMorphing && (
          <div className="w-full bg-neutral-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full bg-brand rounded-full transition-all duration-100"
              style={{ width: `${morphProgress * 100}%` }}
            />
          </div>
        )}
        <button
          onClick={handleMorph}
          disabled={!selectedSnapshotId || isMorphing}
          className="w-full py-2 rounded-xl bg-brand/15 border border-brand/30 text-brand text-xs font-bold uppercase tracking-wider hover:bg-brand/25 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
        >
          <Play size={12} /> Morph {morphDuration}s → {snapshots.find(s => s.id === selectedSnapshotId)?.name ?? '?'}
        </button>
      </div>
    </div>
  );
};
