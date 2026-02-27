import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Cpu, Zap, Activity, ShieldAlert, Save, Loader2, CheckCircle2, Sliders, Radio, Plug } from 'lucide-react';
import { fetchSettings, saveSettings } from '../lib/api';

// ── MIDI types & constants ────────────────────────────────────────────────────
type MidiDevice = {
  id: string;
  name: string;
  deviceType: 'keyboard' | 'dj_controller' | 'pad_controller' | 'unknown';
};
type MidiMapping = { type: 'cc' | 'note'; channel: number; number: number };

const DEFAULT_MIDI_MAPPINGS: Record<string, MidiMapping> = {
  jog_wheel:    { type: 'cc',   channel: 0, number: 33 },
  crossfader:   { type: 'cc',   channel: 0, number: 8  },
  play_stop:    { type: 'note', channel: 9, number: 36 },
  cycle_preset: { type: 'note', channel: 9, number: 37 },
  one_shot:     { type: 'note', channel: 9, number: 38 },
  rec_toggle:   { type: 'note', channel: 9, number: 39 },
  auto_scratch: { type: 'note', channel: 9, number: 40 },
  reset_cue:    { type: 'note', channel: 9, number: 41 },
};

const MIDI_MAPPINGS_KEY = 'tbm_midi_mappings';

const DEVICE_TYPE_STYLES: Record<string, string> = {
  keyboard:       'text-purple-400 border-purple-500/30 bg-purple-500/10',
  dj_controller:  'text-brand border-brand/30 bg-brand/10',
  pad_controller: 'text-indicator border-indicator/30 bg-indicator/10',
  unknown:        'text-neutral-500 border-neutral-600/30 bg-neutral-600/10',
};
const DEVICE_TYPE_LABELS: Record<string, string> = {
  keyboard: 'Keys', dj_controller: 'DJ', pad_controller: 'Pads', unknown: 'Ctrl',
};
const MAPPING_LABELS: Record<string, string> = {
  jog_wheel: 'Jog Wheel', crossfader: 'Crossfader',
  play_stop: 'Play / Stop', cycle_preset: 'Cycle Preset',
  one_shot: 'One Shot', rec_toggle: 'Record',
  auto_scratch: 'Auto Scratch', reset_cue: 'Reset Cue',
};

function detectDeviceType(name: string): MidiDevice['deviceType'] {
  const n = name.toLowerCase();
  if (/keyboard|piano|keys|synth|organ/.test(n)) return 'keyboard';
  if (/dj|turntable|scratch|deck|mixer|jog/.test(n)) return 'dj_controller';
  if (/pad|trigger|step|grid/.test(n)) return 'pad_controller';
  return 'unknown';
}

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

  // ── MIDI state ─────────────────────────────────────────────────────────────
  const [midiSupported] = useState(() => 'requestMIDIAccess' in navigator);
  const [midiEnabled, setMidiEnabled] = useState(false);
  const [midiDevices, setMidiDevices] = useState<MidiDevice[]>([]);
  const [midiLearnParam, setMidiLearnParam] = useState<string | null>(null);
  const [midiMappings, setMidiMappings] = useState<Record<string, MidiMapping>>(() => {
    try {
      const saved = localStorage.getItem(MIDI_MAPPINGS_KEY);
      if (saved) return JSON.parse(saved) as Record<string, MidiMapping>;
    } catch {
      try { localStorage.removeItem(MIDI_MAPPINGS_KEY); } catch { /* storage unavailable */ }
    }
    return DEFAULT_MIDI_MAPPINGS;
  });
  const [midiActivity, setMidiActivity] = useState(false);
  const midiAccessRef = useRef<MIDIAccess | null>(null);
  const midiActivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMidiMessageRef = useRef<(event: MIDIMessageEvent) => void>(() => {});

  useEffect(() => {
    fetchSettings()
      .then(raw => setSettings(settingsToState(raw)))
      .catch(() => {/* keep defaults */})
      .finally(() => setIsLoading(false));
  }, []);

  // Persist MIDI mappings on change
  useEffect(() => {
    try {
      localStorage.setItem(MIDI_MAPPINGS_KEY, JSON.stringify(midiMappings));
    } catch { /* storage unavailable */ }
  }, [midiMappings]);

  // Cleanup MIDI on unmount
  useEffect(() => {
    return () => {
      if (midiActivityTimerRef.current !== null) clearTimeout(midiActivityTimerRef.current);
      midiAccessRef.current?.inputs.forEach(input => { input.onmidimessage = null; });
    };
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

  const initMidi = useCallback(async () => {
    try {
      const access = await navigator.requestMIDIAccess({ sysex: false });
      midiAccessRef.current = access;
      setMidiEnabled(true);
      const attachInputs = () => {
        const devs: MidiDevice[] = [];
        access.inputs.forEach(input => {
          devs.push({
            id: input.id,
            name: input.name ?? 'Unknown Device',
            deviceType: detectDeviceType(input.name ?? ''),
          });
          input.onmidimessage = (event) => onMidiMessageRef.current(event);
        });
        setMidiDevices(devs);
      };
      attachInputs();
      access.onstatechange = () => { attachInputs(); };
    } catch {
      setMidiEnabled(false);
    }
  }, []);

  // Keep MIDI handler fresh on every render so it reads current midiLearnParam/midiMappings
  onMidiMessageRef.current = (event: MIDIMessageEvent) => {
    const data = event.data;
    if (!data || data.length < 3) return;
    const status = data[0];
    const data1 = data[1];
    const data2 = data[2];
    const msgType = status & 0xF0;
    const channel = status & 0x0F;
    setMidiActivity(true);
    if (midiActivityTimerRef.current !== null) clearTimeout(midiActivityTimerRef.current);
    midiActivityTimerRef.current = setTimeout(() => setMidiActivity(false), 150);
    if (midiLearnParam !== null) {
      if (msgType === 0xB0) {
        setMidiMappings(prev => ({ ...prev, [midiLearnParam]: { type: 'cc', channel, number: data1 } }));
      } else if (msgType === 0x90 && data2 > 0) {
        setMidiMappings(prev => ({ ...prev, [midiLearnParam]: { type: 'note', channel, number: data1 } }));
      }
      setMidiLearnParam(null);
    }
  };

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
                <span className="text-xs font-bold text-neutral-300 uppercase">Oversampling (4x)</span>
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

        {/* ── MIDI & Controllers ── */}
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-emerald-400">
              <Radio size={18} />
              <h3 className="text-sm font-bold uppercase tracking-widest">MIDI & Controllers</h3>
            </div>
            {midiActivity && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-indicator animate-pulse shadow-[0_0_6px_var(--indicator-glow)]" />
                <span className="text-[9px] font-mono text-indicator uppercase">RX</span>
              </div>
            )}
          </div>

          <div className="space-y-4">
            {/* Connect / status */}
            {!midiSupported ? (
              <div className="text-[10px] text-neutral-500 font-mono px-1">
                Web MIDI not supported in this browser.
              </div>
            ) : !midiEnabled ? (
              <button
                onClick={initMidi}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 text-[11px] font-bold uppercase rounded-lg border border-emerald-600/30 transition-all"
              >
                <Plug size={13} /> Connect MIDI Devices
              </button>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 bg-emerald-600/10 rounded-lg border border-emerald-600/30">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-bold text-emerald-400 uppercase">MIDI Connected</span>
                <span className="ml-auto text-[10px] font-mono text-neutral-500">
                  {midiDevices.length} device{midiDevices.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}

            {/* Detected devices */}
            {midiEnabled && (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-mono text-neutral-500 uppercase">Detected Devices</span>
                {midiDevices.length === 0 ? (
                  <div className="text-[10px] text-neutral-600 font-mono px-1">
                    No MIDI devices found. Connect a device and click Refresh.
                  </div>
                ) : (
                  midiDevices.map(dev => (
                    <div key={dev.id} className="flex items-center gap-2 px-3 py-2 bg-neutral-950 rounded-lg border border-neutral-800">
                      <div className="w-1.5 h-1.5 rounded-full bg-indicator flex-shrink-0" />
                      <span className="text-[10px] text-neutral-300 flex-1 truncate font-mono">{dev.name}</span>
                      <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded border flex-shrink-0 ${DEVICE_TYPE_STYLES[dev.deviceType]}`}>
                        {DEVICE_TYPE_LABELS[dev.deviceType]}
                      </span>
                    </div>
                  ))
                )}
                <button
                  onClick={initMidi}
                  className="text-[9px] font-bold text-neutral-600 hover:text-neutral-400 uppercase transition-colors self-start px-1"
                >
                  Refresh Devices
                </button>
              </div>
            )}

            {/* Mappings */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-neutral-500 uppercase">Controller Mappings</span>
                <button
                  onClick={() => setMidiMappings(DEFAULT_MIDI_MAPPINGS)}
                  className="text-[9px] font-bold text-neutral-600 hover:text-red-400 uppercase transition-colors"
                >
                  Reset All
                </button>
              </div>

              {/* DJ Controllers group */}
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-bold text-brand/70 uppercase tracking-wider px-1">DJ Controllers</span>
                {(['jog_wheel', 'crossfader'] as const).map(key => {
                  const m = midiMappings[key] ?? DEFAULT_MIDI_MAPPINGS[key];
                  const isLearning = midiLearnParam === key;
                  return (
                    <div key={key} className="flex items-center gap-2 px-2 py-1.5 rounded bg-neutral-950 border border-neutral-800 text-[10px] font-mono">
                      <span className="text-neutral-400 flex-1">{MAPPING_LABELS[key]}</span>
                      <span className="text-neutral-500 w-14 text-right">
                        {m.type === 'cc' ? `CC-${m.number}` : `N-${m.number}`}
                      </span>
                      <button
                        onClick={() => setMidiLearnParam(isLearning ? null : key)}
                        className={`px-2 py-0.5 rounded border text-[8px] font-bold uppercase transition-all ${
                          isLearning
                            ? 'bg-brand text-white border-brand animate-pulse'
                            : 'text-neutral-600 border-neutral-700 hover:border-brand hover:text-brand'
                        }`}
                      >
                        {isLearning ? 'Move…' : 'Learn'}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Transport & Triggers group */}
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-bold text-indicator/70 uppercase tracking-wider px-1">Transport & Triggers</span>
                {(['play_stop', 'auto_scratch', 'one_shot', 'rec_toggle', 'cycle_preset', 'reset_cue'] as const).map(key => {
                  const m = midiMappings[key] ?? DEFAULT_MIDI_MAPPINGS[key];
                  const isLearning = midiLearnParam === key;
                  return (
                    <div key={key} className="flex items-center gap-2 px-2 py-1.5 rounded bg-neutral-950 border border-neutral-800 text-[10px] font-mono">
                      <span className="text-neutral-400 flex-1">{MAPPING_LABELS[key]}</span>
                      <span className="text-neutral-500 w-14 text-right">
                        {m.type === 'cc' ? `CC-${m.number}` : `N-${m.number}`}
                      </span>
                      <button
                        onClick={() => setMidiLearnParam(isLearning ? null : key)}
                        className={`px-2 py-0.5 rounded border text-[8px] font-bold uppercase transition-all ${
                          isLearning
                            ? 'bg-brand text-white border-brand animate-pulse'
                            : 'text-neutral-600 border-neutral-700 hover:border-brand hover:text-brand'
                        }`}
                      >
                        {isLearning ? 'Move…' : 'Learn'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Preferred saved device (persisted to backend) */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-mono text-neutral-500 uppercase">Preferred Input Device</label>
              <select
                value={settings.midiDevice}
                onChange={(e) => set('midiDevice', e.target.value)}
                className="bg-neutral-800 border border-neutral-700 text-neutral-300 text-sm rounded-md p-2 outline-none focus:border-brand"
              >
                <option>No Device</option>
                <option>USB MIDI Keyboard</option>
                <option>Virtual MIDI Bus</option>
                {midiDevices.map(d => (
                  <option key={d.id} value={d.name}>{d.name}</option>
                ))}
              </select>
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
          <div className="flex gap-4"><span className="text-neutral-700">[02:56:42]</span> <span className="text-blue-700">DEBUG:</span> MIDI device '{settings.midiDevice}' connected.</div>
          <div className="flex gap-4"><span className="text-neutral-700">[02:56:45]</span> <span className="text-emerald-700">INFO:</span> Sample rate: {settings.sampleRate}.</div>
          <div className="flex gap-4"><span className="text-neutral-700">[03:26:32]</span> <span className="text-yellow-700">WARN:</span> High DSP load detected on Track 4.</div>
          <div className="flex gap-4"><span className="text-neutral-700">[03:26:35]</span> <span className="text-emerald-700">INFO:</span> Modulation Matrix updated. 3 active routes.</div>
        </div>
      </div>
    </div>
  );
}

