import React, { useState, useEffect, useCallback, useRef } from 'react';
import { STORAGE_KEYS } from '../lib/constants';
import { 
  Cpu, 
  Search, 
  RefreshCw, 
  Plus, 
  Settings, 
  ExternalLink, 
  Power, 
  Trash2,
  FolderOpen,
  CheckCircle2,
  AlertCircle,
  Loader2
} from 'lucide-react';
import {
  fetchPlugins,
  addPlugin,
  togglePlugin as apiTogglePlugin,
  deletePlugin as apiDeletePlugin,
  scanPluginsNative,
  isElectron,
  type Plugin,
  type VstScanResult,
} from '../lib/api';

const DEFAULT_PATHS = [
  'C:/Program Files/Common Files/VST3',
  'C:/Program Files/VSTPlugins',
];

const VST_OPTIONS_KEY = STORAGE_KEYS.VST_OPTIONS;

function loadVstOptions(): { scanOnStartup: boolean; sandboxMode: boolean; hiDpi: boolean } {
  try {
    const raw = localStorage.getItem(VST_OPTIONS_KEY);
    if (raw) return { scanOnStartup: true, sandboxMode: true, hiDpi: true, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { scanOnStartup: true, sandboxMode: true, hiDpi: true };
}

export function VSTManager() {
  const [searchQuery, setSearchQuery] = useState('');
  const [vstOptions, setVstOptions] = useState(loadVstOptions);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStatus, setScanStatus] = useState('');
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [paths, setPaths] = useState<string[]>(DEFAULT_PATHS);
  const [addingPath, setAddingPath] = useState(false);
  const [newPath, setNewPath] = useState('');
  const [_browserMode, _setBrowserMode] = useState(!isElectron());
  const [manualPluginName, setManualPluginName] = useState('');
  const [manualPluginVendor, setManualPluginVendor] = useState('');
  const [manualPluginType, setManualPluginType] = useState<'VST2' | 'VST3'>('VST3');
  const [manualPluginCategory, setManualPluginCategory] = useState('FX');
  const [showManualForm, setShowManualForm] = useState(false);
  const scanAbortRef = useRef(false);
  // Stable ref so the startup-scan effect can call handleScan without a dep cycle
  const handleScanRef = useRef<() => Promise<void>>(async () => {});

  const loadPlugins = useCallback(async () => {
    try {
      const data = await fetchPlugins();
      setPlugins(data);
    } catch {
      // keep empty on error
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadPlugins(); }, [loadPlugins]);

  // Persist vstOptions to localStorage on change
  useEffect(() => {
    try { localStorage.setItem(VST_OPTIONS_KEY, JSON.stringify(vstOptions)); } catch { /* ignore */ }
  }, [vstOptions]);

  // Auto-scan on mount when scanOnStartup is enabled
  useEffect(() => {
    if (vstOptions.scanOnStartup) {
      // Defer until after the initial plugin load settles
      const id = setTimeout(() => { void handleScanRef.current(); }, 500);
      return () => clearTimeout(id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScan = async () => {
    if (isScanning) return;
    scanAbortRef.current = false;
    setIsScanning(true);
    setScanProgress(0);
    setScanStatus('Scanning directories...');

    try {
      if (isElectron()) {
        // ── Real scan via Electron IPC + native VST3 addon ──
        setScanProgress(10);
        setScanStatus('Querying native VST host...');
        const rawResults: VstScanResult[] = await scanPluginsNative(paths);

        if (scanAbortRef.current) return;
        setScanProgress(50);
        setScanStatus(`Found ${rawResults.length} plugins. Persisting to database...`);

        // Persist newly found plugins to the server DB (skip duplicates by path)
        const existingPaths = new Set(plugins.map(p => p.path).filter(Boolean));
        let added = 0;
        for (let i = 0; i < rawResults.length; i++) {
          if (scanAbortRef.current) break;
          const r = rawResults[i];
          if (!existingPaths.has(r.path)) {
            try {
              await addPlugin({
                name: r.name,
                vendor: r.vendor || 'Unknown',
                type: r.type,
                category: r.category || 'FX',
                isEnabled: true,
                latency: 0,
                path: r.path,
              } as Omit<Plugin, 'id'>);
              added++;
            } catch {
              // skip if server rejects (e.g. duplicate)
            }
          }
          setScanProgress(50 + Math.round((i / rawResults.length) * 45));
        }

        setScanProgress(100);
        setScanStatus(`Done. ${added} new plugins added.`);
        await loadPlugins();
      } else {
        // ── Browser fallback: REST API scan (server-side filesystem walk) ──
        setScanStatus('Requesting server scan...');
        setScanProgress(20);
        const resp = await fetch('/api/plugins/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths }),
        });
        if (scanAbortRef.current) return;
        if (!resp.ok) throw new Error('Server scan failed');
        setScanProgress(80);
        if (scanAbortRef.current) return;
        await loadPlugins();
        setScanProgress(100);
        setScanStatus('Done.');
      }
    } catch (err) {
      setScanStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTimeout(() => {
        setIsScanning(false);
        setScanProgress(0);
        setScanStatus('');
      }, 2000);
    }
  };
  // Keep the ref pointing at the latest handleScan closure on every render
  handleScanRef.current = handleScan;

  const togglePlugin = async (id: string) => {
    const plugin = plugins.find(p => p.id === id);
    if (!plugin) return;
    const next = !plugin.isEnabled;
    setPlugins(prev => prev.map(p => p.id === id ? { ...p, isEnabled: next } : p));
    try {
      await apiTogglePlugin(id, next);
    } catch {
      setPlugins(prev => prev.map(p => p.id === id ? { ...p, isEnabled: plugin.isEnabled } : p));
    }
  };

  const removePlugin = async (id: string) => {
    const snapshot = plugins;
    setPlugins(prev => prev.filter(p => p.id !== id));
    try {
      await apiDeletePlugin(id);
    } catch {
      setPlugins(snapshot);
    }
  };

  const handleAddPath = () => {
    const trimmed = newPath.trim();
    if (trimmed && !paths.includes(trimmed)) {
      setPaths(prev => [...prev, trimmed]);
    }
    setNewPath('');
    setAddingPath(false);
  };

  const handleAddManualPlugin = async () => {
    if (!manualPluginName.trim()) return;
    
    try {
      const newPlugin: Omit<Plugin, 'id'> = {
        name: manualPluginName.trim(),
        vendor: manualPluginVendor.trim() || 'Unknown',
        type: manualPluginType,
        category: manualPluginCategory,
        isEnabled: true,
        latency: 0,
        path: `browser://${manualPluginName.toLowerCase().replace(/\s+/g, '-')}`,
      };
      
      await addPlugin(newPlugin);
      await loadPlugins();
      
      // Reset form
      setManualPluginName('');
      setManualPluginVendor('');
      setManualPluginType('VST3');
      setManualPluginCategory('FX');
      setShowManualForm(false);
    } catch (error) {
      console.error('Failed to add manual plugin:', error);
    }
  };

  const filteredPlugins = plugins.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.vendor.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex justify-between items-center bg-bg-surface p-4 rounded-xl border border-border-main shadow-lg">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-brand/20 rounded-lg flex items-center justify-center border border-brand/30">
            <Cpu className="text-brand" size={20} />
          </div>
           <div>
             <h2 className="text-sm font-bold text-neutral-200 uppercase tracking-widest">VST Plugin Manager</h2>
             <p className="text-[13px] text-neutral-500 font-mono uppercase">
               {isElectron() ? 'Native Host: VST 2.4 / 3.7 Active' : 'Browser Mode: UI Testing Only'}
             </p>
           </div>
        </div>

        <div className="flex items-center gap-3">
          {isScanning && (
            <div className="flex flex-col items-end gap-1 mr-4">
              <span className="text-xs font-mono text-brand uppercase">
                {scanStatus || `Scanning: ${scanProgress}%`}
              </span>
              <div className="w-40 h-1 bg-bg-main rounded-full overflow-hidden">
                <div className="h-full bg-brand transition-all duration-200" style={{ width: `${scanProgress}%` }}></div>
              </div>
            </div>
          )}
           <button 
             onClick={handleScan}
             disabled={isScanning}
             className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs uppercase transition-all ${
               isScanning ? 'bg-neutral-800 text-neutral-500' : 'bg-brand hover:opacity-90 text-white shadow-lg shadow-brand/20'
             }`}
           >
             <RefreshCw size={14} className={isScanning ? 'animate-spin' : ''} />
             {isScanning ? 'Scanning...' : isElectron() ? 'Scan for Plugins' : 'Test Server API'}
           </button>
        </div>
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Sidebar: Paths & Settings */}
        <div className="w-64 flex flex-col gap-4">
           <div className="bg-bg-surface rounded-xl border border-border-main p-4 flex flex-col gap-4 vignette">
             <div className="flex items-center justify-between">
               <span className="text-[13px] font-bold text-neutral-500 uppercase tracking-widest">
                 {isElectron() ? 'Plugin Paths' : 'Browser Mode'}
               </span>
               <Settings size={12} className="text-neutral-600" />
             </div>
             
             {!isElectron() && (
               <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mb-2">
                 <div className="flex items-center gap-2 mb-1">
                   <AlertCircle size={12} className="text-amber-500" />
                   <span className="text-[13px] font-bold text-amber-500 uppercase">Browser Mode Active</span>
                 </div>
                 <p className="text-xs text-amber-600">
                   Real VST processing requires Electron. You can add manual plugins for UI testing.
                 </p>
               </div>
             )}
             
             <div className="flex flex-col gap-2">
              {paths.map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-[13px] text-neutral-400 bg-bg-main p-2 rounded border border-border-main group">
                  <FolderOpen size={12} className="text-neutral-600 shrink-0" />
                  <span className="truncate flex-1" title={p}>{p}</span>
                  <button
                    onClick={() => setPaths(prev => prev.filter((_, j) => j !== i))}
                    className="opacity-0 group-hover:opacity-100 text-neutral-600 hover:text-red-400 transition-all"
                    title="Remove path"
                  >
                    ×
                  </button>
                </div>
              ))}
              {addingPath ? (
                <div className="flex gap-1">
                  <input
                    autoFocus
                    value={newPath}
                    onChange={e => setNewPath(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddPath(); if (e.key === 'Escape') { setAddingPath(false); setNewPath(''); } }}
                    placeholder="C:/Program Files/..."
                    className="flex-1 bg-bg-main border border-brand/50 rounded px-2 py-1 text-[13px] text-neutral-300 outline-none"
                  />
                   <button onClick={handleAddPath} className="text-[13px] px-2 py-1 rounded bg-brand/20 text-brand border border-brand/30 hover:bg-brand/30 transition-colors">
                    Add
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingPath(true)}
                  className="flex items-center justify-center gap-2 w-full py-2 border border-dashed border-neutral-700 rounded-lg text-[13px] text-neutral-500 hover:border-brand/50 hover:text-brand transition-all"
                >
                  <Plus size={12} /> Add Path
                </button>
              )}
            </div>
          </div>

          <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-4 flex flex-col gap-3 vignette">
            <span className="text-[13px] font-bold text-neutral-500 uppercase tracking-widest">Options</span>
            <div className="flex flex-col gap-2">
              <label className="flex items-center justify-between p-2 bg-neutral-950 rounded border border-neutral-800 cursor-pointer">
                <span className="text-[13px] text-neutral-400">Scan on Startup</span>
                <input type="checkbox" className="accent-blue-500"
                  checked={vstOptions.scanOnStartup}
                  onChange={e => setVstOptions(prev => ({ ...prev, scanOnStartup: e.target.checked }))} />
              </label>
              <label className="flex items-center justify-between p-2 bg-neutral-950 rounded border border-neutral-800 cursor-pointer">
                <span className="text-[13px] text-neutral-400">Sandbox Mode</span>
                <input type="checkbox" className="accent-blue-500"
                  checked={vstOptions.sandboxMode}
                  onChange={e => setVstOptions(prev => ({ ...prev, sandboxMode: e.target.checked }))} />
              </label>
              <label className="flex items-center justify-between p-2 bg-neutral-950 rounded border border-neutral-800 cursor-pointer">
                <span className="text-[13px] text-neutral-400">HiDPI Support</span>
                <input type="checkbox" className="accent-blue-500"
                  checked={vstOptions.hiDpi}
                  onChange={e => setVstOptions(prev => ({ ...prev, hiDpi: e.target.checked }))} />
              </label>
            </div>
             {isElectron() ? (
               <div className="flex items-center gap-1.5 mt-1">
                 <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 dot-glow"></div>
                 <span className="text-xs font-mono text-emerald-600 uppercase">Native host active</span>
               </div>
             ) : (
               <div className="flex items-center gap-1.5 mt-1">
                 <div className="w-1.5 h-1.5 rounded-full bg-amber-500 dot-glow"></div>
                 <span className="text-xs font-mono text-amber-600 uppercase">Browser mode</span>
               </div>
             )}
          </div>
        </div>

        {/* Main Content: Plugin List */}
        <div className="flex-1 flex flex-col bg-neutral-900 rounded-xl border border-neutral-800 overflow-hidden vignette">
          <div className="p-4 border-b border-neutral-800 flex items-center gap-4 relative edge-glow-bottom">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600" size={16} />
              <input 
                type="text" 
                placeholder="Search plugins by name, vendor, or type..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-10 py-2 text-sm outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 size={28} className="animate-spin text-neutral-600" />
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-neutral-900 z-10">
                  <tr className="border-b border-neutral-800">
                    <th className="px-6 py-3 text-[13px] font-bold text-neutral-500 uppercase tracking-widest">Status</th>
                    <th className="px-6 py-3 text-[13px] font-bold text-neutral-500 uppercase tracking-widest">Plugin Name</th>
                    <th className="px-6 py-3 text-[13px] font-bold text-neutral-500 uppercase tracking-widest">Vendor</th>
                    <th className="px-6 py-3 text-[13px] font-bold text-neutral-500 uppercase tracking-widest">Type</th>
                    <th className="px-6 py-3 text-[13px] font-bold text-neutral-500 uppercase tracking-widest">Category</th>
                    <th className="px-6 py-3 text-[13px] font-bold text-neutral-500 uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPlugins.map(plugin => (
                    <tr key={plugin.id} className="border-b border-neutral-800/50 hover:bg-neutral-800/30 transition-colors group">
                      <td className="px-6 py-4">
                        <button 
                          onClick={() => togglePlugin(plugin.id)}
                          className={`p-1.5 rounded-full transition-all ${
                            plugin.isEnabled ? 'bg-emerald-500/10 text-emerald-500' : 'bg-neutral-800 text-neutral-600'
                          }`}
                        >
                          <Power size={14} />
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-neutral-200">{plugin.name}</span>
                          {plugin.latency > 0 && (
                            <span className="text-xs text-amber-500 font-mono">Latency: {plugin.latency} samples</span>
                          )}
                          {plugin.path && (
                            <span className="text-xs text-neutral-700 font-mono truncate max-w-50" title={plugin.path}>
                              {plugin.path}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs text-neutral-400">{plugin.vendor}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase border ${
                          plugin.type === 'VST3' ? 'border-blue-500/30 text-blue-500 bg-blue-500/5' : 'border-neutral-700 text-neutral-500 bg-neutral-800'
                        }`}>
                          {plugin.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-neutral-500">{plugin.category}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => {
                              if (window.vstBridge && 'openGui' in window.vstBridge) {
                                (window.vstBridge as unknown as { openGui: (path: string) => void }).openGui(plugin.path ?? '');
                              }
                            }}
                            disabled={!isElectron() || !plugin.path}
                            className="p-1.5 hover:text-blue-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title={isElectron() ? 'Open GUI' : 'Open GUI (Electron only)'}
                          ><ExternalLink size={14} /></button>
                          <button onClick={() => removePlugin(plugin.id)} className="p-1.5 hover:text-red-500 transition-colors" title="Remove"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {!isLoading && filteredPlugins.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-neutral-600 gap-4">
                <Cpu size={48} className="opacity-20" />
                <p className="text-sm font-bold uppercase tracking-widest">No Plugins Found</p>
                
                {!isElectron() ? (
                  <div className="flex flex-col items-center gap-4 max-w-md">
                    <p className="text-[13px] text-neutral-700 text-center">
                      Run in Electron to scan real VST3 plugins from disk, or add plugins manually for browser testing.
                    </p>
                    
                    {!showManualForm ? (
                      <button
                        onClick={() => setShowManualForm(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-brand/10 hover:bg-brand/20 text-brand text-sm font-bold uppercase rounded-lg border border-brand/30 transition-colors"
                      >
                        <Plus size={12} /> Add Plugin Manually
                      </button>
                    ) : (
                      <div className="w-full bg-neutral-950/50 p-4 rounded-lg border border-neutral-800 flex flex-col gap-3 noise-texture relative">
                        <div className="flex flex-col gap-1">
                          <label className="text-[13px] font-mono text-neutral-500 uppercase">Plugin Name *</label>
                          <input
                            type="text"
                            value={manualPluginName}
                            onChange={(e) => setManualPluginName(e.target.value)}
                            className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm text-neutral-300 outline-none focus:border-brand"
                            placeholder="e.g., Reverb Pro"
                          />
                        </div>
                        
                        <div className="flex flex-col gap-1">
                          <label className="text-[13px] font-mono text-neutral-500 uppercase">Vendor</label>
                          <input
                            type="text"
                            value={manualPluginVendor}
                            onChange={(e) => setManualPluginVendor(e.target.value)}
                            className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm text-neutral-300 outline-none focus:border-brand"
                            placeholder="e.g., TBM Audio"
                          />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1">
                            <label className="text-[13px] font-mono text-neutral-500 uppercase">Type</label>
                            <select
                              value={manualPluginType}
                              onChange={(e) => setManualPluginType(e.target.value as 'VST2' | 'VST3')}
                              className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm text-neutral-300 outline-none focus:border-brand"
                            >
                              <option value="VST3">VST3</option>
                              <option value="VST2">VST2</option>
                            </select>
                          </div>
                          
                          <div className="flex flex-col gap-1">
                            <label className="text-[13px] font-mono text-neutral-500 uppercase">Category</label>
                            <select
                              value={manualPluginCategory}
                              onChange={(e) => setManualPluginCategory(e.target.value)}
                              className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm text-neutral-300 outline-none focus:border-brand"
                            >
                              <option value="FX">FX</option>
                              <option value="Instrument">Instrument</option>
                              <option value="Generator">Generator</option>
                              <option value="Analyzer">Analyzer</option>
                            </select>
                          </div>
                        </div>
                        
                        <div className="flex gap-2 pt-2">
                          <button
                            onClick={handleAddManualPlugin}
                            disabled={!manualPluginName.trim()}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-brand hover:opacity-90 text-white text-sm font-bold uppercase rounded-lg transition-all shadow-lg shadow-brand/20 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Plus size={12} /> Add Plugin
                          </button>
                          <button
                            onClick={() => setShowManualForm(false)}
                            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 text-sm font-bold uppercase rounded-lg transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                    
                    <div className="text-xs text-neutral-700 text-center mt-2">
                      Manual plugins are for testing UI only. Real audio processing requires Electron.
                    </div>
                  </div>
                ) : (
                  <p className="text-[13px] text-neutral-700 text-center max-w-48">
                    Click &ldquo;Scan for Plugins&rdquo; to search your system for VST plugins
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Status Bar */}
          <div className="p-3 bg-neutral-950 border-t border-neutral-800 separator-glow flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 size={12} className="text-emerald-500" />
                <span className="text-[13px] font-mono text-neutral-500 uppercase">{plugins.filter(p => p.isEnabled).length} Active</span>
              </div>
              <div className="flex items-center gap-1.5">
                <AlertCircle size={12} className="text-neutral-600" />
                <span className="text-[13px] font-mono text-neutral-500 uppercase">{plugins.filter(p => !p.isEnabled).length} Disabled</span>
              </div>
            </div>
            <div className="text-[13px] font-mono text-neutral-600 uppercase">
              Total: {plugins.length} plugins
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
