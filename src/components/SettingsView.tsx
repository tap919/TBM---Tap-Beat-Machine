import React, { useState } from 'react';
import { Cpu, Zap, Activity, ShieldAlert } from 'lucide-react';

export function SettingsView() {
  const [latency, setLatency] = useState(128);
  const [sampleRate, setSampleRate] = useState('44100');
  const [driver, setDriver] = useState('ASIO v2.0');

  return (
    <div className="h-full flex flex-col gap-8 p-6">
      <h2 className="text-xl font-bold text-neutral-200 uppercase tracking-[0.2em]">Audio & System Settings</h2>
      
      <div className="grid grid-cols-2 gap-12">
        {/* Audio Engine */}
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-3 text-red-500">
            <Zap size={20} />
            <h3 className="text-sm font-bold uppercase tracking-widest">Audio Engine</h3>
          </div>
          
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-mono text-neutral-500 uppercase">Driver Type</label>
              <select 
                value={driver}
                onChange={(e) => setDriver(e.target.value)}
                className="bg-neutral-800 border border-neutral-700 text-neutral-300 text-sm rounded-md p-2 outline-none focus:border-red-500"
              >
                <option>ASIO v2.0</option>
                <option>DirectSound</option>
                <option>CoreAudio (Mac)</option>
                <option>WASAPI</option>
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-mono text-neutral-500 uppercase">Buffer Size: {latency} samples</label>
              <input 
                type="range" 
                min="32" 
                max="2048" 
                step="32"
                value={latency}
                onChange={(e) => setLatency(parseInt(e.target.value))}
                className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-red-500"
              />
              <div className="flex justify-between text-[10px] font-mono text-neutral-600">
                <span>32 (Low Latency)</span>
                <span>2048 (Safe)</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-mono text-neutral-500 uppercase">Sample Rate</label>
              <select 
                value={sampleRate}
                onChange={(e) => setSampleRate(e.target.value)}
                className="bg-neutral-800 border border-neutral-700 text-neutral-300 text-sm rounded-md p-2 outline-none focus:border-red-500"
              >
                <option>44100 Hz</option>
                <option>48000 Hz</option>
                <option>88200 Hz</option>
                <option>96000 Hz</option>
              </select>
            </div>
          </div>
        </div>

        {/* System Performance */}
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-3 text-blue-500">
            <Cpu size={20} />
            <h3 className="text-sm font-bold uppercase tracking-widest">Performance</h3>
          </div>

          <div className="space-y-6">
            <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800 flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold text-neutral-300 uppercase">Multi-Core Processing</span>
                <span className="text-[10px] text-neutral-500 uppercase">Enable parallel DSP threads</span>
              </div>
              <button className="w-10 h-5 bg-blue-600 rounded-full relative">
                <div className="w-4 h-4 bg-white rounded-full absolute right-0.5 top-0.5 shadow-sm"></div>
              </button>
            </div>

            <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800 flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold text-neutral-300 uppercase">High-Precision Resampling</span>
                <span className="text-[10px] text-neutral-500 uppercase">Better quality, higher CPU usage</span>
              </div>
              <button className="w-10 h-5 bg-neutral-700 rounded-full relative">
                <div className="w-4 h-4 bg-white rounded-full absolute left-0.5 top-0.5 shadow-sm"></div>
              </button>
            </div>

            <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800 flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold text-neutral-300 uppercase">Oversampling (4x)</span>
                <span className="text-[10px] text-neutral-500 uppercase">Reduce aliasing in saturation</span>
              </div>
              <button className="w-10 h-5 bg-emerald-600 rounded-full relative">
                <div className="w-4 h-4 bg-white rounded-full absolute right-0.5 top-0.5 shadow-sm"></div>
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-mono text-neutral-500 uppercase">UI Scaling</label>
              <div className="flex gap-2">
                {['100%', '125%', '150%'].map(scale => (
                  <button key={scale} className={`flex-1 py-1 rounded text-[10px] font-bold border ${scale === '100%' ? 'bg-red-600 border-red-500 text-white' : 'bg-neutral-800 border-neutral-700 text-neutral-500'}`}>
                    {scale}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-red-900/10 p-4 rounded-lg border border-red-900/30 flex items-start gap-3">
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
      </div>

      {/* Diagnostics & Logs (Ardour Style) */}
      <div className="mt-8 pt-8 border-t border-neutral-800 flex flex-col gap-4">
        <div className="flex items-center gap-3 text-neutral-500">
          <Activity size={20} />
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
          <div className="flex gap-4"><span className="text-neutral-700">[02:56:40]</span> <span className="text-emerald-700">INFO:</span> ASIO v2.0 driver loaded. Buffer: 128 samples.</div>
          <div className="flex gap-4"><span className="text-neutral-700">[02:56:42]</span> <span className="text-blue-700">DEBUG:</span> MIDI device 'OmniKey 49' connected.</div>
          <div className="flex gap-4"><span className="text-neutral-700">[02:56:45]</span> <span className="text-emerald-700">INFO:</span> Sample map 'Factory_808_Kit' loaded.</div>
          <div className="flex gap-4"><span className="text-neutral-700">[03:26:32]</span> <span className="text-yellow-700">WARN:</span> High DSP load detected on Track 4.</div>
          <div className="flex gap-4"><span className="text-neutral-700">[03:26:35]</span> <span className="text-emerald-700">INFO:</span> Modulation Matrix updated. 3 active routes.</div>
        </div>
      </div>
    </div>
  );
}
