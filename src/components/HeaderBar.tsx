import React, { useState, useEffect, useRef } from "react";
import {
  Settings, ChevronDown, AlertCircle, FilePlus, Save, FileAudio,
  Undo2, Redo2, RotateCcw, ZapOff, Download, Music, Activity,
  ChevronUp, Piano as PianoIcon,
} from "lucide-react";
import { NOTE_NAMES } from "../lib/constants";
import { HeaderIOMeters } from "./AudioMeters";
import type { Notification } from "../hooks/useNotifications";

interface Props {
  projectKey: string;
  activeState: "A" | "B";
  workspaceMode: "ideas" | "arranger";
  cpuPct: number;
  ramStr: string;
  isAutoSaving: boolean;
  lastSavedAt: Date | null;
  activeTab: string;
  undoStack: unknown[];
  redoStack: unknown[];
  bSnapshotRef: React.MutableRefObject<{ pattern: boolean[][]; bpm: number } | null>;
  analyserNode: AnalyserNode | null;
  onSetProjectKey: (key: string) => void;
  onSetActiveState: (s: "A" | "B") => void;
  onSetWorkspaceMode: (mode: "ideas" | "arranger") => void;
  onSetActiveTab: (tab: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onPanic: () => void;
  onExport: () => void;
  onNewProject: () => void;
  onSave: () => void;
  onCopyAToB: () => void;
}

export function HeaderBar({
  projectKey, activeState, workspaceMode, cpuPct, ramStr,
  isAutoSaving, lastSavedAt, activeTab, undoStack, redoStack,
  bSnapshotRef, analyserNode,
  onSetProjectKey, onSetActiveState, onSetWorkspaceMode, onSetActiveTab,
  onUndo, onRedo, onPanic, onExport, onNewProject, onSave, onCopyAToB,
}: Props) {
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [showEditMenu, setShowEditMenu] = useState(false);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const editMenuRef = useRef<HTMLDivElement>(null);
  const keys = NOTE_NAMES;

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (fileMenuRef.current && !fileMenuRef.current.contains(e.target as Node)) setShowFileMenu(false);
      if (editMenuRef.current && !editMenuRef.current.contains(e.target as Node)) setShowEditMenu(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <div className="h-10 bg-bg-surface border-b border-border-main flex items-center px-4 justify-between shrink-0 relative edge-glow-bottom">
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-2 mr-1">
          <div
            className="relative w-7 h-7 flex items-center justify-center rounded-md border border-brand/30 overflow-hidden shadow-[0_0_10px_var(--brand-primary-glow)]"
            style={{ background: "linear-gradient(135deg, rgba(var(--brand-primary-rgb, 255,199,44), 0.15), rgba(var(--brand-primary-rgb, 255,199,44), 0.04))" }}
          >
            <span className="text-[11px] font-black text-brand select-none leading-none" style={{ textShadow: "0 0 8px var(--brand-primary-glow)" }}>T</span>
          </div>
          <h1 className="text-[13px] font-black tracking-[0.18em] text-neutral-100 uppercase select-none">
            TBM<span className="text-brand" style={{ textShadow: "0 0 10px var(--brand-primary-glow)" }}>_</span>
          </h1>
        </div>
        <div className="h-4 w-px bg-border-main"></div>
        <div className="relative" ref={fileMenuRef}>
          <button onClick={() => { setShowFileMenu((v) => !v); setShowEditMenu(false); }}
            className="text-[11px] font-bold uppercase tracking-widest text-neutral-500 hover:text-neutral-200 flex items-center gap-1 transition-colors px-1"
          >File <ChevronDown size={8} /></button>
          {showFileMenu && (
            <div className="absolute left-0 top-full mt-1 w-44 bg-bg-surface border border-border-main rounded-xl shadow-2xl z-50 p-1 flex flex-col gap-0.5">
              <button onClick={() => { setShowFileMenu(false); onNewProject(); }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-left text-[13px] text-neutral-300 hover:bg-bg-main/70 menu-item-glow transition-colors"
              ><FilePlus size={12} className="text-neutral-500" /> New Project</button>
              <button onClick={() => { setShowFileMenu(false); onSave(); }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-left text-[13px] text-neutral-300 hover:bg-bg-main/70 menu-item-glow transition-colors"
              ><Save size={12} className="text-neutral-500" /> Save .tbm</button>
              <button onClick={() => { setShowFileMenu(false); onExport(); }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-left text-[13px] text-neutral-300 hover:bg-bg-main/70 menu-item-glow transition-colors"
              ><FileAudio size={12} className="text-neutral-500" /> Export WAV…</button>
            </div>
          )}
        </div>
        <div className="relative" ref={editMenuRef}>
          <button onClick={() => { setShowEditMenu((v) => !v); setShowFileMenu(false); }}
            className="text-[11px] font-bold uppercase tracking-widest text-neutral-500 hover:text-neutral-200 flex items-center gap-1 transition-colors px-1"
          >Edit <ChevronDown size={8} /></button>
          {showEditMenu && (
            <div className="absolute left-0 top-full mt-1 w-44 bg-bg-surface border border-border-main rounded-xl shadow-2xl z-50 p-1 flex flex-col gap-0.5">
              <button onClick={() => { setShowEditMenu(false); onUndo(); }} disabled={undoStack.length === 0}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-left text-[13px] text-neutral-300 hover:bg-bg-main/70 menu-item-glow disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              ><Undo2 size={12} className="text-neutral-500" /> Undo <span className="ml-auto text-neutral-600">Ctrl+Z</span></button>
              <button onClick={() => { setShowEditMenu(false); onRedo(); }} disabled={redoStack.length === 0}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-left text-[13px] text-neutral-300 hover:bg-bg-main/70 menu-item-glow disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              ><Redo2 size={12} className="text-neutral-500" /> Redo <span className="ml-auto text-neutral-600">Ctrl+Y</span></button>
              <div className="h-px bg-border-main my-0.5" />
              <button onClick={() => { setShowEditMenu(false); onSetActiveTab("settings"); }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-left text-[13px] text-neutral-300 hover:bg-bg-main/70 menu-item-glow transition-colors"
              ><Settings size={12} className="text-neutral-500" /> Preferences</button>
            </div>
          )}
        </div>
        <div className="h-4 w-px bg-border-main"></div>
        <div className="flex items-center gap-0.5">
          <button onClick={onUndo} disabled={undoStack.length === 0}
            className={`p-1 rounded transition-all ${undoStack.length > 0 ? "text-neutral-400 hover:text-neutral-200 hover:bg-bg-main/80" : "text-neutral-700 cursor-not-allowed"}`}
            title={`Undo${undoStack.length > 0 ? ` (${undoStack.length})` : ""} · Ctrl+Z`}
          ><Undo2 size={12} /></button>
          <button onClick={onRedo} disabled={redoStack.length === 0}
            className={`p-1 rounded transition-all ${redoStack.length > 0 ? "text-neutral-400 hover:text-neutral-200 hover:bg-bg-main/80" : "text-neutral-700 cursor-not-allowed"}`}
            title={`Redo${redoStack.length > 0 ? ` (${redoStack.length})` : ""} · Ctrl+Y`}
          ><Redo2 size={12} /></button>
        </div>
        <div className="h-4 w-px bg-border-main"></div>
        <div className="flex items-center gap-1.5 bg-bg-main/60 rounded-md px-2 py-0.5 border border-border-main group hover:border-brand/50 transition-all cursor-pointer">
          <Music size={9} className="text-brand" />
          <select value={projectKey} onChange={(e) => onSetProjectKey(e.target.value)}
            className="bg-transparent text-[11px] font-bold text-brand outline-none appearance-none cursor-pointer"
          >
            {keys.map((k) => (
              <React.Fragment key={k}>
                <option value={`${k}`}>{k} Maj</option>
                <option value={`${k}m`}>{k} Min</option>
              </React.Fragment>
            ))}
          </select>
          <ChevronDown size={8} className="text-neutral-600 group-hover:text-brand transition-colors" />
        </div>
        <div className="flex items-center gap-0.5 bg-bg-main/60 rounded-md px-1 py-0.5 border border-border-main">
          <button onClick={() => onSetActiveState("A")}
            className={`px-1.5 py-0.5 rounded text-[11px] font-bold transition-all ${activeState === "A" ? "bg-brand text-white shadow-sm" : "text-neutral-500 hover:text-neutral-300"}`}
          >A</button>
          <button onClick={() => onSetActiveState("B")}
            className={`px-1.5 py-0.5 rounded text-[11px] font-bold transition-all ${activeState === "B" ? "bg-brand text-white shadow-sm" : "text-neutral-500 hover:text-neutral-300"}`}
          >B</button>
          <button onClick={onCopyAToB} className="ml-0.5 p-0.5 text-neutral-600 hover:text-neutral-300 transition-colors" title="Copy A to B">
            <RotateCcw size={9} />
          </button>
        </div>
        <div className="h-4 w-px bg-border-main"></div>
        <HeaderIOMeters analyserNode={analyserNode} />
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-0.5 bg-bg-main/60 rounded-md px-1 py-0.5 border border-border-main">
          <button onClick={() => onSetWorkspaceMode("ideas")}
            className={`px-1.5 py-0.5 rounded text-[11px] font-bold transition-all ${workspaceMode === "ideas" ? "bg-brand text-white shadow-sm" : "text-neutral-500 hover:text-neutral-300"}`}
          >Ideas</button>
          <button onClick={() => onSetWorkspaceMode("arranger")}
            className={`px-1.5 py-0.5 rounded text-[11px] font-bold transition-all ${workspaceMode === "arranger" ? "bg-brand text-white shadow-sm" : "text-neutral-500 hover:text-neutral-300"}`}
          >Arranger</button>
        </div>
        <div className="h-4 w-px bg-border-main"></div>
        <div className={`flex items-center gap-1.5 transition-all duration-500 ${isAutoSaving ? "opacity-100" : "opacity-25"}`}>
          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isAutoSaving ? "bg-indicator animate-pulse" : "bg-neutral-500"}`} />
          <span className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider">
            {isAutoSaving ? "Saving…" : lastSavedAt ? `${lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Auto-Save"}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono">
          <span className="flex items-center gap-1 text-indicator" title="Frame budget usage (% of 10 ms target)">
            <Activity size={9} /> {cpuPct.toFixed(0)}%
          </span>
          <span className="text-blue-400">{ramStr}</span>
        </div>
        <div className="h-4 w-px bg-border-main"></div>
        <button onClick={onPanic}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-bg-main/60 hover:bg-red-950/60 text-neutral-500 hover:text-red-400 transition-all border border-border-main hover:border-red-800/60 hover:shadow-[0_0_12px_rgba(239,68,68,0.15)] text-[11px] font-bold uppercase tracking-wider"
          title="Panic – Kill all audio"
        ><ZapOff size={12} /> Panic</button>
        <button onClick={onExport}
          className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider bg-brand hover:opacity-90 active:scale-95 text-white px-3 py-1 rounded-md shadow-lg shadow-brand/20 hover:shadow-brand/30 transition-all"
        ><Download size={12} /> Export</button>
        <button onClick={() => onSetActiveTab("settings")}
          className={`p-1.5 rounded-md transition-all ${activeTab === "settings" ? "bg-brand/15 text-white glow-brand" : "text-neutral-500 hover:text-neutral-300 border border-border-main"}`}
          title="Settings"
        ><Settings size={14} /></button>
      </div>
    </div>
  );
}
