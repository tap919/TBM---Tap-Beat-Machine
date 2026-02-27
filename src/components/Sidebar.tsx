import React from 'react';
import { Waves, Music, Sliders, Settings, Save, FolderOpen, Grid3X3, Activity, Library, Cpu, Palette } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
  const menuItems = [
    { id: 'sampler', icon: <Waves size={20} />, label: 'Sampler' },
    { id: 'library', icon: <Library size={20} />, label: 'Kontakt Library' },
    { id: 'plugins', icon: <Cpu size={20} />, label: 'VST Plugins' },
    { id: 'theme', icon: <Palette size={20} />, label: 'Theme' },
    { id: 'drums', icon: <Grid3X3 size={20} />, label: 'Drums' },
    { id: 'hats', icon: <Music size={20} />, label: 'Hat Sequencer' },
    { id: 'chords', icon: <Music size={20} />, label: 'Chords' },
    { id: 'mod', icon: <Activity size={20} />, label: 'Mod Matrix' },
    { id: 'mixer', icon: <Sliders size={20} />, label: 'Mixer' },
    { id: 'settings', icon: <Settings size={20} />, label: 'Settings' },
  ];

  return (
    <div className="w-16 bg-bg-surface border-r border-border-main flex flex-col items-center py-6 gap-8">
      <div className="flex flex-col gap-4">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`p-3 rounded-xl transition-all ${
              activeTab === item.id 
                ? 'bg-brand text-white shadow-[0_0_15px_var(--brand-primary-glow)]' 
                : 'text-neutral-500 hover:text-neutral-300 hover:bg-bg-main'
            }`}
            title={item.label}
          >
            {item.icon}
          </button>
        ))}
      </div>

      <div className="mt-auto flex flex-col gap-4">
        <button className="p-3 text-neutral-500 hover:text-neutral-300 transition-colors" title="Open Program">
          <FolderOpen size={20} />
        </button>
        <button className="p-3 text-neutral-500 hover:text-neutral-300 transition-colors" title="Save Program">
          <Save size={20} />
        </button>
      </div>
    </div>
  );
}
