import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { fetchPlugins, togglePlugin as apiTogglePlugin, deletePlugin as apiDeletePlugin, type Plugin } from '../lib/api';

export function VSTManager() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Clean up any in-progress scan on unmount
  useEffect(() => {
    return () => { if (scanIntervalRef.current !== null) clearInterval(scanIntervalRef.current); };
  }, []);

  const handleScan = () => {
    if (scanIntervalRef.current !== null) clearInterval(scanIntervalRef.current);
    setIsScanning(true);
    setScanProgress(0);
    scanIntervalRef.current = setInterval(() => {
      setScanProgress(prev => {
        if (prev >= 100) {
          if (scanIntervalRef.current !== null) clearInterval(scanIntervalRef.current);
          scanIntervalRef.current = null;
          setIsScanning(false);
          loadPlugins();
          return 100;
        }
        return prev + 5;
      });
    }, 100);
  };

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
            <p className="text-[10px] text-neutral-500 font-mono uppercase">Hosting Engine: VST 2.4 / 3.7 Compatible</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isScanning && (
            <div className="flex flex-col items-end gap-1 mr-4">
              <span className="text-[9px] font-mono text-brand uppercase">Scanning: {scanProgress}%</span>
              <div className="w-32 h-1 bg-bg-main rounded-full overflow-hidden">
                <div className="h-full bg-brand transition-all duration-100" style={{ width: `${scanProgress}%` }}></div>
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
            {isScanning ? 'Scanning...' : 'Scan for Plugins'}
          </button>
        </div>
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Sidebar: Paths & Settings */}
        <div className="w-64 flex flex-col gap-4">
          <div className="bg-bg-surface rounded-xl border border-border-main p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Plugin Paths</span>
              <Settings size={12} className="text-neutral-600" />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-[10px] text-neutral-400 bg-bg-main p-2 rounded border border-border-main">
                <FolderOpen size={12} className="text-neutral-600" />
                <span className="truncate">C:/Program Files/VSTPlugins</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-neutral-400 bg-bg-main p-2 rounded border border-border-main">
                <FolderOpen size={12} className="text-neutral-600" />
                <span className="truncate">C:/Program Files/Common Files/VST3</span>
              </div>
              <button className="flex items-center justify-center gap-2 w-full py-2 border border-dashed border-neutral-700 rounded-lg text-[10px] text-neutral-500 hover:border-brand/50 hover:text-brand transition-all">
                <Plus size={12} /> Add Path
              </button>
            </div>
          </div>

          <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-4 flex flex-col gap-3">
            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Options</span>
            <div className="flex flex-col gap-2">
              <label className="flex items-center justify-between p-2 bg-neutral-950 rounded border border-neutral-800 cursor-pointer">
                <span className="text-[10px] text-neutral-400">Scan on Startup</span>
                <input type="checkbox" className="accent-blue-500" defaultChecked />
              </label>
              <label className="flex items-center justify-between p-2 bg-neutral-950 rounded border border-neutral-800 cursor-pointer">
                <span className="text-[10px] text-neutral-400">Sandbox Mode</span>
                <input type="checkbox" className="accent-blue-500" defaultChecked />
              </label>
              <label className="flex items-center justify-between p-2 bg-neutral-950 rounded border border-neutral-800 cursor-pointer">
                <span className="text-[10px] text-neutral-400">HiDPI Support</span>
                <input type="checkbox" className="accent-blue-500" defaultChecked />
              </label>
            </div>
          </div>
        </div>

        {/* Main Content: Plugin List */}
        <div className="flex-1 flex flex-col bg-neutral-900 rounded-xl border border-neutral-800 overflow-hidden">
          <div className="p-4 border-b border-neutral-800 flex items-center gap-4">
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
                    <th className="px-6 py-3 text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Status</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Plugin Name</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Vendor</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Type</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Category</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-neutral-500 uppercase tracking-widest text-right">Actions</th>
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
                            <span className="text-[9px] text-amber-500 font-mono">Latency: {plugin.latency} samples</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs text-neutral-400">{plugin.vendor}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${
                          plugin.type === 'VST3' ? 'border-blue-500/30 text-blue-500 bg-blue-500/5' : 'border-neutral-700 text-neutral-500 bg-neutral-800'
                        }`}>
                          {plugin.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-neutral-500">{plugin.category}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button className="p-1.5 hover:text-blue-500 transition-colors" title="Open GUI"><ExternalLink size={14} /></button>
                          <button onClick={() => removePlugin(plugin.id)} className="p-1.5 hover:text-red-500 transition-colors" title="Remove"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {!isLoading && filteredPlugins.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-neutral-600 gap-4">
                <Cpu size={48} className="opacity-20" />
                <p className="text-sm font-bold uppercase tracking-widest">No Plugins Found</p>
              </div>
            )}
          </div>

          {/* Status Bar */}
          <div className="p-3 bg-neutral-950 border-t border-neutral-800 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 size={12} className="text-emerald-500" />
                <span className="text-[10px] font-mono text-neutral-500 uppercase">{plugins.filter(p => p.isEnabled).length} Active</span>
              </div>
              <div className="flex items-center gap-1.5">
                <AlertCircle size={12} className="text-neutral-600" />
                <span className="text-[10px] font-mono text-neutral-500 uppercase">{plugins.filter(p => !p.isEnabled).length} Disabled</span>
              </div>
            </div>
            <div className="text-[10px] font-mono text-neutral-600 uppercase">
              Total: {plugins.length} plugins
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

