import React from "react";
import {
  Clock,
  Activity,
  Repeat,
  Layers,
  Ban,
  Keyboard,
  Plus,
  Download,
  FileCode,
  Copy,
  ClipboardPaste,
  Trash2,
} from "lucide-react";

type NoteRepeatDivision = '1/4' | '1/8' | '1/16' | '1/32' | '1/8T' | '1/16T';
type SixteenLevelsParam = 'Velocity' | 'Tune' | 'Pan' | 'Filter';

interface DrumQuickActionsProps {
  preCount: boolean;
  setPreCount: (v: boolean | ((prev: boolean) => boolean)) => void;
  recordMode: "record" | "overdub";
  setRecordMode: (mode: "record" | "overdub") => void;
  globalSwing: number;
  setGlobalSwing: (v: number | ((prev: number) => number)) => void;
  quantizeStrength: number;
  setQuantizeStrength: (v: number | ((prev: number) => number)) => void;
  quantizeGrid: 4 | 8 | 16 | 32;
  setQuantizeGrid: (v: 4 | 8 | 16 | 32) => void;
  noteRepeat: boolean;
  setNoteRepeat: (v: boolean | ((prev: boolean) => boolean)) => void;
  noteRepeatDivision: NoteRepeatDivision;
  setNoteRepeatDivision: (v: NoteRepeatDivision) => void;
  noteRepeatCount: number;
  setNoteRepeatCount: (v: number | ((prev: number) => number)) => void;
  sixteenLevels: boolean;
  setSixteenLevels: (v: boolean | ((prev: boolean) => boolean)) => void;
  sixteenLevelsParam: SixteenLevelsParam;
  setSixteenLevelsParam: (v: SixteenLevelsParam) => void;
  padMuteMode: boolean;
  setPadMuteMode: (v: boolean | ((prev: boolean) => boolean)) => void;
  keyboardMode: boolean;
  setKeyboardMode: (v: boolean | ((prev: boolean) => boolean)) => void;
  stepCount: 16 | 32 | 64;
  setStepCount: (v: 16 | 32 | 64) => void;
  onQuantize: () => void;
  onCopyPattern: () => void;
  onPastePattern: () => void;
  onTrashPattern: () => void;
  onImportChop: () => void;
  hasCopiedPattern: boolean;
  xpmInputRef: React.RefObject<HTMLInputElement | null>;
  sxqInputRef: React.RefObject<HTMLInputElement | null>;
  stemImportRef: React.RefObject<HTMLInputElement | null>;
}

export function DrumQuickActions({
  preCount,
  setPreCount,
  recordMode,
  setRecordMode,
  globalSwing,
  setGlobalSwing,
  quantizeStrength,
  setQuantizeStrength,
  quantizeGrid,
  setQuantizeGrid,
  noteRepeat,
  setNoteRepeat,
  noteRepeatDivision,
  setNoteRepeatDivision,
  noteRepeatCount,
  setNoteRepeatCount,
  sixteenLevels,
  setSixteenLevels,
  sixteenLevelsParam,
  setSixteenLevelsParam,
  padMuteMode,
  setPadMuteMode,
  keyboardMode,
  setKeyboardMode,
  stepCount,
  setStepCount,
  onQuantize,
  onCopyPattern,
  onPastePattern,
  onTrashPattern,
  onImportChop,
  hasCopiedPattern,
  xpmInputRef,
  sxqInputRef,
  stemImportRef,
}: DrumQuickActionsProps) {
  return (
    <div className="flex justify-between items-center">
      <div className="flex items-center gap-4">
        <button
          onClick={() => setPreCount(!preCount)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-[13px] font-bold uppercase transition-all border ${
            preCount
              ? "bg-blue-600/20 text-blue-400 border-blue-500/50"
              : "bg-neutral-800 text-neutral-500 border-neutral-700"
          }`}
        >
          <Clock size={12} /> Pre-Count
        </button>

        {/* Record Mode: Record / Overdub */}
        <div className="flex items-center gap-1 bg-neutral-800 rounded border border-neutral-700 p-0.5">
          <button
            onClick={() => setRecordMode("record")}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold uppercase transition-all ${
              recordMode === "record"
                ? "bg-red-600 text-white shadow-sm"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
            Record
          </button>
          <button
            onClick={() => setRecordMode("overdub")}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold uppercase transition-all ${
              recordMode === "overdub"
                ? "bg-amber-600 text-white shadow-sm"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
            Overdub
          </button>
        </div>

        {/* Global Swing */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-neutral-600 uppercase">Swing</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={globalSwing}
            aria-label="Global Swing"
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (!Number.isNaN(n)) setGlobalSwing(n);
            }}
            className="w-24 h-1 bg-neutral-800 appearance-none accent-red-500"
          />
          <span className="text-[13px] font-mono text-neutral-400 min-w-10">{globalSwing}%</span>
        </div>

        {/* Quantize Controls */}
        <div className="flex items-center gap-2 border-l border-neutral-800 pl-3">
          <button
            onClick={onQuantize}
            disabled={quantizeStrength <= 0}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-bold uppercase bg-cyan-600/20 text-cyan-400 border border-cyan-500/40 hover:bg-cyan-600/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Activity size={11} /> Quantize
          </button>
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-mono text-neutral-600">Str</span>
            <input
              type="range"
              min={1}
              max={100}
              step={1}
              value={quantizeStrength}
              onChange={(e) => setQuantizeStrength(parseInt(e.target.value, 10))}
              className="w-16 h-1 bg-neutral-800 appearance-none accent-cyan-500"
            />
            <span className="text-[11px] font-mono text-neutral-400 w-6">{quantizeStrength}</span>
          </div>
          <div className="flex bg-neutral-800 rounded p-0.5 border border-neutral-700">
            {([4, 8, 16, 32] as const).map((g) => (
              <button
                key={g}
                onClick={() => setQuantizeGrid(g)}
                className={`px-1.5 py-0.5 text-[10px] font-bold rounded transition-all ${
                  quantizeGrid === g
                    ? "bg-cyan-600 text-white"
                    : "text-neutral-500 hover:text-neutral-300"
                }`}
              >
                1/{g}
              </button>
            ))}
          </div>
        </div>

        {/* Note Repeat */}
        <button
          onClick={() => setNoteRepeat(!noteRepeat)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-[13px] font-bold uppercase transition-all border ${
            noteRepeat
              ? "bg-purple-600/20 text-purple-400 border-purple-500/50"
              : "bg-neutral-800 text-neutral-500 border-neutral-700"
          }`}
        >
          <Repeat size={12} /> Note Repeat
        </button>
        {noteRepeat && (
          <>
            <select
              value={noteRepeatDivision}
              onChange={(e) => setNoteRepeatDivision(e.target.value as NoteRepeatDivision)}
              className="bg-neutral-800 border border-neutral-700 text-xs text-neutral-300 rounded px-1 py-1.5"
            >
              <option value="1/4">1/4</option>
              <option value="1/8">1/8</option>
              <option value="1/16">1/16</option>
              <option value="1/32">1/32</option>
              <option value="1/8T">1/8T</option>
              <option value="1/16T">1/16T</option>
            </select>
            <select
              value={noteRepeatCount}
              onChange={(e) => setNoteRepeatCount(Number(e.target.value))}
              className="bg-neutral-800 border border-neutral-700 text-xs text-neutral-300 rounded px-1 py-1.5"
            >
              <option value={0}>Hold</option>
              <option value={4}>4</option>
              <option value={8}>8</option>
              <option value={16}>16</option>
            </select>
          </>
        )}

        {/* 16 Levels */}
        <button
          onClick={() => setSixteenLevels(!sixteenLevels)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-[13px] font-bold uppercase transition-all border ${
            sixteenLevels
              ? "bg-orange-600/20 text-orange-400 border-orange-500/50"
              : "bg-neutral-800 text-neutral-500 border-neutral-700"
          }`}
        >
          <Layers size={12} /> 16 Levels
        </button>
        {sixteenLevels && (
          <select
            value={sixteenLevelsParam}
            onChange={(e) => setSixteenLevelsParam(e.target.value as SixteenLevelsParam)}
            className="bg-neutral-800 border border-neutral-700 text-xs text-neutral-300 rounded px-1 py-1.5"
          >
            <option value="Velocity">Vel</option>
            <option value="Tune">Tune</option>
            <option value="Pan">Pan</option>
            <option value="Filter">Filter</option>
          </select>
        )}

        {/* Pad Mute Mode */}
        <button
          onClick={() => setPadMuteMode(!padMuteMode)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-[13px] font-bold uppercase transition-all border ${
            padMuteMode
              ? "bg-red-600/20 text-red-400 border-red-500/50"
              : "bg-neutral-800 text-neutral-500 border-neutral-700"
          }`}
        >
          <Ban size={12} /> Mute
        </button>

        {/* Keyboard Mode */}
        <button
          onClick={() => setKeyboardMode(!keyboardMode)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-[13px] font-bold uppercase transition-all border ${
            keyboardMode
              ? "bg-emerald-600/20 text-emerald-400 border-emerald-500/50"
              : "bg-neutral-800 text-neutral-500 border-neutral-700"
          }`}
          title="QWERTY → Pads (Q/W/E/R, A/S/D/F, Z/X/C/V, T/Y/U/I)"
        >
          <Keyboard size={12} /> Keys
        </button>

        {/* Step Count */}
        <div className="flex items-center gap-1">
          {([16, 32, 64] as const).map((sc) => (
            <button
              key={sc}
              onClick={() => setStepCount(sc)}
              className={`px-2 py-1 text-[11px] font-bold border rounded ${
                stepCount === sc
                  ? "bg-brand border-brand text-white"
                  : "bg-neutral-800 border-neutral-700 text-neutral-500 hover:border-neutral-600"
              }`}
            >
              {sc}
            </button>
          ))}
        </div>
      </div>

      {/* Right side: pattern actions + load */}
      <div className="flex gap-2">
        <button onClick={onCopyPattern} className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 rounded text-xs font-bold uppercase transition-colors border border-neutral-700" title="Copy Pattern">
          <Copy size={12} />
        </button>
        <button onClick={onPastePattern} className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase transition-colors border ${hasCopiedPattern ? "bg-neutral-800 hover:bg-neutral-700 text-neutral-400 border-neutral-700" : "bg-neutral-800/50 text-neutral-600 border-neutral-800 cursor-not-allowed"}`} title="Paste Pattern" disabled={!hasCopiedPattern}>
          <ClipboardPaste size={12} />
        </button>
        <button onClick={onTrashPattern} className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 rounded text-xs font-bold uppercase transition-colors border border-neutral-700" title="Clear Pattern">
          <Trash2 size={12} />
        </button>
        <button onClick={onImportChop} className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 rounded text-xs font-bold uppercase transition-colors border border-neutral-700" title="Import Last Chop">
          <Download size={12} /> Chop
        </button>

        <div className="relative group">
          <button className="flex items-center gap-2 px-4 py-2 bg-brand hover:opacity-90 text-white rounded font-bold text-xs uppercase transition-colors shadow-lg shadow-brand/20">
            <Plus size={14} /> Load Kit
          </button>
          <div className="absolute right-0 top-full mt-2 w-48 bg-neutral-900 border border-neutral-800 rounded-lg shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 p-2 flex flex-col gap-1">
            <button
              onClick={() => xpmInputRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2 hover:bg-neutral-800 rounded text-[13px] text-neutral-300 transition-colors text-left"
            >
              <FileCode size={12} className="text-red-500" /> .XPM (Drum Program)
            </button>
            <button
              onClick={() => sxqInputRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2 hover:bg-neutral-800 rounded text-[13px] text-neutral-300 transition-colors text-left"
            >
              <FileCode size={12} className="text-blue-500" /> .SXQ (Drum Sequence)
            </button>
            <button
              onClick={() => stemImportRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2 hover:bg-neutral-800 rounded text-[13px] text-neutral-300 transition-colors text-left"
            >
              <FileCode size={12} className="text-green-500" /> Stem Program (.json)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
