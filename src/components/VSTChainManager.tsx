import React, { useState, useRef, useEffect } from 'react';
import {
  Layers,
  Plus,
  Trash2,
  GripVertical,
  Send,
  ChevronDown,
  ChevronRight,

  Download,
  Upload,
  Eye,
  EyeOff,
  X,
  Volume2,
  Activity,
} from 'lucide-react';
import { useTBMAudio } from '../contexts/TBMAudioContext';
import type { Plugin } from '../lib/api';

export type ChainType = 'instrument' | 'effect' | 'drums' | 'bass' | 'synth' | 'pad' | 'master';

export interface VSTChainItem {
  id: string;
  pluginId: string;
  pluginName: string;
  pluginPath?: string;
  bypass: boolean;
  parameters: Record<string, number>;
}

export interface VSTChain {
  id: string;
  name: string;
  type: ChainType;
  color: string;
  items: VSTChainItem[];
  outputSlot: number | null;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  automation: ChainAutomation;
}

export interface ChainAutomation {
  enabled: boolean;
  mode: 'lfo' | 'envelope' | 'pattern' | 'random';
  rate: number;
  depth: number;
  attack: number;
  release: number;
  pattern: number[];
  sync: boolean;
}

const CHAIN_TYPE_COLORS: Record<ChainType, string> = {
  instrument: '#22d55e',
  effect: '#3b82f6',
  drums: '#ef4444',
  bass: '#f97316',
  synth: '#a855f7',
  pad: '#06b6d4',
  master: '#eab308',
};

const CHAIN_TYPE_LABELS: Record<ChainType, string> = {
  instrument: 'Instrument',
  effect: 'FX Chain',
  drums: 'Drums',
  bass: 'Bass',
  synth: 'Synth',
  pad: 'Pad',
  master: 'Master',
};

const DEFAULT_AUTOMATION: ChainAutomation = {
  enabled: false,
  mode: 'lfo',
  rate: 1,
  depth: 0.5,
  attack: 0.1,
  release: 0.3,
  pattern: Array(16).fill(0).map((_, i) => i % 4 === 0 ? 0.8 : 0.4),
  sync: true,
};

function generateId() {
  return Math.random().toString(36).slice(2, 11);
}

function loadChainsFromStorage(): VSTChain[] {
  try {
    const raw = localStorage.getItem('tbm_vst_chains');
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function saveChainsToStorage(chains: VSTChain[]) {
  try {
    localStorage.setItem('tbm_vst_chains', JSON.stringify(chains));
  } catch { /* ignore */ }
}



export function VSTChainManager() {
  const { trackRouter, audioContext } = useTBMAudio();
  const [chains, setChains] = useState<VSTChain[]>(loadChainsFromStorage);
  const [expandedChains, setExpandedChains] = useState<Set<string>>(new Set());
  const [selectedChainId, setSelectedChainId] = useState<string | null>(null);

  const [availablePlugins, setAvailablePlugins] = useState<Plugin[]>([]);
  const [showPluginBrowser, setShowPluginBrowser] = useState(false);

  const [showNewChainModal, setShowNewChainModal] = useState(false);
  const [newChainName, setNewChainName] = useState('');
  const [newChainType, setNewChainType] = useState<ChainType>('effect');
  
  const automationRefs = useRef<Map<string, { phase: number; intervalId: number }>>(new Map());

  useEffect(() => {
    saveChainsToStorage(chains);
  }, [chains]);

  const startAutomation = (chain: VSTChain) => {
    if (!trackRouter || chain.outputSlot === null) return;
    stopAutomation(chain.id);
    
    const nodes = trackRouter.getAudioNodes(chain.outputSlot);
    if (!nodes) return;

    let phase = 0;
    const intervalId = window.setInterval(() => {
      const slot = trackRouter.getSlot(chain.outputSlot!);
      if (!slot || slot.muted) return;
      
      const now = audioContext?.currentTime ?? 0;
      const { mode, rate, depth, pattern, sync } = chain.automation;
      
      let automationValue = 0.5;
      
      switch (mode) {
        case 'lfo': {
          phase += 0.02 * rate;
          automationValue = 0.5 + Math.sin(phase) * depth * 0.5;
          break;
        }
        case 'envelope': {
          const cyclePos = (phase % 1);
          if (cyclePos < chain.automation.attack) {
            automationValue = (cyclePos / chain.automation.attack) * depth;
          } else {
            automationValue = depth - ((cyclePos - chain.automation.attack) / (1 - chain.automation.attack)) * depth * chain.automation.release;
          }
          phase += 0.005 * rate;
          break;
        }
        case 'pattern': {
          const step = Math.floor(phase) % 16;
          automationValue = pattern[step] * depth;
          phase += sync ? 0.25 : 0.125;
          break;
        }
        case 'random': {
          automationValue = (Math.random() * depth);
          phase += 0.01 * rate;
          break;
        }
      }
      
      const baseVolume = chain.volume;
      const autoVolume = baseVolume * automationValue;
      nodes.gainNode.gain.setTargetAtTime(autoVolume, now, 0.01);
    }, 50);
    
    automationRefs.current.set(chain.id, { phase, intervalId });
  };

  const stopAutomation = (chainId: string) => {
    const existing = automationRefs.current.get(chainId);
    if (existing) {
      clearInterval(existing.intervalId);
      automationRefs.current.delete(chainId);
    }
  };

  useEffect(() => {
    fetch('/api/plugins')
      .then(res => res.json())
      .then(data => setAvailablePlugins(data || []))
      .catch(() => setAvailablePlugins([]));
  }, []);

  useEffect(() => {
    chains.forEach(chain => {
      if (chain.automation.enabled && trackRouter && chain.outputSlot !== null) {
        startAutomation(chain);
      } else {
        stopAutomation(chain.id);
      }
    });
    return () => {
      automationRefs.current.forEach((_, id) => stopAutomation(id));
    };
  }, [chains, trackRouter, startAutomation, stopAutomation]);

  const createChain = () => {
    if (!newChainName.trim()) return;
    const newChain: VSTChain = {
      id: generateId(),
      name: newChainName.trim(),
      type: newChainType,
      color: CHAIN_TYPE_COLORS[newChainType],
      items: [],
      outputSlot: null,
      volume: 0.8,
      pan: 0,
      muted: false,
      solo: false,
      automation: { ...DEFAULT_AUTOMATION },
    };
    setChains(prev => [...prev, newChain]);
    setNewChainName('');
    setShowNewChainModal(false);
    setExpandedChains(prev => new Set([...prev, newChain.id]));
  };

  const deleteChain = (chainId: string) => {
    stopAutomation(chainId);
    setChains(prev => prev.filter(c => c.id !== chainId));
    if (selectedChainId === chainId) setSelectedChainId(null);
  };

  const addPluginToChain = (chainId: string, plugin: Plugin) => {
    setChains(prev => prev.map(chain => {
      if (chain.id !== chainId) return chain;
      return {
        ...chain,
        items: [...chain.items, {
          id: generateId(),
          pluginId: plugin.id,
          pluginName: plugin.name,
          pluginPath: plugin.path ?? undefined,
          bypass: false,
          parameters: {},
        }],
      };
    }));
  };

  const removePluginFromChain = (chainId: string, itemId: string) => {
    setChains(prev => prev.map(chain => {
      if (chain.id !== chainId) return chain;
      return {
        ...chain,
        items: chain.items.filter(item => item.id !== itemId),
      };
    }));
  };



  const routeChainToMixer = (chainId: string, slotIndex: number) => {
    setChains(prev => prev.map(chain => {
      if (chain.id !== chainId) return chain;
      return { ...chain, outputSlot: slotIndex };
    }));
    
    if (trackRouter && slotIndex >= 0) {
      trackRouter.assignToChannel(slotIndex, 'vst', `chain-${chainId}`, chains.find(c => c.id === chainId)?.name || 'VST Chain');
    }
  };

  const updateChainAutomation = (chainId: string, automation: Partial<ChainAutomation>) => {
    setChains(prev => prev.map(chain => {
      if (chain.id !== chainId) return chain;
      return { ...chain, automation: { ...chain.automation, ...automation } };
    }));
  };

  const toggleChainExpanded = (chainId: string) => {
    setExpandedChains(prev => {
      const next = new Set(prev);
      if (next.has(chainId)) next.delete(chainId);
      else next.add(chainId);
      return next;
    });
  };

  const exportChains = () => {
    const data = JSON.stringify(chains, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tbm-vst-chains.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importChains = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const imported = JSON.parse(text);
        if (Array.isArray(imported)) {
          setChains(imported);
        }
      } catch { /* ignore */ }
    };
    input.click();
  };

  return (
    <div className="flex flex-col h-full bg-neutral-950 text-neutral-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 bg-neutral-900/50">
        <div className="flex items-center gap-3">
          <Layers className="text-brand" size={20} />
          <h2 className="text-sm font-bold uppercase tracking-wider">VST Chain Manager</h2>
          <span className="text-xs text-neutral-600">({chains.length} chains)</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={importChains}
            className="p-2 hover:bg-neutral-800 rounded transition-colors"
            title="Import Chains"
          >
            <Upload size={14} />
          </button>
          <button
            onClick={exportChains}
            className="p-2 hover:bg-neutral-800 rounded transition-colors"
            title="Export Chains"
          >
            <Download size={14} />
          </button>
          <button
            onClick={() => setShowNewChainModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand/20 hover:bg-brand/30 text-brand text-xs font-bold uppercase rounded border border-brand/30 transition-colors"
          >
            <Plus size={12} /> New Chain
          </button>
        </div>
      </div>

      {/* Chain List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {chains.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-neutral-600 gap-3">
            <Layers size={48} className="opacity-20" />
            <p className="text-sm font-bold uppercase tracking-widest">No Chains Yet</p>
            <p className="text-xs text-neutral-700">Create a chain to get started</p>
          </div>
        )}

        {chains.map(chain => (
          <div
            key={chain.id}
            className={`bg-neutral-900/50 rounded-lg border transition-colors ${
              selectedChainId === chain.id ? 'border-brand/50' : 'border-neutral-800 hover:border-neutral-700'
            }`}
          >
            {/* Chain Header */}
            <div
              className="flex items-center gap-2 px-3 py-2 cursor-pointer"
              onClick={() => { toggleChainExpanded(chain.id); setSelectedChainId(chain.id); }}
            >
              <GripVertical size={14} className="text-neutral-700 cursor-grab" />
              {expandedChains.has(chain.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: chain.color }}
              />
              <span className="flex-1 text-sm font-bold truncate">{chain.name}</span>
              <span className="text-[10px] font-mono text-neutral-600 uppercase">{CHAIN_TYPE_LABELS[chain.type]}</span>
              <span className="text-[10px] text-neutral-600">({chain.items.length})</span>
              
              {/* Quick Controls */}
              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => updateChainAutomation(chain.id, { enabled: !chain.automation.enabled })}
                  className={`p-1 rounded transition-colors ${
                    chain.automation.enabled ? 'text-amber-500 bg-amber-500/10' : 'text-neutral-600 hover:text-neutral-400'
                  }`}
                  title="Automation"
                >
                  <Activity size={12} />
                </button>
                <button
                  onClick={() => setChains(prev => prev.map(c => c.id === chain.id ? { ...c, muted: !c.muted } : c))}
                  className={`p-1 rounded transition-colors ${
                    chain.muted ? 'text-red-500 bg-red-500/10' : 'text-neutral-600 hover:text-neutral-400'
                  }`}
                  title={chain.muted ? 'Unmute' : 'Mute'}
                >
                  {chain.muted ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
                <button
                  onClick={() => deleteChain(chain.id)}
                  className="p-1 text-neutral-600 hover:text-red-500 transition-colors"
                  title="Delete Chain"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>

            {/* Expanded Chain Content */}
            {expandedChains.has(chain.id) && (
              <div className="px-3 pb-3 space-y-3">
                {/* Chain Items (Draggable) */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-mono text-neutral-600 uppercase tracking-wider px-1">
                    <span>Chain Items</span>
                    <button
                      onClick={() => setShowPluginBrowser(true)}
                      className="flex items-center gap-1 text-brand hover:text-brand/80 transition-colors"
                    >
                      <Plus size={10} /> Add Plugin
                    </button>
                  </div>
                  
                  {chain.items.length === 0 ? (
                    <div className="text-xs text-neutral-700 italic px-2 py-2 border border-dashed border-neutral-800 rounded">
                      Drag plugins here to build your chain
                    </div>
                  ) : (
                    <div className="space-y-1">
                       {chain.items.map((item, _idx) => (
                        <div
                          key={item.id}
                          draggable
                          className="flex items-center gap-2 px-2 py-1.5 bg-neutral-800/50 rounded border border-neutral-800 hover:border-neutral-700 cursor-grab group"
                        >
                          <GripVertical size={10} className="text-neutral-700" />
                          <span className="text-xs text-neutral-400 flex-1 truncate">{item.pluginName}</span>
                          <button
                            onClick={() => setChains(prev => prev.map(c => {
                              if (c.id !== chain.id) return c;
                              return {
                                ...c,
                                items: c.items.map(i => i.id === item.id ? { ...i, bypass: !i.bypass } : i)
                              };
                            }))}
                            className={`p-1 rounded transition-colors ${item.bypass ? 'text-neutral-600' : 'text-emerald-500'}`}
                          >
                            {item.bypass ? <EyeOff size={10} /> : <Eye size={10} />}
                          </button>
                          <button
                            onClick={() => removePluginFromChain(chain.id, item.id)}
                            className="p-1 text-neutral-700 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Output Routing */}
                <div className="flex items-center gap-2 px-1">
                  <Send size={12} className="text-neutral-600" />
                  <span className="text-[10px] font-mono text-neutral-600 uppercase">Output</span>
                  <select
                    value={chain.outputSlot ?? ''}
                    onChange={e => routeChainToMixer(chain.id, e.target.value ? parseInt(e.target.value, 10) : -1)}
                    className="flex-1 bg-neutral-800 border border-neutral-700 text-xs text-neutral-300 rounded px-2 py-1"
                  >
                    <option value="">-- Select Mixer Channel --</option>
                    {Array.from({ length: 16 }, (_, i) => (
                      <option key={i} value={i}>Channel {i + 1}</option>
                    ))}
                  </select>
                </div>

                {/* Volume & Pan */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2">
                    <Volume2 size={12} className="text-neutral-600" />
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={chain.volume * 100}
                      onChange={e => setChains(prev => prev.map(c => c.id === chain.id ? { ...c, volume: parseInt(e.target.value, 10) / 100 } : c))}
                      className="flex-1 h-1 bg-neutral-800 rounded appearance-none accent-brand"
                    />
                    <span className="text-[10px] font-mono text-neutral-500 w-8">{Math.round(chain.volume * 100)}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Volume2 size={12} className="text-neutral-600" />
                    <input
                      type="range"
                      min={-100}
                      max={100}
                      value={chain.pan * 100}
                      onChange={e => setChains(prev => prev.map(c => c.id === chain.id ? { ...c, pan: parseInt(e.target.value, 10) / 100 } : c))}
                      className="flex-1 h-1 bg-neutral-800 rounded appearance-none accent-brand"
                    />
                    <span className="text-[10px] font-mono text-neutral-500 w-8">{Math.round(chain.pan * 100)}%</span>
                  </div>
                </div>

                {/* Automation Panel */}
                <div className="bg-neutral-950/50 rounded border border-neutral-800 p-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Activity size={12} className={chain.automation.enabled ? 'text-amber-500' : 'text-neutral-600'} />
                      <span className="text-[10px] font-bold text-neutral-500 uppercase">Fader Automation</span>
                    </div>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={chain.automation.enabled}
                        onChange={e => updateChainAutomation(chain.id, { enabled: e.target.checked })}
                        className="sr-only"
                      />
                      <div className={`w-6 h-3 rounded-full transition-colors ${chain.automation.enabled ? 'bg-amber-500' : 'bg-neutral-800'}`}>
                        <div className={`w-2 h-2 bg-white rounded-full mt-0.5 transition-transform ${chain.automation.enabled ? 'translate-x-3' : 'translate-x-0.5'}`} />
                      </div>
                    </label>
                  </div>
                  
                  {chain.automation.enabled && (
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div className="flex flex-col gap-1">
                        <span className="text-neutral-600 uppercase">Mode</span>
                        <select
                          value={chain.automation.mode}
                          onChange={e => updateChainAutomation(chain.id, { mode: e.target.value as ChainAutomation['mode'] })}
                          className="bg-neutral-800 border border-neutral-700 rounded px-1 py-0.5 text-neutral-400"
                        >
                          <option value="lfo">LFO</option>
                          <option value="envelope">Envelope</option>
                          <option value="pattern">Pattern</option>
                          <option value="random">Random</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-neutral-600 uppercase">Rate</span>
                        <input
                          type="range"
                          min={0.1}
                          max={10}
                          step={0.1}
                          value={chain.automation.rate}
                          onChange={e => updateChainAutomation(chain.id, { rate: parseFloat(e.target.value) })}
                          className="h-1 bg-neutral-800 rounded appearance-none accent-amber-500"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-neutral-600 uppercase">Depth</span>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.01}
                          value={chain.automation.depth}
                          onChange={e => updateChainAutomation(chain.id, { depth: parseFloat(e.target.value) })}
                          className="h-1 bg-neutral-800 rounded appearance-none accent-amber-500"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={chain.automation.sync}
                          onChange={e => updateChainAutomation(chain.id, { sync: e.target.checked })}
                          className="accent-amber-500"
                        />
                        <span className="text-neutral-500">Sync to BPM</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Plugin Browser Modal */}
      {showPluginBrowser && selectedChainId && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-neutral-900 rounded-lg border border-neutral-800 w-[500px] max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
              <h3 className="font-bold">Add Plugin to Chain</h3>
              <button onClick={() => setShowPluginBrowser(false)} className="text-neutral-500 hover:text-neutral-300">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {availablePlugins.length === 0 ? (
                <div className="text-center text-neutral-600 py-8">
                  <p className="text-sm">No plugins available</p>
                  <p className="text-xs mt-2">Scan for VST plugins first</p>
                </div>
              ) : (
                availablePlugins.map(plugin => (
                  <button
                    key={plugin.id}
                    onClick={() => { addPluginToChain(selectedChainId, plugin); setShowPluginBrowser(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-neutral-800 rounded text-left transition-colors"
                  >
                    <div className="w-2 h-2 rounded-full bg-brand/50" />
                    <span className="text-sm flex-1 truncate">{plugin.name}</span>
                    <span className="text-[10px] text-neutral-600">{plugin.vendor}</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-neutral-800 rounded text-neutral-500">{plugin.type}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* New Chain Modal */}
      {showNewChainModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-neutral-900 rounded-lg border border-neutral-800 w-[400px] p-4 space-y-4">
            <h3 className="font-bold text-lg">Create New Chain</h3>
            
            <div className="space-y-2">
              <label className="text-xs font-mono text-neutral-500 uppercase">Chain Name</label>
              <input
                type="text"
                value={newChainName}
                onChange={e => setNewChainName(e.target.value)}
                placeholder="e.g., Fat Bass Chain"
                className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-mono text-neutral-500 uppercase">Chain Type</label>
              <div className="grid grid-cols-3 gap-2">
                {(['instrument', 'effect', 'drums', 'bass', 'synth', 'pad', 'master'] as ChainType[]).map(type => (
                  <button
                    key={type}
                    onClick={() => setNewChainType(type)}
                    className={`px-2 py-2 rounded border text-xs font-bold uppercase transition-colors ${
                      newChainType === type
                        ? 'border-brand bg-brand/10 text-brand'
                        : 'border-neutral-800 text-neutral-500 hover:border-neutral-700'
                    }`}
                  >
                    {CHAIN_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={createChain}
                disabled={!newChainName.trim()}
                className="flex-1 py-2 bg-brand hover:opacity-90 text-white text-sm font-bold uppercase rounded transition-colors disabled:opacity-50"
              >
                Create Chain
              </button>
              <button
                onClick={() => setShowNewChainModal(false)}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 text-sm font-bold uppercase rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
