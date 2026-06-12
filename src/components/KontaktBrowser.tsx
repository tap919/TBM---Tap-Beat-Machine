import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Library, 
  Search, 
  HardDrive, 
  Star, 
  Clock, 
  Filter, 
  ChevronRight,
  Database,
  RefreshCw,
  Plus,
  FileCode,
  Loader2,
  Play,
  Square
} from 'lucide-react';
import {
  fetchLibraries,
  toggleLibraryFavorite,
  type SampleLibrary,
} from '../lib/api';
import { useTBMAudio } from '../contexts/TBMAudioContext';

export function KontaktBrowser() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [isScanning, setIsScanning] = useState(false);
  const [libraries, setLibraries] = useState<SampleLibrary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [addingPath, setAddingPath] = useState(false);
  const [newPathValue, setNewPathValue] = useState('');
  const [scanPaths, setScanPaths] = useState<string[]>(['D:/Sample Libraries', 'E:/Sample Libraries']);
  const [filterMode, setFilterMode] = useState<'all' | 'favorites' | 'recent'>('all');
  const [recentlyUsed, setRecentlyUsed] = useState<string[]>([]);

  const { engine, resumeAudio } = useTBMAudio();
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const categories = [
    "All",
    "Pianos & Keys",
    "Strings",
    "Brass",
    "Woodwinds",
    "Orchestral",
    "Guitars",
    "Bass",
    "Drums & Percussion",
    "Synths",
    "Pads",
    "Sound Design",
    "World & Ethnic",
    "Choir & Vocals",
    "Organs",
    "Bowed"
  ];

  const loadLibraries = useCallback(async () => {
    try {
      const data = await fetchLibraries();
      setLibraries(data);
    } catch {
      // keep empty on error
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadLibraries(); }, [loadLibraries]);

  // Stop any playing preview when the component unmounts
  useEffect(() => {
    return () => {
      try { previewSourceRef.current?.stop(); } catch { /* already stopped */ }
      previewSourceRef.current = null;
    };
  }, []);

  const handleScan = async () => {
    setIsScanning(true);
    await loadLibraries();
    setTimeout(() => setIsScanning(false), 600);
  };

  const handleToggleFavorite = async (lib: SampleLibrary) => {
    const next = !lib.isFavorite;
    setLibraries(prev => prev.map(l => l.id === lib.id ? { ...l, isFavorite: next } : l));
    try {
      await toggleLibraryFavorite(lib.id, next);
    } catch {
      setLibraries(prev => prev.map(l => l.id === lib.id ? { ...l, isFavorite: lib.isFavorite } : l));
    }
  };

  // Track recently used libraries (by id). Capped at 10.
  const markRecentlyUsed = useCallback((libId: string) => {
    setRecentlyUsed(prev => {
      const next = [libId, ...prev.filter(id => id !== libId)];
      return next.slice(0, 10);
    });
  }, []);

  /** Preview a library's sample via the engine. Loads from /api/libraries/:id/preview. */
  const handlePreview = useCallback(async (lib: SampleLibrary) => {
    if (!engine) return;
    await resumeAudio();

    // If already previewing this library, stop it
    if (previewingId === lib.id) {
      try {
        previewSourceRef.current?.stop();
        previewSourceRef.current?.disconnect();
      } catch (_e) { /* */ }
      previewSourceRef.current = null;
      setPreviewingId(null);
      return;
    }

    // Stop any currently playing preview
    try {
      previewSourceRef.current?.stop();
      previewSourceRef.current?.disconnect();
    } catch (_e) { /* */ }
    previewSourceRef.current = null;

    setPreviewingId(lib.id);
    markRecentlyUsed(lib.id);

    try {
      // Load via the engine's loadSample (fetches URL → decodes → stores in sample map)
      const previewUrl = `/api/libraries/${lib.id}/preview`;
      await engine.loadSample(lib.id, previewUrl);

      // Play it as a one-shot through the engine's master chain
      const ctx = engine.getContext();
      const source = ctx.createBufferSource();
      // getAnalyserData uses the engine's internal samples map; we need to trigger
      // through a simple source → masterGain path for preview
      const samples = engine.getSamples();
      const buffer = samples.get(lib.id);
      if (!buffer) { setPreviewingId(null); return; }

      source.buffer = buffer;
      source.connect(engine.masterGain);
      source.start();
      previewSourceRef.current = source;

      source.addEventListener('ended', () => {
        if (previewSourceRef.current === source) {
          previewSourceRef.current = null;
          setPreviewingId(null);
        }
        try { source.disconnect(); } catch (_e) { /* */ }
      }, { once: true });
    } catch (err) {
      console.error('[KontaktBrowser] Preview failed:', err);
      setPreviewingId(null);
    }
  }, [engine, resumeAudio, previewingId, markRecentlyUsed]);

  const filteredLibraries = libraries.filter(lib => {
    const matchesSearch = lib.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         lib.vendor.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === 'All' || lib.category === activeCategory;
    const matchesFilter = filterMode === 'all'
      || (filterMode === 'favorites' && lib.isFavorite)
      || (filterMode === 'recent' && recentlyUsed.includes(lib.id));
    return matchesSearch && matchesCategory && matchesFilter;
  });

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex justify-between items-center bg-bg-surface p-4 rounded-xl border border-border-main shadow-lg relative edge-glow-bottom">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-brand/20 rounded-lg flex items-center justify-center border border-brand/30">
            <Library className="text-brand" size={20} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-neutral-200 uppercase tracking-widest">Sample Library Manager</h2>
            <p className="text-[13px] text-neutral-500 font-mono uppercase">Engine: TBM Sample Engine v7.0.0</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-bg-main px-3 py-1.5 rounded-lg border border-border-main">
            <Database size={14} className="text-neutral-600" />
            <span className="text-[13px] font-mono text-neutral-400">DB Status: <span className="text-emerald-500">Optimized</span></span>
          </div>
          <button 
            onClick={handleScan}
            disabled={isScanning}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs uppercase transition-all ${
              isScanning ? 'bg-neutral-800 text-neutral-500' : 'bg-brand hover:opacity-90 text-white shadow-lg shadow-brand/20'
            }`}
          >
            <RefreshCw size={14} className={isScanning ? 'animate-spin' : ''} />
            {isScanning ? 'Scanning...' : 'Scan Libraries'}
          </button>
        </div>
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Sidebar: Categories & Paths */}
        <div className="w-64 flex flex-col gap-4">
          <div className="flex-1 bg-neutral-900 rounded-xl border border-neutral-800 p-4 flex flex-col gap-4 overflow-hidden vignette">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold text-neutral-500 uppercase tracking-widest">Categories</span>
              <Filter size={12} className="text-neutral-600" />
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-1">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all ${
                    activeCategory === cat 
                      ? 'bg-brand text-white font-bold shadow-md' 
                      : 'text-neutral-400 hover:bg-bg-main hover:text-neutral-200'
                  }`}
                >
                  <span>{cat}</span>
                  {activeCategory === cat && <ChevronRight size={12} />}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-4 flex flex-col gap-3 vignette">
            <span className="text-[13px] font-bold text-neutral-500 uppercase tracking-widest">Library Paths</span>
            <div className="flex flex-col gap-2">
              {scanPaths.map((path, idx) => (
                <div key={idx} className="flex items-center gap-2 text-[13px] text-neutral-400 bg-neutral-950 p-2 rounded border border-neutral-800">
                  <HardDrive size={12} className="text-neutral-600" />
                  <span className="truncate">{path}</span>
                </div>
              ))}
              {addingPath ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const trimmed = newPathValue.trim();
                    if (trimmed && !scanPaths.includes(trimmed)) {
                      setScanPaths(prev => [...prev, trimmed]);
                    }
                    setNewPathValue('');
                    setAddingPath(false);
                  }}
                  className="flex items-center gap-1"
                >
                  <input
                    autoFocus
                    type="text"
                    value={newPathValue}
                    onChange={(e) => setNewPathValue(e.target.value)}
                    placeholder="/path/to/samples"
                    className="flex-1 bg-neutral-950 border border-red-500/50 rounded px-2 py-1.5 text-[13px] text-neutral-300 outline-none"
                    onKeyDown={(e) => { if (e.key === 'Escape') { setAddingPath(false); setNewPathValue(''); } }}
                  />
                  <button type="submit" className="text-xs font-bold text-red-500 uppercase px-1">Add</button>
                </form>
              ) : (
                <button
                  onClick={() => setAddingPath(true)}
                  className="flex items-center justify-center gap-2 w-full py-2 border border-dashed border-neutral-700 rounded-lg text-[13px] text-neutral-500 hover:border-red-500/50 hover:text-red-500 transition-all"
                >
                  <Plus size={12} /> Add Path
                </button>
              )}
            </div>
          </div>

          <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-4 flex flex-col gap-3 vignette">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold text-neutral-500 uppercase tracking-widest">Recent</span>
              <Clock size={12} className="text-neutral-600" />
            </div>
            <div className="flex flex-col gap-2">
              {libraries.filter(l => recentlyUsed.includes(l.id)).slice(0, 4).map(lib => (
                <div
                  key={lib.id}
                  onClick={() => { markRecentlyUsed(lib.id); handlePreview(lib); }}
                  className="text-[13px] text-neutral-400 bg-neutral-950 p-2 rounded border border-neutral-800 hover:text-red-500 cursor-pointer transition-colors truncate"
                >
                  {lib.name}
                </div>
              ))}
              {recentlyUsed.length === 0 && (
                <span className="text-xs text-neutral-600 font-mono">No recent instruments</span>
              )}
            </div>
          </div>
        </div>

        {/* Main Content: Library Grid */}
        <div className="flex-1 flex flex-col gap-4 bg-neutral-900 rounded-xl border border-neutral-800 p-4 overflow-hidden vignette">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600" size={16} />
              <input 
                type="text" 
                placeholder="Search instruments, vendors, or tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-10 py-2.5 text-sm outline-none focus:border-red-500 transition-colors"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setFilterMode(prev => prev === 'favorites' ? 'all' : 'favorites')}
                className={`p-2.5 bg-neutral-950 border rounded-xl transition-colors ${
                  filterMode === 'favorites' ? 'border-yellow-500 text-yellow-500' : 'border-neutral-800 text-neutral-400 hover:text-white'
                }`}
                title={filterMode === 'favorites' ? 'Show all' : 'Show favorites only'}
              >
                <Star size={18} className={filterMode === 'favorites' ? 'fill-yellow-500' : ''} />
              </button>
              <button
                onClick={() => setFilterMode(prev => prev === 'recent' ? 'all' : 'recent')}
                className={`p-2.5 bg-neutral-950 border rounded-xl transition-colors ${
                  filterMode === 'recent' ? 'border-red-500 text-red-500' : 'border-neutral-800 text-neutral-400 hover:text-white'
                }`}
                title={filterMode === 'recent' ? 'Show all' : 'Show recently used'}
              >
                <Clock size={18} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
            {isLoading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 size={28} className="animate-spin text-neutral-600" />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredLibraries.map(lib => (
                  <div 
                    key={lib.id}
                    className="group bg-neutral-950 rounded-xl border border-neutral-800 p-4 hover:border-red-500/50 transition-all cursor-pointer relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 p-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); handlePreview(lib); }}
                        className={`p-1 transition-colors ${previewingId === lib.id ? 'text-red-400' : 'hover:text-emerald-400'}`}
                        title={previewingId === lib.id ? 'Stop preview' : 'Preview'}
                      >
                        {previewingId === lib.id ? <Square size={14} /> : <Play size={14} />}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggleFavorite(lib); }}
                        className="p-1 hover:text-yellow-400"
                        title={lib.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <Star size={14} className={lib.isFavorite ? 'fill-yellow-500 text-yellow-500' : ''} />
                      </button>
                    </div>
                    
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 bg-neutral-900 rounded-lg flex items-center justify-center border border-neutral-800 group-hover:border-red-500/30 transition-colors">
                        <FileCode size={24} className="text-neutral-700 group-hover:text-red-500/50 transition-colors" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-xs font-bold text-neutral-200 truncate group-hover:text-red-500 transition-colors">{lib.name}</h3>
                        <p className="text-[13px] text-neutral-500 font-mono uppercase mt-0.5">{lib.vendor}</p>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-neutral-900 separator-glow flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-xs text-neutral-600 uppercase font-bold tracking-tighter">Instruments</span>
                        <span className="text-sm font-mono text-neutral-400">{lib.instruments}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-xs text-neutral-600 uppercase font-bold tracking-tighter">Size</span>
                        <span className="text-sm font-mono text-neutral-400">{lib.size}</span>
                      </div>
                    </div>

                    {lib.isFavorite && (
                      <div className="absolute bottom-0 right-0 p-1">
                        <Star size={10} className="text-yellow-500 fill-yellow-500" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!isLoading && filteredLibraries.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-neutral-600 gap-4 py-20">
                <Library size={48} className="opacity-20" />
                <div className="text-center">
                  <p className="text-sm font-bold uppercase tracking-widest">No Libraries Found</p>
                  <p className="text-xs mt-1">Try adjusting your search or category filter</p>
                </div>
              </div>
            )}
          </div>

          {/* Status Bar */}
          <div className="mt-auto pt-4 border-t border-neutral-800 separator-glow flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-[13px] font-mono text-neutral-500 uppercase">Total: {libraries.length} Libraries</span>
              <span className="text-[13px] font-mono text-neutral-500 uppercase">Filtered: {filteredLibraries.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-mono text-neutral-500 uppercase">Supported Formats: .nki, .nkx, .nkm, .nicnt</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

