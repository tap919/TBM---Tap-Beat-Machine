import React, { useState } from 'react';
import { 
  Library, 
  Search, 
  Folder, 
  HardDrive, 
  Star, 
  Clock, 
  Filter, 
  MoreVertical,
  ChevronRight,
  Database,
  RefreshCw,
  Plus,
  FileCode
} from 'lucide-react';

interface SampleLibrary {
  id: string;
  name: string;
  vendor: string;
  category: string;
  size: string;
  instruments: number;
  isFavorite: boolean;
}

export function KontaktBrowser() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [isScanning, setIsScanning] = useState(false);

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

  const mockLibraries: SampleLibrary[] = [
    { id: '1', name: 'The Giant', vendor: 'TBM Instruments', category: 'Pianos & Keys', size: '3.9 GB', instruments: 2, isFavorite: true },
    { id: '2', name: 'Session Strings Pro 2', vendor: 'TBM Instruments', category: 'Strings', size: '32.1 GB', instruments: 24, isFavorite: false },
    { id: '3', name: 'Action Strikes', vendor: 'TBM Instruments', category: 'Drums & Percussion', size: '3.2 GB', instruments: 12, isFavorite: true },
    { id: '4', name: 'Damage 2', vendor: 'TBM Instruments', category: 'Drums & Percussion', size: '60.5 GB', instruments: 48, isFavorite: true },
    { id: '5', name: 'Exhale', vendor: 'TBM Instruments', category: 'Choir & Vocals', size: '9.2 GB', instruments: 500, isFavorite: false },
    { id: '6', name: 'Straylight', vendor: 'TBM Instruments', category: 'Sound Design', size: '2.4 GB', instruments: 380, isFavorite: false },
    { id: '7', name: 'Pharlight', vendor: 'TBM Instruments', category: 'Sound Design', size: '1.2 GB', instruments: 350, isFavorite: false },
  ];

  const handleScan = () => {
    setIsScanning(true);
    setTimeout(() => setIsScanning(false), 2000);
  };

  const filteredLibraries = mockLibraries.filter(lib => {
    const matchesSearch = lib.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         lib.vendor.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === 'All' || lib.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex justify-between items-center bg-bg-surface p-4 rounded-xl border border-border-main shadow-lg">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-brand/20 rounded-lg flex items-center justify-center border border-brand/30">
            <Library className="text-brand" size={20} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-neutral-200 uppercase tracking-widest">Sample Library Manager</h2>
            <p className="text-[10px] text-neutral-500 font-mono uppercase">Engine: TBM Sample Engine v7.0.0</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-bg-main px-3 py-1.5 rounded-lg border border-border-main">
            <Database size={14} className="text-neutral-600" />
            <span className="text-[10px] font-mono text-neutral-400">DB Status: <span className="text-emerald-500">Optimized</span></span>
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
          <div className="flex-1 bg-neutral-900 rounded-xl border border-neutral-800 p-4 flex flex-col gap-4 overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Categories</span>
              <Filter size={12} className="text-neutral-600" />
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-1">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-[11px] transition-all ${
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

          <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-4 flex flex-col gap-3">
            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Library Paths</span>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-[10px] text-neutral-400 bg-neutral-950 p-2 rounded border border-neutral-800">
                <HardDrive size={12} className="text-neutral-600" />
                <span className="truncate">D:/Sample Libraries</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-neutral-400 bg-neutral-950 p-2 rounded border border-neutral-800">
                <HardDrive size={12} className="text-neutral-600" />
                <span className="truncate">E:/Sample Libraries</span>
              </div>
              <button className="flex items-center justify-center gap-2 w-full py-2 border border-dashed border-neutral-700 rounded-lg text-[10px] text-neutral-500 hover:border-red-500/50 hover:text-red-500 transition-all">
                <Plus size={12} /> Add Path
              </button>
            </div>
          </div>

          <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Recent</span>
              <Clock size={12} className="text-neutral-600" />
            </div>
            <div className="flex flex-col gap-2">
              <div className="text-[10px] text-neutral-400 bg-neutral-950 p-2 rounded border border-neutral-800 hover:text-red-500 cursor-pointer transition-colors">
                The Giant
              </div>
              <div className="text-[10px] text-neutral-400 bg-neutral-950 p-2 rounded border border-neutral-800 hover:text-red-500 cursor-pointer transition-colors">
                Damage 2
              </div>
            </div>
          </div>
        </div>

        {/* Main Content: Library Grid */}
        <div className="flex-1 flex flex-col gap-4 bg-neutral-900 rounded-xl border border-neutral-800 p-4 overflow-hidden">
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
              <button className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-neutral-400 hover:text-white transition-colors">
                <Star size={18} />
              </button>
              <button className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-neutral-400 hover:text-white transition-colors">
                <Clock size={18} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredLibraries.map(lib => (
                <div 
                  key={lib.id}
                  className="group bg-neutral-950 rounded-xl border border-neutral-800 p-4 hover:border-red-500/50 transition-all cursor-pointer relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-1 hover:text-red-500"><MoreVertical size={14} /></button>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 bg-neutral-900 rounded-lg flex items-center justify-center border border-neutral-800 group-hover:border-red-500/30 transition-colors">
                      <FileCode size={24} className="text-neutral-700 group-hover:text-red-500/50 transition-colors" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xs font-bold text-neutral-200 truncate group-hover:text-red-500 transition-colors">{lib.name}</h3>
                      <p className="text-[10px] text-neutral-500 font-mono uppercase mt-0.5">{lib.vendor}</p>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-neutral-900 flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-neutral-600 uppercase font-bold tracking-tighter">Instruments</span>
                      <span className="text-[11px] font-mono text-neutral-400">{lib.instruments}</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[9px] text-neutral-600 uppercase font-bold tracking-tighter">Size</span>
                      <span className="text-[11px] font-mono text-neutral-400">{lib.size}</span>
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

            {filteredLibraries.length === 0 && (
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
          <div className="mt-auto pt-4 border-t border-neutral-800 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-[10px] font-mono text-neutral-500 uppercase">Total: {mockLibraries.length} Libraries</span>
              <span className="text-[10px] font-mono text-neutral-500 uppercase">Disk Usage: 112.5 GB</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-neutral-500 uppercase">Supported Formats: .nki, .nkx, .nkm, .nicnt</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
