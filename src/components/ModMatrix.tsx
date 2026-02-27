import React, { useState } from 'react';
import { Plus, Trash2, ArrowRight, Zap, Activity, Timer } from 'lucide-react';

interface ModRoute {
  id: string;
  source: string;
  target: string;
  amount: number;
  active: boolean;
}

export function ModMatrix() {
  const [routes, setRoutes] = useState<ModRoute[]>([
    { id: '1', source: 'LFO 1', target: 'Filter Cutoff', amount: 45, active: true },
    { id: '2', source: 'Env 2', target: 'Pitch', amount: -12, active: true },
    { id: '3', source: 'Velocity', target: 'Drive', amount: 30, active: false },
  ]);

  const sources = ['LFO 1', 'LFO 2', 'Env 1', 'Env 2', 'Velocity', 'Aftertouch', 'Mod Wheel'];
  const targets = ['Filter Cutoff', 'Pitch', 'Pan', 'Drive', 'Reverb Mix', 'Sample Start', 'Glide'];

  const addRoute = () => {
    const newRoute: ModRoute = {
      id: Math.random().toString(36).substr(2, 9),
      source: sources[0],
      target: targets[0],
      amount: 50,
      active: true
    };
    setRoutes([...routes, newRoute]);
  };

  const removeRoute = (id: string) => {
    setRoutes(routes.filter(r => r.id !== id));
  };

  const updateRoute = (id: string, updates: Partial<ModRoute>) => {
    setRoutes(routes.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  return (
    <div className="h-full flex flex-col gap-6 p-2">
      <div className="flex justify-between items-center">
        <div className="flex flex-col">
          <h2 className="text-sm font-bold text-neutral-200 uppercase tracking-widest flex items-center gap-2">
            <Zap className="text-red-500" size={16} /> Modulation Matrix
          </h2>
          <span className="text-[10px] text-neutral-500 uppercase font-mono">Route modulators to any parameter</span>
        </div>
        <button 
          onClick={addRoute}
          className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded font-bold text-xs uppercase transition-all border border-neutral-700"
        >
          <Plus size={14} /> Add Route
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
        <div className="grid grid-cols-1 gap-2">
          {routes.map((route) => (
            <div 
              key={route.id}
              className={`group flex items-center gap-4 p-3 rounded-lg border transition-all ${
                route.active ? 'bg-neutral-900 border-neutral-800' : 'bg-neutral-950 border-neutral-900 opacity-50'
              }`}
            >
              <div className="flex flex-col gap-1 w-32">
                <span className="text-[8px] font-mono text-neutral-600 uppercase">Source</span>
                <select 
                  value={route.source}
                  onChange={(e) => updateRoute(route.id, { source: e.target.value })}
                  className="bg-neutral-950 border border-neutral-800 text-[10px] text-red-500 font-bold rounded px-2 py-1 outline-none"
                >
                  {sources.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>

              <ArrowRight className="text-neutral-700" size={14} />

              <div className="flex flex-col gap-1 w-32">
                <span className="text-[8px] font-mono text-neutral-600 uppercase">Target</span>
                <select 
                  value={route.target}
                  onChange={(e) => updateRoute(route.id, { target: e.target.value })}
                  className="bg-neutral-950 border border-neutral-800 text-[10px] text-blue-400 font-bold rounded px-2 py-1 outline-none"
                >
                  {targets.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>

              <div className="flex-1 flex flex-col gap-1">
                <div className="flex justify-between items-center">
                  <span className="text-[8px] font-mono text-neutral-600 uppercase">Amount</span>
                  <span className={`text-[10px] font-mono ${route.amount >= 0 ? 'text-emerald-500' : 'text-orange-500'}`}>
                    {route.amount > 0 ? '+' : ''}{route.amount}%
                  </span>
                </div>
                <input 
                  type="range" 
                  min="-100" 
                  max="100" 
                  value={route.amount}
                  onChange={(e) => updateRoute(route.id, { amount: parseInt(e.target.value) })}
                  className="w-full h-1 bg-neutral-950 appearance-none accent-red-500 rounded-full"
                />
              </div>

              <div className="flex items-center gap-2 ml-4">
                <button 
                  onClick={() => updateRoute(route.id, { active: !route.active })}
                  className={`w-8 h-4 rounded-full relative transition-colors ${route.active ? 'bg-red-600' : 'bg-neutral-800'}`}
                >
                  <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-all ${route.active ? 'left-4.5' : 'left-0.5'}`}></div>
                </button>
                <button 
                  onClick={() => removeRoute(route.id)}
                  className="p-1.5 text-neutral-600 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modulator Visualizers (Ardour Style) */}
      <div className="grid grid-cols-3 gap-4 h-32">
        <div className="bg-neutral-950 rounded-lg border border-neutral-800 p-3 flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-1">
              <Activity size={10} className="text-emerald-500" /> LFO 1
            </span>
            <span className="text-[8px] font-mono text-neutral-700">Sine</span>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <svg className="w-full h-full" viewBox="0 0 100 40">
              <path 
                d="M 0 20 Q 25 0 50 20 T 100 20" 
                fill="none" stroke="#10b981" strokeWidth="2"
                className="animate-[dash_2s_linear_infinite]"
                style={{ strokeDasharray: '4 2' }}
              />
            </svg>
          </div>
        </div>
        <div className="bg-neutral-950 rounded-lg border border-neutral-800 p-3 flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-1">
              <Activity size={10} className="text-blue-500" /> LFO 2
            </span>
            <span className="text-[8px] font-mono text-neutral-700">Saw</span>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <svg className="w-full h-full" viewBox="0 0 100 40">
              <path 
                d="M 0 40 L 50 0 L 50 40 L 100 0" 
                fill="none" stroke="#3b82f6" strokeWidth="2"
              />
            </svg>
          </div>
        </div>
        <div className="bg-neutral-950 rounded-lg border border-neutral-800 p-3 flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-1">
              <Timer size={10} className="text-red-500" /> Env 1
            </span>
            <span className="text-[8px] font-mono text-neutral-700">ADSR</span>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <svg className="w-full h-full" viewBox="0 0 100 40">
              <path 
                d="M 0 40 L 10 0 L 30 20 L 70 20 L 100 40" 
                fill="none" stroke="#ef4444" strokeWidth="2"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
