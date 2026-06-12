import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Cpu, Zap, Activity, ShieldAlert, Save, Loader2, CheckCircle2, Sliders, Radio, Plug, RotateCcw, Disc, Music, Square, AlertCircle, Palette, Check, Pipette, Brain, ChevronDown } from 'lucide-react';
import { fetchSettings, saveSettings, fetchLLMProviders, setLLMProvider } from '../lib/api';
import type { LLMProviderName, LLMProviderInfo } from '../lib/api';
import { useTBMAudio } from '../contexts/TBMAudioContext';
import { useTheme, themes } from '../contexts/ThemeContext';
import { RecoveryManager } from './RecoveryManager';
import { getGlobalMidiHandler } from '../lib/midiHandler';
import { NativeAudioOutput, setTBMAudioOptions } from '../lib/TBMAudioEngine';
import type { AudioDeviceInfo } from '../lib/NativeAudioBridge';
import {
  getAvailableModes,
  setControllerMode,
  getCurrentMode,
  getModeMappings,
  getModeFunctionIds,
  formatMapping,
  setCustomMapping,
  removeCustomMapping,
  resetAllCustomMappings,
  getCustomMappings,
  TBM_FUNCTION_LABELS,
  onControllerModeChange,
  onCustomMappingsChange,
  type MidiMapping as Slate4MidiMapping,
} from '../lib/midiMapping';
import { ToggleSwitch } from './ui/ToggleSwitch';
import { STORAGE_KEYS } from '../lib/constants';

// Lazy-load ModMatrix for embedding in Settings
const ModMatrixLazy = React.lazy(() => import('./ModMatrix').then(m => ({ default: m.ModMatrix })));

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

const MIDI_MAPPINGS_KEY = STORAGE_KEYS.MIDI_MAPPINGS;

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

function isValidMidiMapping(v: unknown): v is MidiMapping {
  if (!v || typeof v !== 'object') return false;
  const m = v as Record<string, unknown>;
  return (m.type === 'cc' || m.type === 'note')
    && typeof m.channel === 'number' && m.channel >= 0 && m.channel <= 15
    && typeof m.number === 'number' && m.number >= 0 && m.number <= 127;
}

function loadMidiMappings(): Record<string, MidiMapping> {
  try {
    const saved = localStorage.getItem(MIDI_MAPPINGS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Record<string, unknown>;
      // Validate every known key; fall back to defaults if any entry is invalid
      const allValid = Object.keys(DEFAULT_MIDI_MAPPINGS).every(k => isValidMidiMapping(parsed[k]));
      if (allValid) return parsed as Record<string, MidiMapping>;
      try { localStorage.removeItem(MIDI_MAPPINGS_KEY); } catch { /* storage unavailable */ }
    }
  } catch {
    try { localStorage.removeItem(MIDI_MAPPINGS_KEY); } catch { /* storage unavailable */ }
  }
  return DEFAULT_MIDI_MAPPINGS;
}

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
  const { audioContext, engineLog, reinitializeEngine, nativeOutput } = useTBMAudio();
  const { currentTheme, setTheme, customTheme, updateCustomTheme } = useTheme();
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  // ── Native audio driver enumeration ────────────────────────────────────────
  const [availableApis, setAvailableApis] = useState<string[]>([]);
  const [availableDevices, setAvailableDevices] = useState<AudioDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<number>(-1);
  const [nativeAvailable, setNativeAvailable] = useState(false);
  const [streamStatus, setStreamStatus] = useState<string>('');

  // ── Real AudioContext values (read-only, reported by the browser) ──────────
  const actualSampleRate = audioContext?.sampleRate ?? null;
  const actualBaseLatency = audioContext?.baseLatency ?? null;
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  // ── MIDI state ─────────────────────────────────────────────────────────────
  const [midiSupported] = useState(() => 'requestMIDIAccess' in navigator);
  const [midiEnabled, setMidiEnabled] = useState(false);
  const [midiDevices, setMidiDevices] = useState<MidiDevice[]>([]);
  const [midiLearnParam, setMidiLearnParam] = useState<string | null>(null);
  const [midiMappings, setMidiMappings] = useState<Record<string, MidiMapping>>(loadMidiMappings);
  const [midiActivity, setMidiActivity] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [showModMatrix, setShowModMatrix] = useState(false);
  const [geminiSlateEnabled, setGeminiSlateEnabled] = useState(false);
  const [controllerMode, setControllerModeState] = useState('turntable');
  const [padOffset, _setPadOffset] = useState(0);
  const [keyLockEnabled, _setKeyLockEnabled] = useState(false);
  const [settingsNotification, setSettingsNotification] = useState<string | null>(null);
  const settingsNotifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const midiAccessRef = useRef<MIDIAccess | null>(null);
  const midiActivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMidiMessageRef = useRef<(event: MIDIMessageEvent) => void>(() => {});

  // ── LLM Provider state ─────────────────────────────────────────────────────
  const [llmProviders, setLlmProviders] = useState<LLMProviderInfo[]>([]);
  const [llmActive, setLlmActive] = useState<LLMProviderName | null>(null);
  const [llmActiveModel, setLlmActiveModel] = useState<string>('');
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmSwitching, setLlmSwitching] = useState(false);
  const [llmModelDropdown, setLlmModelDropdown] = useState<LLMProviderName | null>(null);

  // ── Inline notification for SettingsView ──
  const showSettingsNotification = useCallback((msg: string) => {
    if (settingsNotifTimerRef.current !== null) clearTimeout(settingsNotifTimerRef.current);
    setSettingsNotification(msg);
    settingsNotifTimerRef.current = setTimeout(() => { 
      setSettingsNotification(null); 
      settingsNotifTimerRef.current = null; 
    }, 3000);
  }, []);

  // ── Load LLM providers on mount ─────────────────────────────────────────────
  useEffect(() => {
    setLlmLoading(true);
    fetchLLMProviders()
      .then(res => {
        setLlmProviders(res.providers as LLMProviderInfo[]);
        setLlmActive(res.activeProvider as LLMProviderName);
        setLlmActiveModel(res.activeModel);
      })
      .catch(() => {
        // Server may not be reachable — leave empty
      })
      .finally(() => setLlmLoading(false));
  }, []);

  const handleLLMSwitch = useCallback(async (provider: LLMProviderName, model?: string) => {
    setLlmSwitching(true);
    try {
      const res = await setLLMProvider(provider, model);
      setLlmActive(res.activeProvider as LLMProviderName);
      setLlmActiveModel(res.activeModel);
      setLlmModelDropdown(null);
      // Refresh full provider list to update active flags
      const refreshed = await fetchLLMProviders();
      setLlmProviders(refreshed.providers as LLMProviderInfo[]);
      showSettingsNotification(`LLM switched to ${res.activeProvider} / ${res.activeModel}`);
    } catch (err) {
      showSettingsNotification(`Failed to switch LLM: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLlmSwitching(false);
    }
  }, [showSettingsNotification]);

  useEffect(() => {
    fetchSettings()
      .then(raw => {
        const loaded = settingsToState(raw);
        // If the live AudioContext reports a different sample rate than what was
        // persisted, update the setting to match reality so the UI is accurate.
        if (actualSampleRate !== null) {
          loaded.sampleRate = `${actualSampleRate} Hz`;
        }
        setSettings(loaded);
      })
      .catch(() => {
        // Keep defaults, but still sync sample rate from real context
        if (actualSampleRate !== null) {
          setSettings(prev => ({ ...prev, sampleRate: `${actualSampleRate} Hz` }));
        }
      })
      .finally(() => setIsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reinitialize audio engine when driver, sample rate, or buffer size changes
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    // Apply audio options before reinitializing so the new AudioContext
    // picks up the desired sample rate / latency hint.
    const sampleRate = parseInt(settings.sampleRate);
    if (Number.isFinite(sampleRate) && sampleRate > 0) {
      setTBMAudioOptions({
        sampleRate,
        latencyHint: settings.bufferSize <= 128 ? 'interactive' : 'playback',
      });
    }
    reinitializeEngine?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.driver, settings.sampleRate, settings.bufferSize]);

  // ── Fetch available native audio APIs and devices ──────────────────────────
  useEffect(() => {
    let cancelled = false;
    const isAvail = NativeAudioOutput.available;
    setNativeAvailable(isAvail);

    if (isAvail) {
      NativeAudioOutput.getApis().then((apis) => {
        if (!cancelled) setAvailableApis(apis);
      }).catch(() => { /* not available */ });
    }
    return () => { cancelled = true; };
  }, []);

  // Refresh devices when selected API (driver) changes
  useEffect(() => {
    if (!nativeAvailable) return;
    let cancelled = false;

    // Map UI driver names to RtAudio API names
    const apiMap: Record<string, string> = {
      'ASIO v2.0': 'ASIO',
      'ASIO': 'ASIO',
      'DirectSound': 'DirectSound',
      'WASAPI': 'WASAPI',
      'CoreAudio (Mac)': 'CoreAudio',
      'CoreAudio': 'CoreAudio',
      'ALSA': 'ALSA',
      'PulseAudio': 'PulseAudio',
    };
    const apiName = apiMap[settings.driver] ?? settings.driver;

    NativeAudioOutput.getDevices(apiName).then((devices) => {
      if (cancelled) return;
      setAvailableDevices(devices);
      // Auto-select default output device
      const def = devices.find(d => d.isDefaultOutput);
      if (def) setSelectedDeviceId(def.id);
      else if (devices.length > 0) setSelectedDeviceId(devices[0].id);
    }).catch(() => {
      if (!cancelled) setAvailableDevices([]);
    });

    return () => { cancelled = true; };
  }, [settings.driver, nativeAvailable]);

  // Open native stream when nativeOutput or driver/device/settings change
  useEffect(() => {
    if (!nativeOutput || !nativeAvailable) return;
    if (selectedDeviceId < 0) return;

    let cancelled = false;

    const apiMap: Record<string, string> = {
      'ASIO v2.0': 'ASIO',
      'ASIO': 'ASIO',
      'DirectSound': 'DirectSound',
      'WASAPI': 'WASAPI',
      'CoreAudio (Mac)': 'CoreAudio',
      'CoreAudio': 'CoreAudio',
      'ALSA': 'ALSA',
      'PulseAudio': 'PulseAudio',
    };
    const apiName = apiMap[settings.driver] ?? settings.driver;
    const sampleRate = parseInt(settings.sampleRate);

    (async () => {
      try {
        // Close any previously open stream before opening a new one to avoid
        // overlapping openStream() calls racing on the same native instance.
        await nativeOutput.closeStream();
        if (cancelled) return;

        const result = await nativeOutput.openStream({
          api: apiName,
          deviceId: selectedDeviceId,
          sampleRate: Number.isFinite(sampleRate) ? sampleRate : 44100,
          bufferSize: settings.bufferSize,
        });
        if (!cancelled) {
          if (result.ok) {
            await nativeOutput.setMode('both');
            setStreamStatus(`${result.api}: ${result.device} @ ${result.actualSampleRate}Hz / ${result.actualBufferSize} samples`);
          } else {
            setStreamStatus('Failed to open stream');
          }
        }
      } catch (_err) {
        if (!cancelled) setStreamStatus('Native audio not available');
      }
    })();

    return () => { cancelled = true; };
  }, [nativeOutput, selectedDeviceId, settings.driver, settings.bufferSize, settings.sampleRate, nativeAvailable]);

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

  // Apply UI scale to document root
  useEffect(() => {
    const zoom = settings.uiScale.replace('%', '');
    const numericZoom = parseFloat(zoom) / 100;
    // Use CSS transform scale on body instead of non-standard zoom
    document.body.style.transform = `scale(${numericZoom})`;
    document.body.style.transformOrigin = 'top left';
    document.body.style.width = `${100 / numericZoom}%`;
    document.body.style.height = `${100 / numericZoom}%`;
    try { localStorage.setItem(STORAGE_KEYS.UI_SCALE, settings.uiScale); } catch { /* ignore */ }
    return () => {
      // Reset body transform when the Settings view unmounts so the rest of the
      // UI is not left permanently distorted if the user navigates away.
      document.body.style.transform = '';
      document.body.style.transformOrigin = '';
      document.body.style.width = '';
      document.body.style.height = '';
    };
  }, [settings.uiScale]);

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
      // Clear any previous handlers before (re-)enumerating
      midiAccessRef.current?.inputs.forEach(input => { input.onmidimessage = null; });

      // Reuse existing access object to avoid requesting permission again
      const access = midiAccessRef.current ?? await navigator.requestMIDIAccess({ sysex: false });
      midiAccessRef.current = access;
      setMidiEnabled(true);

      const attachInputs = () => {
        // Clear stale handlers first, then reattach
        access.inputs.forEach(input => { input.onmidimessage = null; });
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

  // ── Slate 4 MIDI Learn state ──
  const [slate4LearnParam, setSlate4LearnParam] = useState<string | null>(null);
  const [slate4Mappings, setSlate4Mappings] = useState<Record<string, Slate4MidiMapping>>(() => getModeMappings());
  const [slate4Custom, setSlate4Custom] = useState<Record<string, Slate4MidiMapping>>(() => getCustomMappings());

  // Subscribe to mapping changes from any source
  useEffect(() => {
    const unsubMode = onControllerModeChange((modeId) => {
      setControllerModeState(modeId);
      setSlate4Mappings(getModeMappings(modeId));
    });
    const unsubMappings = onCustomMappingsChange((custom) => {
      setSlate4Custom(custom);
      setSlate4Mappings(getModeMappings());
    });
    return () => { unsubMode(); unsubMappings(); };
  }, []);

  // Check if the shared handler is already connected (from GeminiSlate4Integration)
  useEffect(() => {
    const handler = getGlobalMidiHandler();
    if (handler.isConnected()) {
      setGeminiSlateEnabled(true);
      setControllerModeState(getCurrentMode().id);
      setSlate4Mappings(getModeMappings());
    }
  }, []);

  // Toggle Gemini Slate 4 — just enables/disables the UI section.
  // The actual MIDI connection is managed by GeminiSlate4Integration component.
  const toggleGeminiSlate = useCallback(() => {
    setGeminiSlateEnabled(prev => !prev);
  }, []);

  // Handle controller mode change
  const handleModeChange = useCallback((modeId: string) => {
    setControllerModeState(modeId);
    setControllerMode(modeId);
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
    
    // Pass to Gemini Slate 4 MIDI Learn if a Slate 4 function is being learned
    if (slate4LearnParam !== null) {
      let learnType: 'cc' | 'note' = 'cc';
      if (msgType === 0xB0) {
        learnType = 'cc';
      } else if (msgType === 0x90 && data2 > 0) {
        learnType = 'note';
      } else {
        // Ignore note-off etc. for learn
        return;
      }
      const newMapping: Slate4MidiMapping = { type: learnType, channel, number: data1 };
      setCustomMapping(slate4LearnParam, newMapping);
      setSlate4LearnParam(null);
      setSlate4Mappings(getModeMappings());
      setSlate4Custom(getCustomMappings());
      return;
    }
    
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

  return (
    <div className="h-full flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-black text-neutral-200 uppercase tracking-[0.2em]">Audio & System Settings</h2>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider transition-all ${
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
      
      {/* ── Inline notification toast ── */}
      {settingsNotification && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-lg animate-fadeIn vignette">
          <div className="flex items-center gap-3">
            <AlertCircle size={16} className="text-brand" />
            <span className="text-sm font-bold uppercase tracking-widest">{settingsNotification}</span>
          </div>
          <button 
            onClick={() => setSettingsNotification(null)}
            className="text-neutral-500 hover:text-white text-[13px] font-bold uppercase transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}
      
      <div className="grid grid-cols-2 gap-8">
        {/* ── Audio Engine ── */}
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-3 text-red-400">
            <Zap size={18} />
            <h3 className="text-sm font-bold uppercase tracking-widest">Audio Engine</h3>
          </div>
          
          <div className="space-y-4">
            {/* Real context readouts */}
            {actualSampleRate !== null && (
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800 flex flex-col gap-1">
                  <span className="text-xs font-mono text-neutral-600 uppercase">Active Sample Rate</span>
                  <span className="text-sm font-bold text-emerald-400 font-mono">{actualSampleRate} Hz</span>
                </div>
                <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800 flex flex-col gap-1">
                  <span className="text-xs font-mono text-neutral-600 uppercase">Base Latency</span>
                  <span className="text-sm font-bold text-emerald-400 font-mono">
                    {actualBaseLatency !== null ? `${Math.round(actualBaseLatency * 1000)} ms` : '—'}
                  </span>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <label className="text-xs font-mono text-neutral-500 uppercase">
                Driver Type
                <span className="ml-2 text-xs text-neutral-700 normal-case">
                  {nativeAvailable ? '(native — applied on reinit)' : '(target — applied on reinit)'}
                </span>
              </label>
              <select 
                value={settings.driver}
                onChange={(e) => set('driver', e.target.value)}
                className="bg-neutral-800 border border-neutral-700 text-neutral-300 text-sm rounded-md p-2 outline-none focus:border-brand"
              >
                {nativeAvailable && availableApis.length > 0
                  ? availableApis.map((api) => (
                      <option key={api} value={api}>{api}</option>
                    ))
                  : <>
                      <option>WASAPI</option>
                      <option>DirectSound</option>
                      <option>ASIO v2.0</option>
                      <option>CoreAudio (Mac)</option>
                    </>
                }
                <option value="Web Audio (browser)">Web Audio (browser)</option>
              </select>
            </div>

            {/* Output Device (only shown when native audio is available and devices exist) */}
            {nativeAvailable && availableDevices.length > 0 && (
              <div className="flex flex-col gap-2">
                <label className="text-xs font-mono text-neutral-500 uppercase">
                  Output Device
                </label>
                <select
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(parseInt(e.target.value))}
                  className="bg-neutral-800 border border-neutral-700 text-neutral-300 text-sm rounded-md p-2 outline-none focus:border-brand"
                >
                  {availableDevices.filter(d => d.outputChannels > 0).map((dev) => (
                    <option key={dev.id} value={dev.id}>
                      {dev.name} ({dev.outputChannels}ch){dev.isDefaultOutput ? ' [Default]' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Stream status indicator */}
            {nativeAvailable && streamStatus && (
              <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800 flex flex-col gap-1">
                <span className="text-xs font-mono text-neutral-600 uppercase">Native Stream</span>
                <span className="text-sm font-bold text-emerald-400 font-mono">{streamStatus}</span>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <label className="text-xs font-mono text-neutral-500 uppercase">
                Buffer Size: {settings.bufferSize} samples
                <span className="ml-2 text-xs text-neutral-700 normal-case">(target — applied on reinit)</span>
              </label>
              <input 
                type="range" 
                min="32" 
                max="2048" 
                step="32"
                value={settings.bufferSize}
                onChange={(e) => set('bufferSize', parseInt(e.target.value))}
                className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-brand"
              />
              <div className="flex justify-between text-[13px] font-mono text-neutral-600">
                <span>32 (Low Latency)</span>
                <span>2048 (Safe)</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-mono text-neutral-500 uppercase">
                Sample Rate
                <span className="ml-2 text-xs text-neutral-700 normal-case">(target — applied on reinit)</span>
              </label>
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
                <span className="text-[13px] font-bold text-red-500 uppercase">Note</span>
                <span className="text-[13px] text-neutral-500 uppercase leading-relaxed">
                  {nativeAvailable
                    ? 'Native audio drivers (WASAPI/ASIO/DirectSound) provide lower latency than Web Audio. ASIO requires the Steinberg ASIO SDK. Lower buffers give less latency but may cause crackling on slower CPUs.'
                    : 'Web Audio locks sample rate at context creation. Driver and buffer size changes apply when the engine reinitializes. Run in Electron for native driver support (ASIO/WASAPI/DirectSound). Lower buffers may cause crackling on slower CPUs.'
                  }
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
                <span className="text-[13px] text-neutral-500 uppercase">Enable parallel DSP threads</span>
              </div>
              <ToggleSwitch value={settings.multiCore} onChange={v => set('multiCore', v)} />
            </div>

            <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800 flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold text-neutral-300 uppercase">High-Precision Resampling</span>
                <span className="text-[13px] text-neutral-500 uppercase">Better quality, higher CPU usage</span>
              </div>
              <ToggleSwitch value={settings.highPrecision} onChange={v => set('highPrecision', v)} />
            </div>

            <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800 flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold text-neutral-300 uppercase">Oversampling (4x)</span>
                <span className="text-[13px] text-neutral-500 uppercase">Reduce aliasing in saturation</span>
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
                    className={`flex-1 py-1 rounded text-[13px] font-bold border transition-all ${
                      settings.uiScale === scale
                        ? 'bg-brand border-brand/50 text-white shadow-lg shadow-brand/20'
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
                <div className="w-2 h-2 rounded-full bg-indicator animate-pulse dot-glow" />
                <span className="text-xs font-mono text-indicator uppercase">RX</span>
              </div>
            )}
          </div>

          <div className="space-y-4">
            {/* Connect / status */}
            {!midiSupported ? (
              <div className="text-[13px] text-neutral-500 font-mono px-1">
                Web MIDI not supported in this browser.
              </div>
            ) : !midiEnabled ? (
              <button
                onClick={initMidi}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 text-sm font-bold uppercase rounded-lg border border-emerald-600/30 transition-all"
              >
                <Plug size={13} /> Connect MIDI Devices
              </button>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 bg-emerald-600/10 rounded-lg border border-emerald-600/30">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse dot-glow" />
                <span className="text-[13px] font-bold text-emerald-400 uppercase">MIDI Connected</span>
                <span className="ml-auto text-[13px] font-mono text-neutral-500">
                  {midiDevices.length} device{midiDevices.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}

            {/* Detected devices */}
            {midiEnabled && (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-mono text-neutral-500 uppercase">Detected Devices</span>
                {midiDevices.length === 0 ? (
                  <div className="text-[13px] text-neutral-600 font-mono px-1">
                    No MIDI devices found. Connect a device and click Refresh.
                  </div>
                ) : (
                  midiDevices.map(dev => (
                    <div key={dev.id} className="flex items-center gap-2 px-3 py-2 bg-neutral-950 rounded-lg border border-neutral-800">
                      <div className="w-1.5 h-1.5 rounded-full bg-indicator shrink-0 dot-glow" />
                      <span className="text-[13px] text-neutral-300 flex-1 truncate font-mono">{dev.name}</span>
                      <span className={`text-xs font-bold uppercase px-1.5 py-0.5 rounded border shrink-0 ${DEVICE_TYPE_STYLES[dev.deviceType]}`}>
                        {DEVICE_TYPE_LABELS[dev.deviceType]}
                      </span>
                    </div>
                  ))
                )}
                <button
                  onClick={initMidi}
                  className="text-xs font-bold text-neutral-600 hover:text-neutral-400 uppercase transition-colors self-start px-1"
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
                  className="text-xs font-bold text-neutral-600 hover:text-red-400 uppercase transition-colors"
                >
                  Reset All
                </button>
              </div>

              {/* DJ Controllers group */}
              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold text-brand/70 uppercase tracking-wider px-1">DJ Controllers</span>
                {(['jog_wheel', 'crossfader'] as const).map(key => {
                  const m = midiMappings[key] ?? DEFAULT_MIDI_MAPPINGS[key];
                  const isLearning = midiLearnParam === key;
                  return (
                    <div key={key} className="flex items-center gap-2 px-2 py-1.5 rounded bg-neutral-950 border border-neutral-800 text-[13px] font-mono">
                      <span className="text-neutral-400 flex-1">{MAPPING_LABELS[key]}</span>
                      <span className="text-neutral-500 w-14 text-right">
                        {m.type === 'cc' ? `CC-${m.number}` : `N-${m.number}`}
                      </span>
                      <button
                        onClick={() => setMidiLearnParam(isLearning ? null : key)}
                        className={`px-2 py-0.5 rounded border text-xs font-bold uppercase transition-all ${
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
                <span className="text-xs font-bold text-indicator/70 uppercase tracking-wider px-1">Transport & Triggers</span>
                {(['play_stop', 'auto_scratch', 'one_shot', 'rec_toggle', 'cycle_preset', 'reset_cue'] as const).map(key => {
                  const m = midiMappings[key] ?? DEFAULT_MIDI_MAPPINGS[key];
                  const isLearning = midiLearnParam === key;
                  return (
                    <div key={key} className="flex items-center gap-2 px-2 py-1.5 rounded bg-neutral-950 border border-neutral-800 text-[13px] font-mono">
                      <span className="text-neutral-400 flex-1">{MAPPING_LABELS[key]}</span>
                      <span className="text-neutral-500 w-14 text-right">
                        {m.type === 'cc' ? `CC-${m.number}` : `N-${m.number}`}
                      </span>
                      <button
                        onClick={() => setMidiLearnParam(isLearning ? null : key)}
                        className={`px-2 py-0.5 rounded border text-xs font-bold uppercase transition-all ${
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
                <option value="">No Device</option>
                <option value="TBM Controller 49">TBM Controller 49</option>
                <option value="USB MIDI Keyboard">USB MIDI Keyboard</option>
                <option value="Virtual MIDI Bus">Virtual MIDI Bus</option>
                {midiDevices
                  .filter(d => !['TBM Controller 49', 'USB MIDI Keyboard', 'Virtual MIDI Bus'].includes(d.name))
                  .map(d => (
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
              <div className="flex justify-between text-[13px] font-mono text-neutral-600">
                <span>5s (Frequent)</span>
                <span>120s (Infrequent)</span>
              </div>
            </div>
          </div>
        </div>

         {/* ── Theme Customizer ── */}
         <div className="col-span-2 mt-2 pt-6 border-t border-neutral-800 separator-glow flex flex-col gap-6">
           <div className="flex items-center justify-between">
             <div className="flex items-center gap-3 text-amber-400">
               <Palette size={18} />
               <h3 className="text-sm font-bold uppercase tracking-widest">Theme</h3>
             </div>
             <button 
               onClick={() => setTheme('tbm-default')}
               className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white rounded text-[13px] font-bold uppercase transition-all"
             >
               <RotateCcw size={12} /> Reset to Default
             </button>
           </div>

           <div className="grid grid-cols-2 gap-6">
             {/* Preset Themes */}
             <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-5 flex flex-col gap-3 vignette">
               <span className="text-[13px] font-bold text-neutral-500 uppercase tracking-widest">Preset Themes</span>
               <div className="grid grid-cols-1 gap-1.5">
                 {themes.map(theme => (
                   <button
                     key={theme.id}
                     onClick={() => setTheme(theme.id)}
                     className={`flex items-center justify-between p-2.5 rounded-lg border transition-all ${
                       currentTheme.id === theme.id 
                         ? 'bg-brand/10 border-brand shadow-lg shadow-brand/20' 
                         : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700'
                     }`}
                   >
                     <div className="flex items-center gap-3">
                       <div 
                         className="w-3.5 h-3.5 rounded-full border border-white/10" 
                         style={{ backgroundColor: theme.primary }}
                       ></div>
                       <span className={`text-xs font-bold ${currentTheme.id === theme.id ? 'text-brand' : 'text-neutral-400'}`}>
                         {theme.name}
                       </span>
                     </div>
                     {currentTheme.id === theme.id && <Check size={12} className="text-brand" />}
                   </button>
                 ))}
               </div>
             </div>

             {/* Custom Theme Creator */}
             <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-5 flex flex-col gap-3 vignette noise-texture relative">
               <div className="flex items-center justify-between">
                 <span className="text-[13px] font-bold text-neutral-500 uppercase tracking-widest">Custom Theme</span>
                 <Pipette size={12} className="text-neutral-600" />
               </div>
               
               <div className="grid grid-cols-2 gap-3">
                 {[
                   { label: 'Primary Accent', key: 'primary' as const, onChange: (val: string) => updateCustomTheme({ primary: val, primaryGlow: `${val}33` }) },
                   { label: 'Background', key: 'bg' as const, onChange: (val: string) => updateCustomTheme({ bg: val }) },
                   { label: 'Surface', key: 'surface' as const, onChange: (val: string) => updateCustomTheme({ surface: val }) },
                   { label: 'Border', key: 'border' as const, onChange: (val: string) => updateCustomTheme({ border: val }) },
                 ].map(({ label, key, onChange }) => (
                   <div key={key} className="flex flex-col gap-1">
                     <label className="text-xs text-neutral-500 uppercase font-bold">{label}</label>
                     <div className="flex gap-1.5">
                       <input 
                         type="color" 
                         value={customTheme[key]}
                         onChange={(e) => onChange(e.target.value)}
                         className="w-8 h-7 bg-neutral-950 border border-neutral-800 rounded cursor-pointer"
                       />
                       <input 
                         type="text" 
                         value={customTheme[key]}
                         onChange={(e) => onChange(e.target.value)}
                         className="flex-1 bg-neutral-950 border border-neutral-800 rounded px-2 text-[13px] font-mono text-neutral-400 outline-none focus:border-brand transition-colors min-w-0"
                       />
                     </div>
                   </div>
                 ))}
               </div>
             </div>
           </div>
         </div>

         {/* ── Modulation Matrix (embedded) ── */}
         <div className="col-span-2 mt-2 pt-6 border-t border-neutral-800 separator-glow flex flex-col gap-4">
           <div className="flex items-center justify-between">
             <div className="flex items-center gap-3 text-red-400">
               <Zap size={18} />
               <h3 className="text-sm font-bold uppercase tracking-widest">Modulation Matrix</h3>
             </div>
             <button
               onClick={() => setShowModMatrix(!showModMatrix)}
               className={`flex items-center gap-2 px-3 py-1.5 text-sm font-bold uppercase rounded-lg transition-colors ${
                 showModMatrix 
                   ? 'bg-neutral-800 text-white' 
                   : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-400'
               }`}
             >
               {showModMatrix ? 'Hide' : 'Show'} Mod Matrix
             </button>
           </div>

           {showModMatrix && (
             <div className="bg-neutral-950 rounded-xl border border-neutral-800 min-h-[400px] overflow-hidden">
               <React.Suspense fallback={
                 <div className="flex items-center justify-center h-[400px]">
                   <Loader2 size={20} className="animate-spin text-neutral-600" />
                 </div>
               }>
                 <ModMatrixLazy />
               </React.Suspense>
             </div>
           )}
         </div>

         {/* ── Gemini Slate 4 Controller ── */}
          <div className="col-span-2 mt-2 pt-6 border-t border-neutral-800 separator-glow flex flex-col gap-6">
           <div className="flex items-center justify-between">
             <div className="flex items-center gap-3 text-purple-400">
               <Disc size={18} />
               <h3 className="text-sm font-bold uppercase tracking-widest">Gemini Slate 4</h3>
             </div>
             <button
               onClick={toggleGeminiSlate}
               className={`relative w-10 h-5 rounded-full transition-colors ${geminiSlateEnabled ? 'bg-purple-600' : 'bg-neutral-700'}`}
             >
               <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${geminiSlateEnabled ? 'right-0.5' : 'left-0.5'} shadow-sm`} />
             </button>
           </div>

           {geminiSlateEnabled && (
             <div className="space-y-4">
               {/* Controller Mode Selection */}
               <div className="flex flex-col gap-2">
                 <span className="text-xs font-mono text-neutral-500 uppercase">Controller Mode</span>
                 <div className="grid grid-cols-3 gap-2">
                   {getAvailableModes().map(mode => (
                     <button
                       key={mode.id}
                       onClick={() => handleModeChange(mode.id)}
                       className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-all ${
                         controllerMode === mode.id
                           ? 'bg-purple-600/20 border-purple-500/50 text-purple-400'
                           : 'bg-neutral-900 border-neutral-800 text-neutral-500 hover:border-neutral-600 hover:text-neutral-300'
                       }`}
                     >
                       {mode.id === 'turntable' && <Disc size={16} />}
                       {mode.id === 'pad' && <Square size={16} />}
                       {mode.id === 'sampling' && <Music size={16} />}
                       <span className="text-[13px] font-bold uppercase">{mode.name}</span>
                     </button>
                   ))}
                 </div>
                 <div className="text-[13px] text-neutral-600 font-mono px-1">
                   {getAvailableModes().find(m => m.id === controllerMode)?.description}
                 </div>
               </div>

               {/* Mode-specific status */}
               <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800">
                 <div className="flex items-center justify-between mb-2">
                   <span className="text-xs font-bold text-neutral-300 uppercase">Current Status</span>
                   <span className="text-[13px] font-mono text-purple-400 uppercase">{controllerMode}</span>
                 </div>
                 <div className="space-y-1">
                   <div className="flex items-center justify-between text-[13px]">
                     <span className="text-neutral-500">Pad Offset</span>
                     <span className="font-mono text-neutral-300">{padOffset}</span>
                   </div>
                   <div className="flex items-center justify-between text-[13px]">
                     <span className="text-neutral-500">Key Lock</span>
                     <span className={`font-mono ${keyLockEnabled ? 'text-green-400' : 'text-neutral-500'}`}>
                       {keyLockEnabled ? 'ON' : 'OFF'}
                     </span>
                   </div>
                   <div className="flex items-center justify-between text-[13px]">
                     <span className="text-neutral-500">MIDI Connected</span>
                     <span className={`font-mono ${getGlobalMidiHandler().isConnected() ? 'text-green-400' : 'text-neutral-500'}`}>
                       {getGlobalMidiHandler().isConnected() ? 'YES' : 'NO'}
                     </span>
                   </div>
                 </div>
               </div>

               {/* ── MIDI Learn Mappings for current mode ── */}
               <div className="flex flex-col gap-2">
                 <div className="flex items-center justify-between">
                   <span className="text-xs font-mono text-neutral-500 uppercase">Slate 4 Mappings</span>
                   <div className="flex gap-2">
                     {Object.keys(slate4Custom).length > 0 && (
                       <button
                         onClick={() => { resetAllCustomMappings(); setSlate4Mappings(getModeMappings()); setSlate4Custom({}); }}
                         className="text-xs font-bold text-neutral-600 hover:text-red-400 uppercase transition-colors"
                       >
                         Reset All
                       </button>
                     )}
                     {slate4LearnParam && (
                       <button
                         onClick={() => setSlate4LearnParam(null)}
                         className="text-xs font-bold text-yellow-400 uppercase animate-pulse"
                       >
                         Cancel Learn
                       </button>
                     )}
                   </div>
                 </div>

                 <div className="max-h-[300px] overflow-y-auto custom-scrollbar flex flex-col gap-1">
                   {getModeFunctionIds(controllerMode).map(fnId => {
                     const mapping = slate4Mappings[fnId];
                     if (!mapping) return null;
                     const label = TBM_FUNCTION_LABELS[fnId] || fnId;
                     const isCustom = fnId in slate4Custom;
                     const isLearning = slate4LearnParam === fnId;

                     return (
                       <div key={fnId} className="flex items-center gap-2 px-2 py-1.5 rounded bg-neutral-950 border border-neutral-800 text-[13px] font-mono">
                         <span className="text-neutral-400 flex-1 truncate">{label}</span>
                         <span className={`w-20 text-right ${isCustom ? 'text-purple-400' : 'text-neutral-500'}`}>
                           {formatMapping(mapping)}
                         </span>
                         {isCustom && (
                           <button
                             onClick={() => { removeCustomMapping(fnId); setSlate4Mappings(getModeMappings()); setSlate4Custom(getCustomMappings()); }}
                             className="text-xs font-bold text-neutral-600 hover:text-red-400 px-1 transition-colors"
                             title="Revert to default"
                           >
                             X
                           </button>
                         )}
                         <button
                           onClick={() => setSlate4LearnParam(isLearning ? null : fnId)}
                           className={`px-2 py-0.5 rounded border text-xs font-bold uppercase transition-all ${
                             isLearning
                               ? 'bg-purple-600 text-white border-purple-500 animate-pulse'
                               : 'text-neutral-600 border-neutral-700 hover:border-purple-500 hover:text-purple-400'
                           }`}
                         >
                           {isLearning ? 'Move...' : 'Learn'}
                         </button>
                       </div>
                     );
                   })}
                 </div>
               </div>

               {/* Help Text */}
               <div className="text-[13px] text-neutral-600 font-mono px-1">
                 Click &ldquo;Learn&rdquo; next to a function, then move a knob/press a button on the Slate 4 to assign it.
                 Custom mappings are saved to your browser. Use mode buttons on the controller or click above to switch modes.
               </div>
             </div>
           )}
          </div>

          {/* ── LLM Provider ── */}
          <div className="col-span-2 mt-2 pt-6 border-t border-neutral-800 separator-glow flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-cyan-400">
                <Brain size={18} />
                <h3 className="text-sm font-bold uppercase tracking-widest">AI / LLM Provider</h3>
              </div>
              {llmActive && (
                <span className="text-[13px] font-mono text-cyan-400/70 uppercase">
                  Active: {llmActive} / {llmActiveModel}
                </span>
              )}
            </div>

            {llmLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={18} className="animate-spin text-neutral-600" />
              </div>
            ) : llmProviders.length === 0 ? (
              <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800">
                <span className="text-sm text-neutral-500 font-mono">
                  Could not load LLM providers. Is the server running?
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {llmProviders.map(p => {
                  const isActive = p.name === llmActive;
                  const showModels = llmModelDropdown === p.name;
                  return (
                    <div
                      key={p.name}
                      className={`relative bg-neutral-950 rounded-lg border transition-all ${
                        isActive
                          ? 'border-cyan-500/50 shadow-[0_0_12px_rgba(6,182,212,0.1)]'
                          : p.available
                            ? 'border-neutral-800 hover:border-neutral-600'
                            : 'border-neutral-800/50 opacity-50'
                      }`}
                    >
                      {/* Provider card header */}
                      <div className="p-4 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-bold uppercase tracking-wider ${
                            isActive ? 'text-cyan-400' : p.available ? 'text-neutral-300' : 'text-neutral-600'
                          }`}>
                            {p.label}
                          </span>
                          <div className="flex items-center gap-2">
                            {p.requiresApiKey && !p.available && (
                              <span className="text-xs font-bold text-yellow-600 uppercase">No Key</span>
                            )}
                            {isActive && (
                              <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(6,182,212,0.5)]" />
                            )}
                            {!isActive && p.available && (
                              <span className="w-2 h-2 rounded-full bg-emerald-500/60" />
                            )}
                          </div>
                        </div>

                        {/* Current model */}
                        <div className="text-[13px] font-mono text-neutral-500 truncate">
                          {p.currentModel}
                        </div>

                        {/* Actions row */}
                        <div className="flex items-center gap-2 mt-1">
                          {!isActive && p.available && (
                            <button
                              onClick={() => handleLLMSwitch(p.name)}
                              disabled={llmSwitching}
                              className="flex-1 px-2 py-1.5 text-xs font-bold uppercase tracking-wider rounded bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-600/30 transition-all disabled:opacity-50"
                            >
                              {llmSwitching ? 'Switching...' : 'Activate'}
                            </button>
                          )}
                          {isActive && (
                            <span className="flex-1 px-2 py-1.5 text-xs font-bold uppercase tracking-wider text-center rounded bg-cyan-600/10 text-cyan-400/60 border border-cyan-500/20">
                              Active
                            </span>
                          )}
                          {p.available && p.models.length > 1 && (
                            <button
                              onClick={() => setLlmModelDropdown(showModels ? null : p.name)}
                              className={`px-2 py-1.5 text-xs rounded border transition-all ${
                                showModels
                                  ? 'bg-neutral-800 border-neutral-600 text-white'
                                  : 'border-neutral-700 text-neutral-500 hover:border-neutral-500 hover:text-neutral-300'
                              }`}
                            >
                              <ChevronDown size={10} className={`transition-transform ${showModels ? 'rotate-180' : ''}`} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Model dropdown */}
                      {showModels && p.available && (
                        <div className="border-t border-neutral-800 px-3 py-2 flex flex-col gap-1 max-h-[160px] overflow-y-auto custom-scrollbar">
                          {p.models.map(model => (
                            <button
                              key={model}
                              onClick={() => handleLLMSwitch(p.name, model)}
                              disabled={llmSwitching}
                              className={`text-left px-2 py-1.5 rounded text-[13px] font-mono transition-all ${
                                model === p.currentModel
                                  ? 'bg-cyan-600/15 text-cyan-400 border border-cyan-500/20'
                                  : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 border border-transparent'
                              }`}
                            >
                              {model}
                              {model === p.currentModel && (
                                <Check size={10} className="inline ml-2 text-cyan-400" />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="text-[13px] text-neutral-600 font-mono px-1">
              Configure API keys in your server .env file. Providers with valid keys are automatically available.
              The active provider is used for music analysis, semantic search embeddings, and the Draymond agent.
            </div>
          </div>

          {/* ── Recovery & Backups ── */}
      <div className="col-span-2 mt-2 pt-6 border-t border-neutral-800 separator-glow flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-neutral-500">
            <RotateCcw size={18} />
            <h3 className="text-sm font-bold uppercase tracking-widest">Recovery & Backups</h3>
          </div>
          <button
            onClick={() => setShowRecovery(!showRecovery)}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm font-bold uppercase rounded-lg transition-colors ${
              showRecovery 
                ? 'bg-neutral-800 text-white' 
                : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-400'
            }`}
          >
            {showRecovery ? 'Hide' : 'Show'} Recovery
          </button>
        </div>
        
        {showRecovery && (
           <RecoveryManager 
            onRecoveryComplete={() => {
              setShowRecovery(false);
              showSettingsNotification('Recovery completed successfully');
            }}
            onError={(error) => {
              showSettingsNotification(`Recovery error: ${error}`);
              console.error('Recovery error:', error);
            }}
          />
        )}
      </div>

      {/* ── Diagnostics ── */}
      <div className="col-span-2 mt-2 pt-6 border-t border-neutral-800 separator-glow flex flex-col gap-4">
        <div className="flex items-center gap-3 text-neutral-500">
          <Activity size={18} />
          <h3 className="text-sm font-bold uppercase tracking-widest">Diagnostics & Engine Logs</h3>
        </div>
        
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800 flex flex-col gap-1 vignette">
            <span className="text-xs font-mono text-neutral-600 uppercase">Buffer Health</span>
            {(() => {
              const ctx = audioContext;
              const pct = ctx && ctx.outputLatency > 0
                ? Math.max(0, Math.min(100, Math.round((1 - ctx.baseLatency / ctx.outputLatency) * 100)))
                : null;
              return (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-neutral-900 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 meter-glow-green" style={{ width: pct != null ? `${pct}%` : '98%' }}></div>
                  </div>
                  <span className="text-[13px] font-mono text-emerald-500">{pct != null ? `${pct}%` : '—'}</span>
                </div>
              );
            })()}
          </div>
          <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800 flex flex-col gap-1 vignette">
            <span className="text-xs font-mono text-neutral-600 uppercase">Output Latency</span>
            <span className="text-sm font-bold text-neutral-300 font-mono">
              {audioContext?.outputLatency != null && audioContext.outputLatency > 0
                ? `${Math.round(audioContext.outputLatency * 1000)} ms`
                : '—'}
            </span>
          </div>
          <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800 flex flex-col gap-1 vignette">
            <span className="text-xs font-mono text-neutral-600 uppercase">Context State</span>
            <span className={`text-sm font-bold font-mono ${
              audioContext?.state === 'running' ? 'text-emerald-400' :
              audioContext?.state === 'suspended' ? 'text-yellow-400' : 'text-neutral-500'
            }`}>
              {audioContext?.state ?? '—'}
            </span>
          </div>
          <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800 flex flex-col gap-1 vignette">
            <span className="text-xs font-mono text-neutral-600 uppercase">X-Runs (Dropouts)</span>
            <span className="text-sm font-bold text-red-500">0</span>
          </div>
        </div>

        <div className="bg-black/60 rounded-lg border border-neutral-800 p-4 font-mono text-[13px] text-neutral-500 h-32 overflow-y-auto custom-scrollbar noise-texture relative">
          {engineLog && engineLog.length > 0 ? (
            [...engineLog].slice(-20).map((entry, i) => {
              // entry format: "[HH:MM:SS.mmm] message" or "[HH:MM:SS.mmm] LEVEL: message"
              const raw = typeof entry === 'string' ? entry : JSON.stringify(entry);
              const isError = raw.toLowerCase().includes('error');
              const isWarn  = raw.toLowerCase().includes('warn');
              const isDebug = raw.toLowerCase().includes('debug');
              const lineColor = isError ? 'text-red-500' : isWarn ? 'text-yellow-700' : isDebug ? 'text-blue-700' : 'text-emerald-700';
              return (
                <div key={i} className={lineColor}>{raw}</div>
              );
            })
          ) : (
            <>
              <div className="flex gap-4"><span className="text-neutral-700">[--:--:--]</span> <span className="text-emerald-700">INFO:</span> Audio engine initialized successfully.</div>
              <div className="flex gap-4"><span className="text-neutral-700">[--:--:--]</span> <span className="text-emerald-700">INFO:</span> {settings.driver} driver loaded. Buffer: {settings.bufferSize} samples.</div>
              <div className="flex gap-4"><span className="text-neutral-700">[--:--:--]</span> <span className="text-blue-700">DEBUG:</span> MIDI device &apos;{settings.midiDevice}&apos; connected.</div>
              <div className="flex gap-4"><span className="text-neutral-700">[--:--:--]</span> <span className="text-emerald-700">INFO:</span> Sample rate: {actualSampleRate != null ? `${actualSampleRate} Hz` : settings.sampleRate}.</div>
            </>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

