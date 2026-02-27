/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
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
import { 
  Download, X, Settings, Save, FileAudio, FileMusic, 
  ChevronDown, AlertCircle, CheckCircle2, Undo2, Redo2, 
  RotateCcw, ZapOff, Activity, Info, BarChart3, Music, Cpu, Palette
} from 'lucide-react';

export default function App() {
  const [showExportModal, setShowExportModal] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('sampler');
  const [projectKey, setProjectKey] = useState('Cm');
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const [activeState, setActiveState] = useState<'A' | 'B'>('A');
  const [isPanic, setIsPanic] = useState(false);

  // Simulate auto-save
  useEffect(() => {
    const interval = setInterval(() => {
      setIsAutoSaving(true);
      setTimeout(() => setIsAutoSaving(false), 1500);
    }, 15000);
    return () => clearInterval(interval);
  }, []);

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
          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 flex flex-col border-r border-neutral-800">
              <div className="h-[50%] border-b border-neutral-800 bg-neutral-950 p-6">
                <WaveformVisualizer />
              </div>
              <div className="flex-1 flex overflow-hidden">
                <div className="w-1/2 border-r border-neutral-800 p-6">
                  <Mixer808 />
                </div>
                <div className="w-1/2 p-6">
                  <FXMacros />
                </div>
              </div>
            </div>
            <div className="w-[300px] p-6 bg-neutral-950/20">
              <MiniMixer />
            </div>
          </div>
        );
      case 'library':
        return (
          <div className="flex-1 p-6 bg-neutral-950/10 overflow-hidden">
            <KontaktBrowser />
          </div>
        );
      case 'plugins':
        return (
          <div className="flex-1 p-6 bg-neutral-950/10 overflow-hidden">
            <VSTManager />
          </div>
        );
      case 'theme':
        return (
          <div className="flex-1 p-6 bg-neutral-950/10 overflow-hidden">
            <ThemeSettings />
          </div>
        );
      case 'drums':
        return (
          <div className="flex-1 p-6 bg-neutral-950/10 overflow-hidden">
            <DrumMachine />
          </div>
        );
      case 'hats':
        return (
          <div className="flex-1 p-6 bg-neutral-950/10 overflow-hidden">
            <HatSequencer />
          </div>
        );
      case 'chords':
        return (
          <div className="flex-1 p-8 bg-neutral-950/10">
            <ChordBuilder />
          </div>
        );
      case 'mod':
        return (
          <div className="flex-1 p-8 bg-neutral-950/10">
            <ModMatrix />
          </div>
        );
      case 'mixer':
        return (
          <div className="flex-1 p-8 flex flex-col gap-8">
            <div className="flex-1 flex justify-center items-center">
              <div className="w-full max-w-4xl bg-neutral-950/40 p-12 rounded-2xl border border-neutral-800">
                <MiniMixer />
                <div className="mt-12 pt-12 border-t border-neutral-800 flex justify-center gap-12">
                  <div className="flex flex-col items-center gap-4">
                    <span className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Master Limiter</span>
                    <div className="w-2 h-24 bg-neutral-900 rounded-full relative">
                      <div className="absolute bottom-0 w-full h-1/2 bg-red-500 rounded-full shadow-[0_0_10px_rgba(239,68,68,0.5)]"></div>
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-4">
                    <span className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Stereo Width</span>
                    <div className="w-2 h-24 bg-neutral-900 rounded-full relative">
                      <div className="absolute bottom-0 w-full h-3/4 bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>
                    </div>
                  </div>
                  {/* Phase Correlation Meter */}
                  <div className="flex flex-col items-center gap-4">
                    <span className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Phase Correlation</span>
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
            <div className="h-48 bg-neutral-950/60 rounded-xl border border-neutral-800 p-6">
              <SpectrumAnalyzer />
            </div>
          </div>
        );
      case 'settings':
        return (
          <div className="flex-1 overflow-y-auto">
            <SettingsView />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-bg-main flex items-center justify-center p-4 font-sans text-text-main">
      <div 
        className={`w-full max-w-[1200px] bg-bg-surface rounded-xl shadow-2xl overflow-hidden border border-border-main flex flex-col relative transition-opacity duration-300 ${isPanic ? 'opacity-50 grayscale' : 'opacity-100'}`}
        style={{ aspectRatio: '1200/750' }}
      >
        {/* Utility Bar */}
        <div className="h-8 bg-bg-surface border-b border-border-main flex items-center px-4 justify-between text-[10px] font-bold uppercase tracking-widest text-neutral-500">
          <div className="flex items-center gap-4">
            <button className="hover:text-neutral-300 flex items-center gap-1">File <ChevronDown size={10} /></button>
            <button className="hover:text-neutral-300 flex items-center gap-1">Edit <ChevronDown size={10} /></button>
            <div className="h-4 w-[1px] bg-neutral-800"></div>
            <div className="flex items-center gap-2">
              <button className="hover:text-neutral-300 p-1" title="Undo"><Undo2 size={12} /></button>
              <button className="hover:text-neutral-300 p-1" title="Redo"><Redo2 size={12} /></button>
            </div>
            <div className="h-4 w-[1px] bg-neutral-800"></div>
            <div className="flex items-center gap-2 bg-neutral-900 rounded px-2 py-0.5 border border-neutral-800 group hover:border-red-500/50 transition-all cursor-pointer">
              <Music size={10} className="text-red-500" />
              <select 
                value={projectKey}
                onChange={(e) => setProjectKey(e.target.value)}
                className="bg-transparent text-[10px] font-bold text-red-500 outline-none appearance-none cursor-pointer"
              >
                {keys.map(k => (
                  <React.Fragment key={k}>
                    <option value={`${k}`}> {k} Maj</option>
                    <option value={`${k}m`}> {k} Min</option>
                  </React.Fragment>
                ))}
              </select>
              <ChevronDown size={8} className="text-neutral-600 group-hover:text-red-500" />
            </div>
            <div className="h-4 w-[1px] bg-neutral-800"></div>
            <div className="flex items-center gap-1 bg-neutral-900 rounded px-1.5 py-0.5 border border-neutral-800">
              <button 
                onClick={() => setActiveState('A')}
                className={`px-1.5 rounded transition-colors ${activeState === 'A' ? 'bg-red-600 text-white' : 'hover:text-neutral-300'}`}
              >A</button>
              <button 
                onClick={() => setActiveState('B')}
                className={`px-1.5 rounded transition-colors ${activeState === 'B' ? 'bg-red-600 text-white' : 'hover:text-neutral-300'}`}
              >B</button>
              <button className="ml-1 hover:text-neutral-300" title="Copy A to B"><RotateCcw size={10} /></button>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 transition-opacity duration-500 ${isAutoSaving ? 'opacity-100' : 'opacity-30'}`}>
              <Save size={10} />
              <span>Auto-Saving...</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-emerald-500 flex items-center gap-1"><Activity size={10} /> 12%</span>
              <span className="text-blue-500">1.2GB</span>
            </div>
          </div>
        </div>

        {/* Header */}
        <div className="h-14 bg-bg-surface border-b border-border-main flex items-center px-6 justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-brand shadow-[0_0_10px_var(--brand-primary-glow)]"></div>
              <h1 className="font-bold tracking-[0.2em] text-neutral-200 uppercase text-base">OmniChop_Pro</h1>
            </div>
            <div className="h-6 w-[1px] bg-border-main mx-2"></div>
            {/* Input/Output Meters */}
            <div className="flex items-center gap-4 bg-bg-main/40 px-3 py-1.5 rounded border border-border-main">
              <div className="flex flex-col gap-1">
                <span className="text-[7px] font-mono text-neutral-500 uppercase leading-none">In</span>
                <div className="w-16 h-1 bg-neutral-900 rounded-full overflow-hidden">
                  <div className="w-[45%] h-full bg-emerald-500"></div>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[7px] font-mono text-neutral-500 uppercase leading-none">Out</span>
                <div className="w-16 h-1 bg-neutral-900 rounded-full overflow-hidden">
                  <div className="w-[65%] h-full bg-emerald-500"></div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={handlePanic}
              className="p-2 rounded bg-neutral-800 hover:bg-red-900/40 text-neutral-500 hover:text-red-500 transition-all border border-neutral-700"
              title="Panic (Kill Audio)"
            >
              <ZapOff size={16} />
            </button>
            <button 
              onClick={() => setShowExportModal(true)}
              className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider bg-brand hover:opacity-90 text-white px-4 py-2 rounded shadow-lg transition-all transform active:scale-95"
            >
              <Download className="w-3 h-3" />
              Build VST3
            </button>
            <button 
              onClick={() => setActiveTab('settings')}
              className={`p-2 rounded-full transition-colors ${activeTab === 'settings' ? 'bg-red-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}`}
            >
              <Settings size={18} />
            </button>
          </div>
        </div>

        {/* Main Area with Sidebar */}
        <div className="flex-1 flex overflow-hidden">
          <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
          {renderContent()}
        </div>

        {/* Bottom Panel - Keyboard */}
        <div className="h-[100px] bg-neutral-950 p-2 border-t border-neutral-800">
          <VirtualKeyboard />
        </div>

        {/* Tooltip / Info Bar */}
        <div className="h-6 bg-neutral-950 border-t border-neutral-800 flex items-center px-4 gap-2 text-[9px] font-mono text-neutral-600 uppercase">
          <Info size={10} />
          <span>Hover over a control to see details. Audio Engine: ASIO v2.0 @ 44.1kHz</span>
        </div>

        {/* Notifications */}
        {notification && (
          <div className="absolute bottom-28 right-8 z-[100] animate-in slide-in-from-right-8 fade-in">
            <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-2xl ${
              notification.type === 'success' ? 'bg-emerald-950 border-emerald-800 text-emerald-400' : 'bg-red-950 border-red-800 text-red-400'
            }`}>
              {notification.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              <span className="text-xs font-bold uppercase tracking-widest">{notification.message}</span>
            </div>
          </div>
        )}

        {/* Export Modal */}
        {showExportModal && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-8">
            <div className="bg-neutral-900 border border-neutral-700 rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-full">
              <div className="flex items-center justify-between p-4 border-b border-neutral-800 bg-neutral-950">
                <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-200">Export to Desktop & VST3</h2>
                <button onClick={() => setShowExportModal(false)} className="text-neutral-500 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 overflow-y-auto text-sm text-neutral-300 space-y-6">
                <p>
                  This environment is a web-based sandbox, which means we cannot directly compile C++ VST3 binaries or launch native desktop windows here. However, your React UI is perfectly structured to be wrapped into both!
                </p>
                
                <div>
                  <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                    1. Standalone Desktop App (Electron)
                  </h3>
                  <p className="mb-2 text-neutral-400">We've generated an <code>electron-main.js</code> file in your project workspace. To run this locally:</p>
                  <ol className="list-decimal list-inside space-y-1 text-neutral-400 ml-2 font-mono text-xs">
                    <li>Download this project to your local machine.</li>
                    <li>Run <code className="text-blue-400">npm install electron --save-dev</code></li>
                    <li>Run <code className="text-blue-400">npx electron electron-main.js</code></li>
                  </ol>
                </div>

                <div>
                  <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500"></div>
                    2. VST3 / AU Plugin (JUCE)
                  </h3>
                  <p className="mb-2 text-neutral-400">To compile this into a VST3 plugin that runs in DAWs (Ableton, FL Studio), the modern approach is to use JUCE with a Web View wrapper.</p>
                  <ul className="list-disc list-inside space-y-1 text-neutral-400 ml-2">
                    <li><strong>DSP Engine (C++):</strong> Handles the actual audio processing and MIDI routing.</li>
                    <li><strong>Frontend (React):</strong> The UI you are looking at right now.</li>
                    <li><strong>Bridge:</strong> JUCE's <code className="text-red-400">WebBrowserComponent</code> passes JSON messages between the React UI and the C++ DSP engine.</li>
                  </ul>
                  <p className="mt-4 text-neutral-400">Check the <code className="text-white">VST3_INTEGRATION.md</code> file in your project workspace for the exact C++ boilerplate code needed to link this UI to JUCE.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
