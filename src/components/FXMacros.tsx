import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Knob } from './Knob';
import { RefreshCw, Activity, Plus, X, Loader2 } from 'lucide-react';
import { useTBMAudio } from '../contexts/TBMAudioContext';

import {
  fetchPlugins,
  loadPluginNative,
  unloadPluginNative,
  setPluginParamNative,
  isElectron,
  type Plugin,
} from '../lib/api';
import { logger } from '../lib/logger';

// ── Per-slot state ──────────────────────────────────────────────────────────

interface InsertSlot {
  pluginId: string;
  name: string;
  path: string;
  instanceId: string | null;  // null while loading
  bypassed: boolean;
  loading: boolean;
}

// ── Component ───────────────────────────────────────────────────────────────

export const FXMacros = React.memo(function FXMacros() {
  const {
    engine,
    sequencer,
    pads,
    audioContext,
    setDeckEffect,
    setDeckEffectEnabled,
    setDeckEffectWetDry,
    setDeckEffectParam,
    setVinylConfig,
  } = useTBMAudio();

  const [isResampling, setIsResampling] = useState(false);

  const [cutoff, setCutoff] = useState(80);
  const [humanize, setHumanize] = useState(15);
  const [vinyl, setVinyl] = useState(30);
  const [reverb, setReverb] = useState(40);
  const [mix, setMix] = useState(100);
  const [lfoRate, setLfoRate] = useState(25);
  const [lfoDepth, setLfoDepth] = useState(40);

  // ── VST Insert state ──
  const [insertSlots, setInsertSlots] = useState<InsertSlot[]>([]);
  const [availablePlugins, setAvailablePlugins] = useState<Plugin[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pluginsLoaded, setPluginsLoaded] = useState(false);

  // ── Load available plugins from DB on mount ──
  useEffect(() => {
    fetchPlugins()
      .then((plugins) => {
        setAvailablePlugins(plugins.filter((p) => p.isEnabled && p.path));
        setPluginsLoaded(true);
      })
      .catch(() => setPluginsLoaded(true));
  }, []);

  // ── Add a plugin to an insert slot ──
  const handleAddPlugin = useCallback(async (plugin: Plugin) => {
    setPickerOpen(false);
    if (!plugin.path) return;

    const slotId = plugin.id;
    // Avoid duplicate slots
    if (insertSlots.some((s) => s.pluginId === slotId)) return;

    const slot: InsertSlot = {
      pluginId: slotId,
      name: plugin.name,
      path: plugin.path,
      instanceId: null,
      bypassed: false,
      loading: true,
    };

    setInsertSlots((prev) => [...prev, slot]);

    if (isElectron() && plugin.path) {
      try {
        const info = await loadPluginNative(plugin.path);
        setInsertSlots((prev) =>
          prev.map((s) =>
            s.pluginId === slotId
              ? { ...s, instanceId: info.instanceId, loading: false }
              : s,
          ),
        );
      } catch (err) {
        console.error('VST load failed:', err);
        // Remove slot on failure
        setInsertSlots((prev) => prev.filter((s) => s.pluginId !== slotId));
      }
    } else {
      // Not in Electron — slot is shown but no native instance
      setInsertSlots((prev) =>
        prev.map((s) =>
          s.pluginId === slotId ? { ...s, loading: false } : s,
        ),
      );
    }
  }, [insertSlots]);

  // ── Remove / unload a slot ──
  const handleRemoveSlot = useCallback(async (slotPluginId: string) => {
    const slot = insertSlots.find((s) => s.pluginId === slotPluginId);
    if (slot?.instanceId) {
      await unloadPluginNative(slot.instanceId).catch((err: unknown) => {
        logger.warn("Failed to unload plugin native instance", { instanceId: slot.instanceId }, err instanceof Error ? err : undefined);
      });
    }
    setInsertSlots((prev) => prev.filter((s) => s.pluginId !== slotPluginId));
  }, [insertSlots]);

  // ── Toggle bypass ──
  const handleToggleBypass = useCallback((slotPluginId: string) => {
    setInsertSlots((prev) =>
      prev.map((s) => {
        if (s.pluginId !== slotPluginId) return s;
        const nextBypassed = !s.bypassed;
        // If running in Electron with a native instance, toggle bypass via
        // setting the plugin's output gain to 0 (bypassed) or restoring it.
        // The native bridge doesn't expose a bypass API directly, so we
        // mute/unmute by setting all param gains to produce silence when bypassed.
        if (s.instanceId && isElectron()) {
          // Send a "bypass" param (param index 0, value 0=active 1=bypassed)
          // This is a convention: if the plugin doesn't support it, it's a no-op.
          setPluginParamNative(s.instanceId, 0, nextBypassed ? 0 : 1).catch((err: unknown) => {
            logger.warn("Failed to set plugin bypass param", { instanceId: s.instanceId }, err instanceof Error ? err : undefined);
          });
        }
        return { ...s, bypassed: nextBypassed };
      }),
    );
  }, []);

  // ── Initialize FX slots on Deck A on mount ──
  const fxInitRef = useRef(false);
  useEffect(() => {
    if (fxInitRef.current) return;
    fxInitRef.current = true;
    setDeckEffect('A', 0, 'autowah', { freqMin: 200, freqMax: 3000, sensitivity: 0.7 });
    setDeckEffectEnabled('A', 0, cutoff < 95);
    setDeckEffect('A', 1, 'reverb', { roomSize: 0.3, damping: 0.5 });
    setDeckEffectEnabled('A', 1, reverb > 5);
    setDeckEffect('A', 2, 'flanger', { rateHz: 0.4, depth: 0.5, feedback: 0.4 });
    setDeckEffectEnabled('A', 2, lfoDepth > 5);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Cutoff → Deck A autowah freqMax (slot 0) ──
  const prevCutoffRef = useRef(cutoff);
  useEffect(() => {
    if (prevCutoffRef.current === cutoff) return;
    prevCutoffRef.current = cutoff;
    const freqMax = 200 + (cutoff / 100) * 8000;
    setDeckEffect('A', 0, 'autowah', { freqMin: 200, freqMax, sensitivity: 0.7 });
    setDeckEffectEnabled('A', 0, cutoff < 95);
  }, [cutoff, setDeckEffect, setDeckEffectEnabled]);

  // ── Vinyl Age → Deck A vinyl simulation ──
  const prevVinylRef = useRef(vinyl);
  useEffect(() => {
    if (prevVinylRef.current === vinyl) return;
    prevVinylRef.current = vinyl;
    const noiseLevel = (vinyl / 100) * 0.15;
    const crackleRate = (vinyl / 100) * 0.8;
    const pitchDrift = (vinyl / 100) * 0.003;
    const wear = (vinyl / 100) * 0.5;
    setVinylConfig('A', { noiseLevel, crackleRate, pitchDrift, wear });
  }, [vinyl, setVinylConfig]);

  // ── Reverb → Deck A reverb effect (slot 1) ──
  const prevReverbRef = useRef(reverb);
  useEffect(() => {
    if (prevReverbRef.current === reverb) return;
    prevReverbRef.current = reverb;
    const roomSize = reverb / 100;
    const damping = 1 - (reverb / 200);
    setDeckEffect('A', 1, 'reverb', { roomSize, damping });
    setDeckEffectEnabled('A', 1, reverb > 5);
    setDeckEffectWetDry('A', 1, reverb / 100);
  }, [reverb, setDeckEffect, setDeckEffectEnabled, setDeckEffectWetDry]);

  // ── Dry/Wet (Mix) → all Deck A effect slots ──
  // Re-runs whenever mix OR reverb changes so the compound reverb wet/dry
  // (reverb% × mix%) stays in sync regardless of which knob was moved last.
  useEffect(() => {
    const wetDry = mix / 100;
    setDeckEffectWetDry('A', 0, wetDry);
    setDeckEffectWetDry('A', 1, (reverb / 100) * wetDry);
    setDeckEffectWetDry('A', 2, wetDry);
  }, [mix, reverb, setDeckEffectWetDry]);

  // ── LFO Rate → Deck A flanger rate (slot 2) ──
  const prevLfoRateRef = useRef(lfoRate);
  useEffect(() => {
    if (prevLfoRateRef.current === lfoRate) return;
    prevLfoRateRef.current = lfoRate;
    const rateHz = 0.05 + (lfoRate / 100) * 7.95;
    setDeckEffectParam('A', 2, 'rateHz', rateHz);
  }, [lfoRate, setDeckEffectParam]);

  // ── LFO Depth → Deck A flanger depth (slot 2) ──
  const prevLfoDepthRef = useRef(lfoDepth);
  useEffect(() => {
    if (prevLfoDepthRef.current === lfoDepth) return;
    prevLfoDepthRef.current = lfoDepth;
    const depth = lfoDepth / 100;
    setDeckEffectParam('A', 2, 'depth', depth);
    setDeckEffectEnabled('A', 2, lfoDepth > 5);
  }, [lfoDepth, setDeckEffectParam, setDeckEffectEnabled]);

  // ── Humanize → sequencer.setHumanize ──
  useEffect(() => {
    if (sequencer) {
      sequencer.setHumanize(humanize / 100);
    }
  }, [humanize, sequencer]);

  // ── Resample: render pad through OfflineAudioContext → replacePadBuffer ──
  const handleResample = useCallback(async () => {
    if (!engine || !audioContext || isResampling) return;
    // Use pad index 0 (or first pad with a buffer)
    const padIndex = pads?.findIndex(p => p?.sample) ?? 0;
    const targetPad = pads?.[padIndex < 0 ? 0 : padIndex];
    if (!targetPad) return;

    const sampleId = targetPad.sample?.id;
    if (!sampleId) return;
    const buffer = engine.getSamples().get(sampleId);
    if (!buffer) return;

    setIsResampling(true);
    try {
      const offlineCtx = new OfflineAudioContext(
        buffer.numberOfChannels,
        buffer.length,
        buffer.sampleRate,
      );
      const source = offlineCtx.createBufferSource();
      source.buffer = buffer;

      // Apply dynamics compressor as noise gate (high ratio = denoise-like)
      const comp = offlineCtx.createDynamicsCompressor();
      comp.ratio.value = 16;
      comp.threshold.value = -40;
      comp.knee.value = 6;
      comp.attack.value = 0.003;
      comp.release.value = 0.1;

      source.connect(comp);
      comp.connect(offlineCtx.destination);
      source.start(0);

      const rendered = await offlineCtx.startRendering();
      engine.replacePadBuffer(padIndex < 0 ? 0 : padIndex, rendered);
    } catch (err) {
      console.error('Resample failed:', err);
    } finally {
      setIsResampling(false);
    }
  }, [engine, audioContext, pads, isResampling]);

  // ── Plugin picker: filter out already-added plugins ──
  const addablePlugins = availablePlugins.filter(
    (p) => !insertSlots.some((s) => s.pluginId === p.id),
  );

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-sm font-black text-neutral-400 uppercase tracking-widest">FX Rack</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-neutral-600 uppercase">Mix: {mix}%</span>
          <button
            onClick={handleResample}
            disabled={isResampling}
            className="flex items-center gap-1 text-xs font-bold text-neutral-500 hover:text-neutral-200 transition-colors uppercase tracking-tighter px-2 py-0.5 rounded-md bg-bg-main/50 border border-border-main disabled:opacity-50"
          >
            {isResampling ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <RefreshCw className="w-2.5 h-2.5" />}
            Resample
          </button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-4 gap-y-4 gap-x-2 place-items-center">
        <Knob label="Cutoff" value={cutoff} onChange={setCutoff} color="#FFD700" />
        <Knob label="Humanize" value={humanize} onChange={setHumanize} color="#FFD700" />
        <Knob label="Vinyl Age" value={vinyl} onChange={setVinyl} color="#d97706" />
        <Knob label="Reverb" value={reverb} onChange={setReverb} color="#00FF00" />
        <Knob label="Dry/Wet" value={mix} onChange={setMix} color="#3b82f6" />

        {/* LFO Section */}
        <div className="col-span-1 flex flex-col items-center gap-1 border-l border-neutral-800 pl-2">
          <Activity className="w-3 h-3 text-emerald-500 animate-pulse" />
          <span className="text-[7px] font-mono text-neutral-600 uppercase">LFO</span>
        </div>
        <Knob label="LFO Rate" value={lfoRate} onChange={setLfoRate} color="#10b981" />
        <Knob label="LFO Depth" value={lfoDepth} onChange={setLfoDepth} color="#10b981" />
      </div>

      {/* ── VST Inserts ─────────────────────────────────────────────────── */}
      <div className="mt-6 pt-6 border-t border-neutral-800 separator-glow">
        <div className="flex justify-between items-center mb-3">
          <span className="text-[13px] font-bold text-neutral-500 uppercase tracking-widest">VST Inserts</span>
          <button
            onClick={() => setPickerOpen((v) => !v)}
            className="p-1 rounded bg-neutral-800 text-neutral-500 hover:text-white transition-colors"
            title="Add VST insert"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>

        {/* Plugin picker dropdown */}
        {pickerOpen && (
          <div className="mb-2 rounded border border-neutral-700 bg-neutral-900 overflow-hidden">
            {!pluginsLoaded ? (
              <div className="flex items-center gap-2 px-3 py-2 text-neutral-500">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span className="text-xs">Loading plugins…</span>
              </div>
            ) : addablePlugins.length === 0 ? (
              <div className="px-3 py-2 text-xs text-neutral-600">
                {availablePlugins.length === 0
                  ? 'No enabled plugins with paths. Scan in VST Manager first.'
                  : 'All available plugins already added.'}
              </div>
            ) : (
              <div className="max-h-36 overflow-y-auto">
                {addablePlugins.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleAddPlugin(p)}
                    className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-neutral-800 transition-colors text-left"
                  >
                    <span className="text-[13px] font-bold text-neutral-300 truncate">{p.name}</span>
                    <span className="text-xs font-mono text-neutral-600 ml-2 shrink-0">{p.type}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Active insert slots */}
        <div className="flex flex-col gap-1.5 vignette rounded-lg p-1">
          {insertSlots.map((slot) => (
            <div
              key={slot.pluginId}
              className="flex items-center justify-between px-3 py-2 bg-neutral-950 rounded border border-neutral-800 group hover:border-blue-500/50 transition-all"
            >
              <div className="flex items-center gap-2 min-w-0">
                {/* Bypass toggle */}
                <button
                  onClick={() => handleToggleBypass(slot.pluginId)}
                  title={slot.bypassed ? 'Bypassed — click to enable' : 'Active — click to bypass'}
                  className="shrink-0"
                >
                  {slot.loading ? (
                    <Loader2 className="w-1.5 h-1.5 text-neutral-500 animate-spin" />
                  ) : (
                    <div
                      className={`w-1.5 h-1.5 rounded-full transition-colors ${
                        slot.bypassed
                          ? 'bg-neutral-600'
                          : 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)] dot-glow'
                      }`}
                    />
                  )}
                </button>
                <span className="text-[13px] font-bold text-neutral-300 truncate">{slot.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {slot.instanceId && (
                  <span className="text-xs font-mono text-neutral-600">VST3</span>
                )}
                {!slot.instanceId && !slot.loading && (
                  <span className="text-xs font-mono text-amber-700" title="No native instance (browser mode)">BROWSER</span>
                )}
                <button
                  onClick={() => handleRemoveSlot(slot.pluginId)}
                  className="text-neutral-700 hover:text-red-400 transition-colors"
                  title="Remove insert"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}

          {/* Empty slot hint */}
          {insertSlots.length === 0 && !pickerOpen && (
            <button
              onClick={() => setPickerOpen(true)}
              className="flex items-center justify-between px-3 py-2 bg-neutral-950/50 rounded border border-dashed border-neutral-800 text-neutral-600 hover:border-neutral-700 hover:text-neutral-400 transition-all cursor-pointer w-full"
            >
              <span className="text-xs font-bold uppercase tracking-tighter">Empty Slot</span>
              <Plus className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
});