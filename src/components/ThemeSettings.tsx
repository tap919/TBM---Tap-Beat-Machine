import React from 'react';
import { useTheme, themes } from '../contexts/ThemeContext';
import { Palette, Check, RotateCcw, Pipette } from 'lucide-react';

export function ThemeSettings() {
  const { currentTheme, setTheme, customTheme, updateCustomTheme } = useTheme();

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand/20 rounded-lg flex items-center justify-center border border-brand/30">
            <Palette className="text-brand" size={20} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-neutral-200 uppercase tracking-widest">Theme Customizer</h2>
            <p className="text-[10px] text-neutral-500 font-mono uppercase">Personalize your workstation</p>
          </div>
        </div>
        <button 
          onClick={() => setTheme('mpc-classic')}
          className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white rounded text-[10px] font-bold uppercase transition-all"
        >
          <RotateCcw size={12} /> Reset to Default
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Preset Themes */}
        <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-6 flex flex-col gap-4">
          <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Preset Themes</span>
          <div className="grid grid-cols-1 gap-2">
            {themes.map(theme => (
              <button
                key={theme.id}
                onClick={() => setTheme(theme.id)}
                className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                  currentTheme.id === theme.id 
                    ? 'bg-brand/10 border-brand shadow-lg shadow-brand/5' 
                    : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div 
                    className="w-4 h-4 rounded-full border border-white/10" 
                    style={{ backgroundColor: theme.primary }}
                  ></div>
                  <span className={`text-xs font-bold ${currentTheme.id === theme.id ? 'text-brand' : 'text-neutral-400'}`}>
                    {theme.name}
                  </span>
                </div>
                {currentTheme.id === theme.id && <Check size={14} className="text-brand" />}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Theme Creator */}
        <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Custom Theme Creator</span>
            <Pipette size={14} className="text-neutral-600" />
          </div>
          
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-[10px] text-neutral-500 uppercase font-bold">Primary Accent</label>
              <div className="flex gap-2">
                <input 
                  type="color" 
                  value={customTheme.primary}
                  onChange={(e) => updateCustomTheme({ 
                    primary: e.target.value,
                    primaryGlow: `${e.target.value}33` // Add 20% opacity for glow
                  })}
                  className="w-12 h-10 bg-neutral-950 border border-neutral-800 rounded cursor-pointer"
                />
                <input 
                  type="text" 
                  value={customTheme.primary}
                  onChange={(e) => updateCustomTheme({ primary: e.target.value })}
                  className="flex-1 bg-neutral-950 border border-neutral-800 rounded px-3 text-xs font-mono text-neutral-400 outline-none focus:border-brand transition-colors"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] text-neutral-500 uppercase font-bold">Background Color</label>
              <div className="flex gap-2">
                <input 
                  type="color" 
                  value={customTheme.bg}
                  onChange={(e) => updateCustomTheme({ bg: e.target.value })}
                  className="w-12 h-10 bg-neutral-950 border border-neutral-800 rounded cursor-pointer"
                />
                <input 
                  type="text" 
                  value={customTheme.bg}
                  onChange={(e) => updateCustomTheme({ bg: e.target.value })}
                  className="flex-1 bg-neutral-950 border border-neutral-800 rounded px-3 text-xs font-mono text-neutral-400 outline-none focus:border-brand transition-colors"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] text-neutral-500 uppercase font-bold">Surface Color</label>
              <div className="flex gap-2">
                <input 
                  type="color" 
                  value={customTheme.surface}
                  onChange={(e) => updateCustomTheme({ surface: e.target.value })}
                  className="w-12 h-10 bg-neutral-950 border border-neutral-800 rounded cursor-pointer"
                />
                <input 
                  type="text" 
                  value={customTheme.surface}
                  onChange={(e) => updateCustomTheme({ surface: e.target.value })}
                  className="flex-1 bg-neutral-950 border border-neutral-800 rounded px-3 text-xs font-mono text-neutral-400 outline-none focus:border-brand transition-colors"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] text-neutral-500 uppercase font-bold">Border Color</label>
              <div className="flex gap-2">
                <input 
                  type="color" 
                  value={customTheme.border}
                  onChange={(e) => updateCustomTheme({ border: e.target.value })}
                  className="w-12 h-10 bg-neutral-950 border border-neutral-800 rounded cursor-pointer"
                />
                <input 
                  type="text" 
                  value={customTheme.border}
                  onChange={(e) => updateCustomTheme({ border: e.target.value })}
                  className="flex-1 bg-neutral-950 border border-neutral-800 rounded px-3 text-xs font-mono text-neutral-400 outline-none focus:border-brand transition-colors"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Preview Area */}
      <div className="flex-1 bg-neutral-900 rounded-xl border border-neutral-800 p-6 flex flex-col gap-4 overflow-hidden">
        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">UI Preview</span>
        <div className="flex-1 rounded-lg overflow-hidden border border-neutral-800 flex flex-col" style={{ backgroundColor: currentTheme.bg }}>
          <div className="h-10 border-b flex items-center px-4 justify-between" style={{ backgroundColor: currentTheme.surface, borderColor: currentTheme.border }}>
            <div className="flex gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: currentTheme.primary }}></div>
              <div className="w-12 h-2 rounded-full bg-neutral-800"></div>
            </div>
            <div className="w-4 h-4 rounded bg-neutral-800"></div>
          </div>
          <div className="flex-1 p-4 grid grid-cols-3 gap-4">
            <div className="col-span-2 rounded-lg border p-4 flex flex-col gap-2" style={{ backgroundColor: currentTheme.surface, borderColor: currentTheme.border }}>
              <div className="h-4 w-1/2 rounded bg-neutral-800"></div>
              <div className="h-20 w-full rounded border border-dashed flex items-center justify-center" style={{ borderColor: currentTheme.border }}>
                <div className="w-10 h-10 rounded-full" style={{ backgroundColor: `${currentTheme.primary}22`, border: `1px solid ${currentTheme.primary}44` }}></div>
              </div>
            </div>
            <div className="rounded-lg border p-4 flex flex-col gap-2" style={{ backgroundColor: currentTheme.surface, borderColor: currentTheme.border }}>
              <div className="h-4 w-full rounded bg-neutral-800"></div>
              <div className="h-4 w-full rounded bg-neutral-800"></div>
              <div className="h-8 w-full rounded mt-auto" style={{ backgroundColor: currentTheme.primary }}></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
