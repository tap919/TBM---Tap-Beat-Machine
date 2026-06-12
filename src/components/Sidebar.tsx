import React, { useRef, useCallback } from "react";
import {
  Waves,
  Music,
  Sliders,
  Settings,
  Save,
  FolderOpen,
  Grid3X3,
  Library,
  Cpu,
  Piano,
  Users,
  Disc3,
  Scissors,
  Layers,
  ListMusic,
  Gauge,
} from "lucide-react";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onSave?: () => void;
  onOpen?: (file: File) => void;
}

// ── Primary tabs: core production/DJ workflow (larger, prominent) ──
const PRIMARY_TABS = [
  { id: "sampler", Icon: Waves, label: "Sampler" },
  { id: "drums", Icon: Grid3X3, label: "Drums" },
  { id: "hats", Icon: Music, label: "Hats" },
  { id: "pianoroll", Icon: Piano, label: "Piano" },
  { id: "chords", Icon: Music, label: "Chords" },
  { id: "mixer", Icon: Sliders, label: "Mixer" },
  { id: "vinyl", Icon: Disc3, label: "Vinyl" },
] as const;

// ── Secondary tabs: utilities & settings (smaller, less prominent) ──
const SECONDARY_TABS = [
  { id: "library", Icon: Library, label: "Library" },
  { id: "song", Icon: ListMusic, label: "Song" },
  { id: "macro", Icon: Gauge, label: "Macro" },
  { id: "stems", Icon: Scissors, label: "Stems" },
  { id: "plugins", Icon: Cpu, label: "Plugins" },
  { id: "chains", Icon: Layers, label: "Chains" },
  { id: "session", Icon: Users, label: "Session" },
  { id: "settings", Icon: Settings, label: "Settings" },
] as const;

export const Sidebar = React.memo(function Sidebar({
  activeTab,
  setActiveTab,
  onSave,
  onOpen,
}: SidebarProps) {
  const openFileRef = useRef<HTMLInputElement>(null);

  const handleOpenClick = useCallback(() => {
    if (onOpen) {
      openFileRef.current?.click();
    }
  }, [onOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onOpen) return;
    e.target.value = "";
    onOpen(file);
  };

  const FOOTER_ITEMS = [
    {
      Icon: FolderOpen,
      label: "Open",
      title: "Open Program",
      onClick: handleOpenClick,
    },
    {
      Icon: Save,
      label: "Save",
      title: "Save Program",
      onClick: onSave ?? (() => {}),
      disabled: !onSave,
    },
  ] as const;

  return (
    <>
      {/* Hidden file input for project open */}
      <input
        ref={openFileRef}
        type="file"
        accept=".tbm,.json"
        className="hidden"
        onChange={handleFileChange}
      />

      <nav
        className="w-[72px] shrink-0 bg-bg-surface border-r border-border-main flex flex-col items-center pt-3 pb-3 gap-0.5 overflow-y-auto custom-scrollbar relative"
        aria-label="Main navigation"
      >
        {/* Top fade edge */}
        <div className="absolute top-0 left-0 right-0 h-6 bg-linear-to-b from-bg-surface to-transparent z-10 pointer-events-none"></div>
        {/* Bottom fade edge */}
        <div className="absolute bottom-0 left-0 right-0 h-6 bg-linear-to-t from-bg-surface to-transparent z-10 pointer-events-none"></div>

        {/* ── Primary Tabs (production workflow) ── */}
        <div
          className="flex flex-col gap-0.5 w-full px-2"
          role="menubar"
          aria-label="Production tools"
        >
          {PRIMARY_TABS.map((item) => (
            <button
              key={item.id}
              role="menuitem"
              aria-label={`${item.label} section`}
              aria-current={activeTab === item.id ? "page" : undefined}
              onClick={() => setActiveTab(item.id)}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  setActiveTab(item.id);
                }
              }}
              tabIndex={0}
              className={`relative w-full flex flex-col items-center gap-1 py-2.5 rounded-xl transition-all duration-150 group focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 ${
                activeTab === item.id
                  ? "bg-brand/10 text-brand shadow-[0_0_14px_var(--brand-primary-glow),inset_0_1px_0_rgba(255,255,255,0.06)]"
                  : "text-neutral-600 hover:text-neutral-300 hover:bg-neutral-800/50"
              }`}
            >
              <span
                className={`transition-transform duration-150 ${activeTab !== item.id ? "group-hover:scale-110" : ""}`}
              >
                <item.Icon size={17} />
              </span>
              <span
                className={`text-xs font-bold uppercase tracking-wide leading-none ${
                  activeTab === item.id
                    ? "text-brand"
                    : "text-neutral-600 group-hover:text-neutral-400"
                }`}
              >
                {item.label}
              </span>
              {/* Active indicator */}
              {activeTab === item.id && (
                <span className="absolute left-0 w-0.5 h-6 bg-brand rounded-r-full shadow-[0_0_6px_var(--brand-primary-glow)]" />
              )}
            </button>
          ))}
        </div>

        {/* ── Section Divider ── */}
        <div className="w-8 h-px bg-border-main mx-auto my-1.5"></div>

        {/* ── Secondary Tabs (utilities & settings, smaller) ── */}
        <div
          className="flex flex-col gap-0.5 w-full px-2"
          role="menubar"
          aria-label="Utilities"
        >
          {SECONDARY_TABS.map((item) => (
            <button
              key={item.id}
              role="menuitem"
              aria-label={`${item.label} section`}
              aria-current={activeTab === item.id ? "page" : undefined}
              onClick={() => setActiveTab(item.id)}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  setActiveTab(item.id);
                }
              }}
              tabIndex={0}
              className={`relative w-full flex flex-col items-center gap-0.5 py-1.5 rounded-lg transition-all duration-150 group focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 ${
                activeTab === item.id
                  ? "bg-brand/10 text-brand shadow-[0_0_10px_var(--brand-primary-glow),inset_0_1px_0_rgba(255,255,255,0.04)]"
                  : "text-neutral-700 hover:text-neutral-400 hover:bg-neutral-800/30"
              }`}
            >
              <span
                className={`transition-transform duration-150 ${activeTab !== item.id ? "group-hover:scale-110" : ""}`}
              >
                <item.Icon size={14} />
              </span>
              <span
                className={`text-[7px] font-bold uppercase tracking-wide leading-none ${
                  activeTab === item.id
                    ? "text-brand"
                    : "text-neutral-700 group-hover:text-neutral-500"
                }`}
              >
                {item.label}
              </span>
              {/* Active indicator */}
              {activeTab === item.id && (
                <span className="absolute left-0 w-0.5 h-4 bg-brand rounded-r-full shadow-[0_0_4px_var(--brand-primary-glow)]" />
              )}
            </button>
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1 min-h-3"></div>

        {/* Divider */}
        <div className="w-8 h-px bg-border-main mx-auto mb-1"></div>

        {/* Footer actions */}
        <div
          className="flex flex-col gap-0.5 w-full px-2"
          role="group"
          aria-label="File actions"
        >
          {/* eslint-disable-next-line react-hooks/refs */}
          {FOOTER_ITEMS.map((btn) => {
            const isDisabled = 'disabled' in btn && (btn as any).disabled;
            const cls = isDisabled ? 'text-neutral-700 cursor-not-allowed' : 'text-neutral-600 hover:text-neutral-300 hover:bg-neutral-800/50';
            return (
              <button
                key={btn.label}
                aria-label={btn.title}
                disabled={isDisabled}
                onClick={btn.onClick}
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    if (!isDisabled) btn.onClick();
                  }
                }}
                tabIndex={0}
                className={`w-full flex flex-col items-center gap-1 py-2.5 rounded-xl transition-all duration-150 group focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 ${cls}`}
              >
                <span className={`transition-transform duration-150 ${isDisabled ? '' : 'group-hover:scale-110'}`}>
                  <btn.Icon size={17} />
                </span>
                <span className={`text-xs font-bold uppercase tracking-wide leading-none ${isDisabled ? 'text-neutral-700' : 'text-neutral-600 group-hover:text-neutral-400'}`}>
                  {btn.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
});
