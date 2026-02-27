import React, { useState, useEffect, useCallback } from 'react';
import { Cpu, Zap, Activity, ShieldAlert, Save, Loader2, CheckCircle2, Keyboard, Sliders } from 'lucide-react';
import { fetchSettings, saveSettings } from '../lib/api';

interface SettingsState {
  driver: string;
  bufferSize: number;
  sampleRate: string;
  multiCore: boolean;
  highPrecision: boolean;
  oversampling: boolean;
  uiScale: string;
  midiDevice: string;
  autoSaveInterval: number;
}

const DEFAULT_SETTINGS: SettingsState = {
  driver: 'ASIO v2.0',
  bufferSize: 128,
  sampleRate: '44100 Hz',
  multiCore: true,
  highPrecision: false,
  oversampling: true,
  uiScale: '100%',
  midiDevice: 'TBM Controller 49',
  autoSaveInterval: 15,
};

function settingsToState(raw: Record<string, string>): SettingsState {
  return {
    driver:           raw.driver           ?? DEFAULT_SETTINGS.driver,
    bufferSize:       Number(raw.bufferSize ?? DEFAULT_SETTINGS.bufferSize),
    sampleRate:       raw.sampleRate       ?? DEFAULT_SETTINGS.sampleRate,
    multiCore:        (raw.multiCore       ?? 'true') === 'true',
    highPrecision:    (raw.highPrecision   ?? 'false') === 'true',
    oversampling:     (raw.oversampling    ?? 'true') === 'true',
    uiScale:          raw.uiScale          ?? DEFAULT_SETTINGS.uiScale,
    midiDevice:       raw.midiDevice       ?? DEFAULT_SETTINGS.midiDevice,
    autoSaveInterval: Number(raw.autoSaveInterval ?? DEFAULT_SETTINGS.autoSaveInterval),
  };
}

function stateToRecord(s: SettingsState): Record<string, string> {
  return {
    driver:           s.driver,
    bufferSize:       String(s.bufferSize),
    sampleRate:       s.sampleRate,
    multiCore:        String(s.multiCore),
    highPrecision:    String(s.highPrecision),
    oversampling:     String(s.oversampling),
    uiScale:          s.uiScale,
    midiDevice:       s.midiDevice,
    autoSaveInterval: String(s.autoSaveInterval),
  };
}

export function SettingsView() {
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  useEffect(() => {
    fetchSettings()
      .then(raw => setSettings(settingsToState(raw)))
      .catch(() => {/* keep defaults */})
      .finally(() => setIsLoading(false));
  }, []);

  const set = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) =>
    setSettings(prev => ({ ...prev, [key]: value }));

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await saveSettings(stateToRecord(settings));
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } finally {
      setIsSaving(false);
    }
  }, [settings]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-neutral-600" />
      </div>
    );
  }

  const ToggleSwitch = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
    <button
      onClick={() => onChange(!value)}
      className={`w-10 h-5 rounded-full relative transition-colors ${value ? 'bg-brand' : 'bg-neutral-700'}`}
    >
      <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${value ? 'right-0.5' : 'left-0.5'} shadow-sm`}></div>
    </button>
  );

  return (
    <div className="h-full flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-black text-neutral-200 uppercase tracking-[0.2em]">Audio & System Settings</h2>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all ${
            saveStatus === 'saved' ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/40' :
            saveStatus === 'error' ? 'bg-red-600/20 text-red-400 border border-red-600/40' :
            'bg-brand hover:opacity-90 text-white border border-brand/50 shadow-lg shadow-brand/20'
          }`}
        >
          {isSaving ? <Loader2 size={13} className="animate-spin" /> :
           saveStatus === 'saved' ? <CheckCircle2 size={13} /> :
           <Save size={13} />}
          {saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Error' : 'Save Settings'}
        </button>
      </div>
      
      <div className="grid grid-cols-2 gap-8">
        {/* ── Audio Engine ── */}
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-3 text-red-400">
            <Zap size={18} />
            <h3 className="text-sm font-bold uppercase tracking-widest">Audio Engine</h3>
          </div>
          
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-mono text-neutral-500 uppercase">Driver Type</label>
              <select 
                value={settings.driver}
                onChange={(e) => set('driver', e.target.value)}
                className="bg-neutral-800 border border-neutral-700 text-neutral-300 text-sm rounded-md p-2 outline-none focus:border-brand"
              >
                <option>ASIO v2.0</option>
                <option>DirectSound</option>
                <option>CoreAudio (Mac)</option>
                <option>WASAPI</option>
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-mono text-neutral-500 uppercase">Buffer Size: {settings.bufferSize} samples</label>
              <input 
                type="range" 
                min="32" 
                max="2048" 
                step="32"
                value={settings.bufferSize}
                onChange={(e) => set('bufferSize', parseInt(e.target.value))}
                className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-brand"
              />
              <div className="flex justify-between text-[10px] font-mono text-neutral-600">
                <span>32 (Low Latency)</span>
                <span>2048 (Safe)</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-mono text-neutral-500 uppercase">Sample Rate</label>
              <select 
                value={settings.sampleRate}
                onChange={(e) => set('sampleRate', e.target.value)}
                className="bg-neutral-800 border border-neutral-700 text-neutral-300 text-sm rounded-md p-2 outline-none focus:border-brand"
              >
                <option>44100 Hz</option>
                <option>48000 Hz</option>
                <option>88200 Hz</option>
                <option>96000 Hz</option>
              </select>
            </div>

            <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800 flex items-start gap-3">
              <ShieldAlert size={16} className="text-red-500 mt-0.5" />
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-red-500 uppercase">Safety Warning</span>
                <span className="text-[10px] text-neutral-500 uppercase leading-relaxed">
                  Lower buffer sizes may cause audio crackling on slower CPUs. If you experience glitches, increase the buffer size.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Performance ── */}
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-3 text-blue-400">
            <Cpu size={18} />
            <h3 className="text-sm font-bold uppercase tracking-widest">Performance</h3>
          </div>

          <div className="space-y-4">
            <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800 flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold text-neutral-300 uppercase">Multi-Core Processing</span>
                <span className="text-[10px] text-neutral-500 uppercase">Enable parallel DSP threads</span>
              </div>
              <ToggleSwitch value={settings.multiCore} onChange={v => set('multiCore', v)} />
            </div>

            <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800 flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold text-neutral-300 uppercase">High-Precision Resampling</span>
                <span className="text-[10px] text-neutral-500 uppercase">Better quality, higher CPU usage</span>
              </div>
              <ToggleSwitch value={settings.highPrecision} onChange={v => set('highPrecision', v)} />
            </div>

            <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800 flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold text-neutral-300 uppercase">Oversampling (4×)</span>
                <span className="text-[10px] text-neutral-500 uppercase">Reduce aliasing in saturation</span>
              </div>
              <ToggleSwitch value={settings.oversampling} onChange={v => set('oversampling', v)} />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-mono text-neutral-500 uppercase">UI Scaling</label>
              <div className="flex gap-2">
                {['100%', '125%', '150%'].map(scale => (
                  <button
                    key={scale}
                    onClick={() => set('uiScale', scale)}
                    className={`flex-1 py-1 rounded text-[10px] font-bold border transition-all ${
                      settings.uiScale === scale
                        ? 'bg-brand border-brand/50 text-white'
                        : 'bg-neutral-800 border-neutral-700 text-neutral-500 hover:border-neutral-500'
                    }`}
                  >
                    {scale}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── MIDI & Input ── */}
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-3 text-emerald-400">
            <Keyboard size={18} />
            <h3 className="text-sm font-bold uppercase tracking-widest">MIDI & Input</h3>
          </div>

          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-mono text-neutral-500 uppercase">MIDI Input Device</label>
              <select 
                value={settings.midiDevice}
                onChange={(e) => set('midiDevice', e.target.value)}
                className="bg-neutral-800 border border-neutral-700 text-neutral-300 text-sm rounded-md p-2 outline-none focus:border-brand"
              >
                <option>TBM Controller 49</option>
                <option>USB MIDI Keyboard</option>
                <option>Virtual MIDI Bus</option>
                <option>No Device</option>
              </select>
            </div>

            <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800 flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 animate-pulse flex-shrink-0"></div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-emerald-400 uppercase">Device Connected</span>
                <span className="text-[10px] text-neutral-500 font-mono">{settings.midiDevice} · 128 channels</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Project & Auto-Save ── */}
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-3 text-brand">
            <Sliders size={18} />
            <h3 className="text-sm font-bold uppercase tracking-widest">Project</h3>
          </div>

          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-mono text-neutral-500 uppercase">Auto-Save Interval: {settings.autoSaveInterval}s</label>
              <input
                type="range"
                min="5"
                max="120"
                step="5"
                value={settings.autoSaveInterval}
                onChange={(e) => set('autoSaveInterval', parseInt(e.target.value))}
                className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-brand"
              />
              <div className="flex justify-between text-[10px] font-mono text-neutral-600">
                <span>5s (Frequent)</span>
                <span>120s (Infrequent)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Diagnostics ── */}
      <div className="mt-2 pt-6 border-t border-neutral-800 flex flex-col gap-4">
        <div className="flex items-center gap-3 text-neutral-500">
          <Activity size={18} />
          <h3 className="text-sm font-bold uppercase tracking-widest">Diagnostics & Engine Logs</h3>
        </div>
        
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800 flex flex-col gap-1">
            <span className="text-[9px] font-mono text-neutral-600 uppercase">Buffer Health</span>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-neutral-900 rounded-full overflow-hidden">
                <div className="w-[98%] h-full bg-emerald-500"></div>
              </div>
              <span className="text-[10px] font-mono text-emerald-500">98%</span>
            </div>
          </div>
          <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800 flex flex-col gap-1">
            <span className="text-[9px] font-mono text-neutral-600 uppercase">DSP Load / Voice</span>
            <span className="text-sm font-bold text-neutral-300">0.42 ms</span>
          </div>
          <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800 flex flex-col gap-1">
            <span className="text-[9px] font-mono text-neutral-600 uppercase">Disk I/O Latency</span>
            <span className="text-sm font-bold text-neutral-300">1.2 ms</span>
          </div>
          <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800 flex flex-col gap-1">
            <span className="text-[9px] font-mono text-neutral-600 uppercase">X-Runs (Dropouts)</span>
            <span className="text-sm font-bold text-red-500">0</span>
          </div>
        </div>

        <div className="bg-black/60 rounded-lg border border-neutral-800 p-4 font-mono text-[10px] text-neutral-500 h-32 overflow-y-auto custom-scrollbar">
          <div className="flex gap-4"><span className="text-neutral-700">[02:56:39]</span> <span className="text-emerald-700">INFO:</span> Audio engine initialized successfully.</div>
          <div className="flex gap-4"><span className="text-neutral-700">[02:56:40]</span> <span className="text-emerald-700">INFO:</span> {settings.driver} driver loaded. Buffer: {settings.bufferSize} samples.</div>
          <div className="flex gap-4"><span className="text-neutral-700">[02:56:42]</span> <span className="text-blue-700">DEBUG:</span> MIDI device &apos;{settings.midiDevice}&apos; connected.</div>
          <div className="flex gap-4"><span className="text-neutral-700">[02:56:45]</span> <span className="text-emerald-700">INFO:</span> Sample rate: {settings.sampleRate}.</div>
          <div className="flex gap-4"><span className="text-neutral-700">[03:26:32]</span> <span className="text-yellow-700">WARN:</span> High DSP load detected on Track 4.</div>
          <div className="flex gap-4"><span className="text-neutral-700">[03:26:35]</span> <span className="text-emerald-700">INFO:</span> Modulation Matrix updated. 3 active routes.</div>
        </div>
      </div>
    </div>
  );
}

