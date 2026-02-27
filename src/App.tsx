/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { WaveformVisualizer } from './components/WaveformVisualizer';
import { Mixer808 } from './components/Mixer808';
import { FXMacros } from './components/FXMacros';
import { ChordBuilder } from './components/ChordBuilder';
import { MiniMixer } from './components/MiniMixer';
import { VirtualKeyboard } from './components/VirtualKeyboard';
import { Sidebar } from './components/Sidebar';
import { SettingsView } from './components/SettingsView';
import { DrumMachine } from './components/DrumMachine';
import { ModMatrix } from './components/ModMatrix';
import { SpectrumAnalyzer } from './components/SpectrumAnalyzer';
import { HatSequencer } from './components/HatSequencer';
import { KontaktBrowser } from './components/KontaktBrowser';
import { VSTManager } from './components/VSTManager';
import { ThemeSettings } from './components/ThemeSettings';
import { PianoRoll } from './components/PianoRoll';
import { SessionMusician } from './components/SessionMusician';
import { VinylScratchPro } from './components/VinylScratchPro';
import { StemSeparator } from './components/StemSeparator';
import { 
  Download, X, Settings, Save, FileAudio, FileMusic, 
  ChevronDown, AlertCircle, CheckCircle2, Undo2, Redo2, 
  RotateCcw, ZapOff, Activity, Info, BarChart3, Music, Cpu, Palette
} from 'lucide-react';

const AUTO_SAVE_KEY = 'tbm_autosave_state';
const AUTO_SAVE_INTERVAL_MS = 15000;
const KNOWN_TABS = ['sampler', 'pianoroll', 'session', 'library', 'plugins', 'theme', 'drums', 'hats', 'chords', 'mod', 'mixer', 'vinyl', 'stems', 'settings'] as const;

type ProjectSnapshot = { key: string; abState: 'A' | 'B' };

export default function App() {
  const [showExportModal, setShowExportModal] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState('sampler');
  const [isPanic, setIsPanic] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  // ── Undoable project snapshot (key + A/B state) ──
  const [snapshot, setSnapshot] = useState<ProjectSnapshot>({ key: 'Cm', abState: 'A' });
  const [undoStack, setUndoStack] = useState<ProjectSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<ProjectSnapshot[]>([]);

  const projectKey = snapshot.key;
  const activeState = snapshot.abState;

  const pushSnapshot = useCallback((next: ProjectSnapshot) => {
    setUndoStack(prev => [...prev, snapshot].slice(-50));
    setRedoStack([]);
    setSnapshot(next);
  }, [snapshot]);

  const setProjectKey = (k: string) => pushSnapshot({ ...snapshot, key: k });
  const setActiveState = (s: 'A' | 'B') => pushSnapshot({ ...snapshot, abState: s });

  const handleUndo = useCallback(() => {
    setUndoStack(prev => {
      if (prev.length === 0) return prev;
      const top = prev[prev.length - 1];
      setRedoStack(r => [snapshot, ...r].slice(0, 50));
      setSnapshot(top);
      return prev.slice(0, -1);
    });
  }, [snapshot]);

  const handleRedo = useCallback(() => {
    setRedoStack(prev => {
      if (prev.length === 0) return prev;
      const top = prev[0];
      setUndoStack(u => [...u, snapshot].slice(-50));
      setSnapshot(top);
      return prev.slice(1);
    });
  }, [snapshot]);

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Auto-save: load on mount ──
  useEffect(() => {
    try {
      const saved = localStorage.getItem(AUTO_SAVE_KEY);
      if (saved) {
        const { tab, key, state } = JSON.parse(saved) as Record<string, unknown>;
        if (typeof tab === 'string' && (KNOWN_TABS as readonly string[]).includes(tab)) setActiveTab(tab);
        const k = typeof key === 'string' && key.length > 0 ? key : 'Cm';
        const s: 'A' | 'B' = (state === 'A' || state === 'B') ? state : 'A';
        setSnapshot({ key: k, abState: s });
        const ts = localStorage.getItem(AUTO_SAVE_KEY + '_ts');
        if (ts) setLastSavedAt(new Date(ts));
      }
    } catch { /* ignore corrupt data */ }
  }, []);

  // ── Auto-save: persist on interval ──
  const performAutoSave = useCallback(() => {
    try {
      const autoSavePayload = { tab: activeTab, key: projectKey, state: activeState };
      localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(autoSavePayload));
      const now = new Date();
      localStorage.setItem(AUTO_SAVE_KEY + '_ts', now.toISOString());
      setLastSavedAt(now);
      setIsAutoSaving(true);
      if (autoSaveTimerRef.current !== null) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(() => setIsAutoSaving(false), 1500);
    } catch { /* storage unavailable */ }
  }, [activeTab, projectKey, activeState]);

  useEffect(() => {
    const interval = setInterval(performAutoSave, AUTO_SAVE_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      if (autoSaveTimerRef.current !== null) clearTimeout(autoSaveTimerRef.current);
    };
  }, [performAutoSave]);

  // ── Keyboard shortcuts: Ctrl+Z undo, Ctrl+Y / Ctrl+Shift+Z redo ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      if ((e.key === 'y') || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); handleRedo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleUndo, handleRedo]);

  const handlePanic = () => {
    setIsPanic(true);
    showNotification('error', 'AUDIO ENGINE RESET (PANIC)');
    setTimeout(() => setIsPanic(false), 1000);
  };

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'sampler':
        return (
          <div className="flex-1 flex overflow-hidden min-h-0">
            <div className="flex-1 flex flex-col border-r border-border-main min-w-0">
              <div className="h-[52%] border-b border-border-main bg-bg-main/30 p-5">
                <WaveformVisualizer />
              </div>
              <div className="flex-1 flex overflow-hidden min-h-0">
                <div className="w-1/2 border-r border-border-main p-5">
                  <Mixer808 />
                </div>
                <div className="w-1/2 p-5">
                  <FXMacros />
                </div>
              </div>
            </div>
            <div className="w-[280px] flex-shrink-0 p-5 bg-bg-main/20 overflow-y-auto custom-scrollbar">
              <MiniMixer />
            </div>
          </div>
        );
      case 'library':
        return (
          <div className="flex-1 p-5 overflow-hidden">
            <KontaktBrowser />
          </div>
        );
      case 'plugins':
        return (
          <div className="flex-1 p-5 overflow-hidden">
            <VSTManager />
          </div>
        );
      case 'theme':
        return (
          <div className="flex-1 p-5 overflow-hidden">
            <ThemeSettings />
          </div>
        );
      case 'drums':
        return (
          <div className="flex-1 p-5 overflow-hidden">
            <DrumMachine />
          </div>
        );
      case 'hats':
        return (
          <div className="flex-1 p-5 overflow-hidden">
            <HatSequencer />
          </div>
        );
      case 'chords':
        return (
          <div className="flex-1 p-5 overflow-y-auto custom-scrollbar">
            <ChordBuilder />
          </div>
        );
      case 'mod':
        return (
          <div className="flex-1 p-5 overflow-y-auto custom-scrollbar">
            <ModMatrix />
          </div>
        );
      case 'mixer':
        return (
          <div className="flex-1 p-5 flex flex-col gap-6 overflow-hidden">
            <div className="flex-1 flex justify-center items-center min-h-0">
              <div className="w-full max-w-4xl bg-bg-surface/60 glass p-10 rounded-2xl border border-border-main panel-inset">
                <MiniMixer />
                <div className="mt-10 pt-10 border-t border-border-main flex justify-center gap-12">
                  <div className="flex flex-col items-center gap-4">
                    <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Master Limiter</span>
                    <div className="w-2 h-24 bg-neutral-900 rounded-full relative">
                      <div className="absolute bottom-0 w-full h-1/2 bg-red-500 rounded-full shadow-[0_0_10px_rgba(239,68,68,0.5)]"></div>
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-4">
                    <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Stereo Width</span>
                    <div className="w-2 h-24 bg-neutral-900 rounded-full relative">
                      <div className="absolute bottom-0 w-full h-3/4 bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-4">
                    <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Phase Correlation</span>
                    <div className="w-48 h-2 bg-neutral-900 rounded-full relative overflow-hidden">
                      <div className="absolute inset-0 flex justify-between px-1 text-[8px] font-mono text-neutral-600 -top-4">
                        <span>-1</span><span>0</span><span>+1</span>
                      </div>
                      <div className="absolute left-1/2 -translate-x-1/2 w-1 h-full bg-neutral-700 z-10"></div>
                      <div className="absolute left-[70%] w-2 h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                    </div>
                    <span className="text-[10px] font-mono text-neutral-600 uppercase">Mono Compatible</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="h-40 bg-bg-main/60 rounded-xl border border-border-main p-4 flex-shrink-0">
              <SpectrumAnalyzer />
            </div>
          </div>
        );
      case 'pianoroll':
        return (
          <div className="flex-1 p-5 overflow-hidden">
            <PianoRoll />
          </div>
        );
      case 'session':
        return (
          <div className="flex-1 p-5 overflow-y-auto custom-scrollbar">
            <SessionMusician />
          </div>
        );
      case 'vinyl':
        return (
          <div className="flex-1 p-5 overflow-hidden">
            <VinylScratchPro />
          </div>
        );
      case 'stems':
        return (
          <div className="flex-1 p-5 overflow-hidden">
            <StemSeparator />
          </div>
        );
      case 'settings':
        return (
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <SettingsView />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`h-full flex flex-col bg-bg-main font-sans text-text-main overflow-hidden transition-all duration-300 ${isPanic ? 'opacity-60 grayscale' : ''}`}>

      {/* ── Utility / Menu Bar ────────────────────────────────────────── */}
      <div className="h-8 bg-bg-surface border-b border-border-main flex items-center px-4 justify-between flex-shrink-0 panel-inset">
        <div className="flex items-center gap-3">
          {/* Menu items */}
          <button className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 hover:text-neutral-200 flex items-center gap-1 transition-colors px-1">
            File <ChevronDown size={9} />
          </button>
          <button className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 hover:text-neutral-200 flex items-center gap-1 transition-colors px-1">
            Edit <ChevronDown size={9} />
          </button>

          <div className="h-3.5 w-px bg-border-main mx-1"></div>

          {/* Undo / Redo */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              className={`p-1.5 rounded transition-all ${undoStack.length > 0 ? 'text-neutral-400 hover:text-neutral-200 hover:bg-bg-main/80' : 'text-neutral-700 cursor-not-allowed'}`}
              title={`Undo${undoStack.length > 0 ? ` (${undoStack.length})` : ''} · Ctrl+Z`}
            >
              <Undo2 size={11} />
            </button>
            <button
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              className={`p-1.5 rounded transition-all ${redoStack.length > 0 ? 'text-neutral-400 hover:text-neutral-200 hover:bg-bg-main/80' : 'text-neutral-700 cursor-not-allowed'}`}
              title={`Redo${redoStack.length > 0 ? ` (${redoStack.length})` : ''} · Ctrl+Y`}
            >
              <Redo2 size={11} />
            </button>
          </div>

          <div className="h-3.5 w-px bg-border-main mx-1"></div>

          {/* Key selector */}
          <div className="flex items-center gap-1.5 bg-bg-main/60 rounded-md px-2 py-0.5 border border-border-main group hover:border-brand/50 transition-all cursor-pointer">
            <Music size={9} className="text-brand" />
            <select 
              value={projectKey}
              onChange={(e) => setProjectKey(e.target.value)}
              className="bg-transparent text-[10px] font-bold text-brand outline-none appearance-none cursor-pointer"
            >
              {keys.map(k => (
                <React.Fragment key={k}>
                  <option value={`${k}`}>{k} Maj</option>
                  <option value={`${k}m`}>{k} Min</option>
                </React.Fragment>
              ))}
            </select>
            <ChevronDown size={8} className="text-neutral-600 group-hover:text-brand transition-colors" />
          </div>

          <div className="h-3.5 w-px bg-border-main mx-1"></div>

          {/* A/B State */}
          <div className="flex items-center gap-0.5 bg-bg-main/60 rounded-md px-1 py-0.5 border border-border-main">
            <button 
              onClick={() => setActiveState('A')}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${activeState === 'A' ? 'bg-brand text-white shadow-sm' : 'text-neutral-500 hover:text-neutral-300'}`}
            >A</button>
            <button 
              onClick={() => setActiveState('B')}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${activeState === 'B' ? 'bg-brand text-white shadow-sm' : 'text-neutral-500 hover:text-neutral-300'}`}
            >B</button>
            <button className="ml-0.5 p-1 text-neutral-600 hover:text-neutral-300 transition-colors" title="Copy A to B">
              <RotateCcw size={9} />
            </button>
          </div>
        </div>

        {/* Right side of utility bar */}
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-1.5 transition-all duration-500 ${isAutoSaving ? 'opacity-100' : 'opacity-25'}`}>
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isAutoSaving ? 'bg-indicator animate-pulse' : 'bg-neutral-500'}`}></div>
            <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider">
              {isAutoSaving ? 'Auto-Saving…' : lastSavedAt ? `Saved ${lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Auto-Save'}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-mono">
            <span className="flex items-center gap-1 text-indicator"><Activity size={9} /> 12%</span>
            <span className="text-blue-400">1.2 GB</span>
          </div>
        </div>
      </div>

      {/* ── Title / Header Bar ────────────────────────────────────────── */}
      <div className="h-[52px] bg-bg-surface border-b border-border-main flex items-center px-5 justify-between flex-shrink-0">
        {/* Branding */}
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-3">
            {/* Logo placeholder */}
            <div className="relative w-9 h-9 flex items-center justify-center rounded-lg border border-brand/30 bg-brand/10 overflow-hidden">
              <span className="text-[8px] font-mono text-brand/50 uppercase select-none">Logo</span>
            </div>
            <h1 className="text-[15px] font-black tracking-[0.22em] text-neutral-100 uppercase select-none">
              TBM<span className="text-brand">_</span>1.0
            </h1>
          </div>

          <div className="h-5 w-px bg-border-main"></div>

          {/* I/O meters */}
          <div className="flex items-center gap-4 bg-bg-main/50 px-3 py-1.5 rounded-lg border border-border-main">
            {[{ label: 'In', pct: '45%', color: 'bg-emerald-500' }, { label: 'Out', pct: '65%', color: 'bg-emerald-500' }].map(m => (
              <div key={m.label} className="flex flex-col gap-1">
                <span className="text-[8px] font-bold font-mono text-neutral-500 uppercase leading-none">{m.label}</span>
                <div className="w-20 h-1 bg-neutral-800/80 rounded-full overflow-hidden">
                  <div className={`h-full ${m.color} rounded-full`} style={{ width: m.pct }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button 
            onClick={handlePanic}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-main/60 hover:bg-red-950/60 text-neutral-500 hover:text-red-400 transition-all border border-border-main hover:border-red-800/60 text-[10px] font-bold uppercase tracking-wider"
            title="Panic – Kill all audio"
          >
            <ZapOff size={13} /> Panic
          </button>

          <button 
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider bg-brand hover:opacity-90 active:scale-95 text-white px-4 py-1.5 rounded-lg shadow-lg shadow-brand/20 transition-all"
          >
            <Download size={13} />
            Build VST3
          </button>

          <div className="h-5 w-px bg-border-main"></div>

          <button 
            onClick={() => setActiveTab('settings')}
            className={`p-2 rounded-lg transition-all ${activeTab === 'settings' ? 'bg-brand/15 text-brand glow-brand' : 'bg-bg-main/60 text-neutral-500 hover:text-neutral-300 border border-border-main'}`}
            title="Settings"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      {/* ── Main Area ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
        {renderContent()}
      </div>

      {/* ── Virtual Keyboard ──────────────────────────────────────────── */}
      <div className="h-[96px] bg-bg-main border-t border-border-main px-3 py-2 flex-shrink-0">
        <VirtualKeyboard />
      </div>

      {/* ── Status / Info Bar ─────────────────────────────────────────── */}
      <div className="h-6 bg-bg-surface border-t border-border-main flex items-center px-4 gap-2 flex-shrink-0">
        <Info size={9} className="text-neutral-600" />
        <span className="text-[9px] font-mono text-neutral-600 uppercase tracking-wider">
          Hover a control for details · Audio Engine: ASIO v2.0 @ 44.1 kHz · 24-bit
        </span>
      </div>

      {/* ── Notifications ─────────────────────────────────────────────── */}
      {notification && (
        <div className="absolute bottom-24 right-6 z-[100] animate-in slide-in-from-right-8">
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-sm ${
            notification.type === 'success' 
              ? 'bg-emerald-950/90 border-emerald-700/60 text-emerald-300' 
              : 'bg-red-950/90 border-red-700/60 text-red-300'
          }`}>
            {notification.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span className="text-[11px] font-bold uppercase tracking-widest">{notification.message}</span>
          </div>
        </div>
      )}

      {/* ── Export Modal ──────────────────────────────────────────────── */}
      {showExportModal && (
        <div className="absolute inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-8">
          <div className="bg-bg-surface border border-border-main rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] panel-inset">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border-main bg-bg-main/40">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-brand/15 border border-brand/30 flex items-center justify-center">
                  <Download size={15} className="text-brand" />
                </div>
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-200">Export & Deploy</h2>
                  <p className="text-[10px] text-neutral-500 font-mono uppercase">Build VST3 · Standalone · Electron</p>
                </div>
              </div>
              <button onClick={() => setShowExportModal(false)} className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-bg-main/60 transition-all">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar text-sm text-neutral-300 space-y-6">
              <p className="text-neutral-400 text-[13px] leading-relaxed">
                This environment is a web-based sandbox — we cannot directly compile C++ VST3 binaries or launch native desktop windows here. However, your React UI is perfectly structured to be wrapped into both!
              </p>

              {/* Option 1 */}
              <div className="bg-bg-main/50 rounded-xl border border-border-main p-5 space-y-3">
                <h3 className="text-white font-bold flex items-center gap-2.5 text-[13px]">
                  <div className="w-5 h-5 rounded-md bg-blue-500/20 border border-blue-500/40 flex items-center justify-center">
                    <span className="text-blue-400 text-[10px] font-black">1</span>
                  </div>
                  Standalone Desktop App (Electron)
                </h3>
                <p className="text-neutral-400 text-[12px]">An <code className="text-blue-300 bg-blue-950/30 px-1 rounded">electron-main.js</code> file is ready in your workspace:</p>
                <ol className="list-decimal list-inside space-y-1.5 text-neutral-400 ml-2 font-mono text-[11px]">
                  <li>Download this project to your local machine.</li>
                  <li><code className="text-blue-300 bg-blue-950/30 px-1 rounded">npm install electron --save-dev</code></li>
                  <li><code className="text-blue-300 bg-blue-950/30 px-1 rounded">npx electron electron-main.js</code></li>
                </ol>
              </div>

              {/* Option 2 */}
              <div className="bg-bg-main/50 rounded-xl border border-border-main p-5 space-y-3">
                <h3 className="text-white font-bold flex items-center gap-2.5 text-[13px]">
                  <div className="w-5 h-5 rounded-md bg-brand/20 border border-brand/40 flex items-center justify-center">
                    <span className="text-brand text-[10px] font-black">2</span>
                  </div>
                  VST3 / AU Plugin (C++ Framework)
                </h3>
                <p className="text-neutral-400 text-[12px]">To compile into a VST3 plugin for your DAW, use a C++ framework with a Web View wrapper.</p>
                <ul className="space-y-1.5 text-neutral-400 text-[12px]">
                  <li><span className="text-white font-bold">DSP Engine (C++):</span> Handles audio processing and MIDI routing.</li>
                  <li><span className="text-white font-bold">Frontend (React):</span> This UI you're viewing now.</li>
                  <li><span className="text-white font-bold">Bridge:</span> The framework's <code className="text-brand bg-brand/10 px-1 rounded">WebBrowserComponent</code> passes JSON between React and C++.</li>
                </ul>
                <p className="text-neutral-500 text-[11px]">
                  See <code className="text-neutral-300">VST3_INTEGRATION.md</code> for the full C++ boilerplate.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
