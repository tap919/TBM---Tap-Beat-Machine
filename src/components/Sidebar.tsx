import React from 'react';
import { Waves, Music, Sliders, Settings, Save, FolderOpen, Grid3X3, Activity, Library, Cpu, Palette } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
  const menuItems = [
    { id: 'sampler',  icon: <Waves size={17} />,    label: 'Sampler'  },
    { id: 'library',  icon: <Library size={17} />,  label: 'Library'  },
    { id: 'plugins',  icon: <Cpu size={17} />,      label: 'Plugins'  },
    { id: 'theme',    icon: <Palette size={17} />,  label: 'Theme'    },
    { id: 'drums',    icon: <Grid3X3 size={17} />,  label: 'Drums'    },
    { id: 'hats',     icon: <Music size={17} />,    label: 'Hats'     },
    { id: 'chords',   icon: <Music size={17} />,    label: 'Chords'   },
    { id: 'mod',      icon: <Activity size={17} />, label: 'Mod'      },
    { id: 'mixer',    icon: <Sliders size={17} />,  label: 'Mixer'    },
    { id: 'settings', icon: <Settings size={17} />, label: 'Settings' },
  ];

  return (
    <div className="w-[68px] flex-shrink-0 bg-bg-surface border-r border-border-main flex flex-col items-center pt-3 pb-3 gap-0.5 overflow-y-auto custom-scrollbar">
      {/* Nav items */}
      <div className="flex flex-col gap-0.5 w-full px-2">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            title={item.label}
            className={`relative w-full flex flex-col items-center gap-1 py-2.5 rounded-xl transition-all duration-150 group ${
              activeTab === item.id
                ? 'bg-brand/10 text-brand shadow-[0_0_14px_var(--brand-primary-glow),inset_0_1px_0_rgba(255,255,255,0.06)]'
                : 'text-neutral-600 hover:text-neutral-300 hover:bg-bg-main/70'
            }`}
          >
            <span className={`transition-transform duration-150 ${activeTab !== item.id ? 'group-hover:scale-110' : ''}`}>
              {item.icon}
            </span>
            <span className={`text-[8px] font-bold uppercase tracking-wide leading-none ${
              activeTab === item.id ? 'text-brand' : 'text-neutral-600 group-hover:text-neutral-400'
            }`}>
              {item.label}
            </span>
            {/* Active indicator */}
            {activeTab === item.id && (
              <span className="absolute left-0 w-0.5 h-6 bg-brand rounded-r-full shadow-[0_0_6px_var(--brand-primary-glow)]" />
            )}
          </button>
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1 min-h-3"></div>

      {/* Divider */}
      <div className="w-8 h-px bg-border-main mx-auto mb-1"></div>

      {/* Footer actions */}
      <div className="flex flex-col gap-0.5 w-full px-2">
        {[
          { icon: <FolderOpen size={17} />, label: 'Open',  title: 'Open Program' },
          { icon: <Save size={17} />,       label: 'Save',  title: 'Save Program' },
        ].map(btn => (
          <button
            key={btn.label}
            title={btn.title}
            className="w-full flex flex-col items-center gap-1 py-2.5 text-neutral-600 hover:text-neutral-300 hover:bg-bg-main/70 rounded-xl transition-all duration-150 group"
          >
            <span className="group-hover:scale-110 transition-transform duration-150">{btn.icon}</span>
            <span className="text-[8px] font-bold uppercase tracking-wide leading-none text-neutral-600 group-hover:text-neutral-400">
              {btn.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
