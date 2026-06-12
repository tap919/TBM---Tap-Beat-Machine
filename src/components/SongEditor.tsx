import React, { useState, useCallback, useRef } from 'react';
import { Plus, X, GripVertical, Play, Square, Download, Save, Trash2, ChevronUp, ChevronDown } from 'lucide-react';

let sectionCounter = 0;
function nextSectionId() { return `section-${++sectionCounter}`; }
let songCounter = 0;
function nextSongId() { return `song-${++songCounter}`; }

export interface SongSection {
  id: string;
  patternIndex: number;
  repeatCount: number;
}

export interface Song {
  id: string;
  name: string;
  sections: SongSection[];
  bpm: number;
  swing: number;
}

interface SongEditorProps {
  patterns: { id: string; name: string }[];
  songs: Song[];
  onSaveSong: (song: Song) => void;
  onDeleteSong: (id: string) => void;
  onPlaySection: (section: SongSection) => void;
  onPlaySong: (song: Song) => void;
  onStop: () => void;
  onExport: (song: Song) => void;
  isPlaying: boolean;
}

function calcTotalBars(sections: SongSection[]): number {
  return sections.reduce((sum, s) => sum + s.repeatCount * 4, 0);
}

function calcDurationSec(sections: SongSection[], bpm: number): number {
  if (bpm <= 0) return 0;
  const totalBars = calcTotalBars(sections);
  return (totalBars * 4 * 60) / bpm;
}

export const SongEditor: React.FC<SongEditorProps> = ({
  patterns,
  songs,
  onSaveSong,
  onDeleteSong,
  onPlaySection,
  onPlaySong,
  onStop,
  onExport,
  isPlaying,
}) => {
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [sections, setSections] = useState<SongSection[]>([]);
  const [songName, setSongName] = useState('Untitled Song');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const currentSong = songs[currentSongIndex];
  const displaySections = currentSong ? currentSong.sections : sections;
  const displayBpm = currentSong ? currentSong.bpm : 120;
  const displayName = currentSong ? currentSong.name : songName;
  const isNewSong = !currentSong;

  const handleAddSection = useCallback(() => {
    const newSection: SongSection = {
      id: nextSectionId(),
      patternIndex: 0,
      repeatCount: 1,
    };
    if (currentSong) {
      const updated: Song = { ...currentSong, sections: [...currentSong.sections, newSection] };
      onSaveSong(updated);
    } else {
      setSections(prev => [...prev, newSection]);
    }
  }, [currentSong, onSaveSong]);

  const handleRemoveSection = useCallback((idx: number) => {
    if (currentSong) {
      const updated: Song = { ...currentSong, sections: currentSong.sections.filter((_, i) => i !== idx) };
      onSaveSong(updated);
    } else {
      setSections(prev => prev.filter((_, i) => i !== idx));
    }
  }, [currentSong, onSaveSong]);

  const handleChangePattern = useCallback((idx: number, patternIdx: number) => {
    if (currentSong) {
      const sections = currentSong.sections.map((s, i) => i === idx ? { ...s, patternIndex: patternIdx } : s);
      onSaveSong({ ...currentSong, sections });
    } else {
      setSections(prev => prev.map((s, i) => i === idx ? { ...s, patternIndex: patternIdx } : s));
    }
  }, [currentSong, onSaveSong]);

  const handleChangeRepeat = useCallback((idx: number, count: number) => {
    const clamped = Math.max(1, Math.min(16, count));
    if (currentSong) {
      const sections = currentSong.sections.map((s, i) => i === idx ? { ...s, repeatCount: clamped } : s);
      onSaveSong({ ...currentSong, sections });
    } else {
      setSections(prev => prev.map((s, i) => i === idx ? { ...s, repeatCount: clamped } : s));
    }
  }, [currentSong, onSaveSong]);

  const handleMoveSection = useCallback((idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= displaySections.length) return;
    if (currentSong) {
      const arr = [...currentSong.sections];
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      onSaveSong({ ...currentSong, sections: arr });
    } else {
      setSections(prev => {
        const arr = [...prev];
        [arr[idx], arr[target]] = [arr[target], arr[idx]];
        return arr;
      });
    }
  }, [currentSong, onSaveSong, displaySections.length]);

  const handleSaveAsNew = useCallback(() => {
    const song: Song = {
      id: nextSongId(),
      name: songName || 'Untitled Song',
      sections: isNewSong ? sections : [],
      bpm: 120,
      swing: 0,
    };
    if (isNewSong && sections.length > 0) {
      onSaveSong(song);
      setSections([]);
      setSongName('Untitled Song');
    }
  }, [songName, sections, isNewSong, onSaveSong]);

  const handleSelectSong = useCallback((idx: number) => {
    setCurrentSongIndex(idx);
  }, []);

  const handleNewSong = useCallback(() => {
    setCurrentSongIndex(0);
    setSections([]);
    setSongName('Untitled Song');
  }, []);

  const totalBars = calcTotalBars(displaySections);
  const durationSec = calcDurationSec(displaySections, displayBpm);

  return (
    <div className="h-full flex flex-col p-6 gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-200">Song Editor</h2>
          <p className="text-[11px] font-mono text-neutral-500 mt-0.5">Chain patterns into arrangements</p>
        </div>
        <div className="flex items-center gap-2">
          {isNewSong && sections.length > 0 && (
            <button
              onClick={handleSaveAsNew}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand/15 border border-brand/30 text-brand text-[11px] font-bold uppercase tracking-wider hover:bg-brand/25 transition-all"
            >
              <Save size={12} /> Save New Song
            </button>
          )}
          {currentSong && (
            <>
              <button
                onClick={() => onPlaySong(currentSong)}
                disabled={isPlaying || currentSong.sections.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600/20 border border-green-500/30 text-green-400 text-[11px] font-bold uppercase tracking-wider hover:bg-green-600/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <Play size={12} /> Play
              </button>
              <button
                onClick={onStop}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/20 border border-red-500/30 text-red-400 text-[11px] font-bold uppercase tracking-wider hover:bg-red-600/30 transition-all"
              >
                <Square size={12} /> Stop
              </button>
              <button
                onClick={() => onExport(currentSong)}
                disabled={currentSong.sections.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand/15 border border-brand/30 text-brand text-[11px] font-bold uppercase tracking-wider hover:bg-brand/25 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <Download size={12} /> Export
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        <div className="w-56 shrink-0 border border-border-main rounded-xl bg-bg-main/40 p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">Songs</span>
            <button
              onClick={handleNewSong}
              className="p-1 rounded text-neutral-600 hover:text-neutral-300 hover:bg-bg-main/60 transition-all"
              title="New Song"
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
            {songs.length === 0 && !isNewSong && (
              <p className="text-[11px] text-neutral-600 italic">No songs saved</p>
            )}
            {(isNewSong ? [{ id: 'new', name: '+ New Song' } as Song] : []).map((s, idx) => (
              <button
                key={s.id}
                disabled
                className="w-full text-left px-2 py-1.5 rounded-lg text-[12px] text-neutral-500 italic"
              >
                {s.name}
              </button>
            ))}
            {songs.map((song, idx) => (
              <button
                key={song.id}
                onClick={() => handleSelectSong(idx)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-[12px] transition-all ${
                  currentSongIndex === idx
                    ? 'bg-brand/10 text-brand border border-brand/30'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-bg-main/60 border border-transparent'
                }`}
              >
                <span className="font-bold uppercase tracking-wider truncate">{song.name}</span>
                <span className="ml-auto text-[10px] font-mono text-neutral-600">{song.sections.length}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteSong(song.id); }}
                  className="p-0.5 rounded text-neutral-700 hover:text-red-400 transition-colors"
                  title="Delete song"
                >
                  <Trash2 size={10} />
                </button>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 flex flex-col min-h-0 border border-border-main rounded-xl bg-bg-main/40 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border-main bg-bg-main/30">
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setSongName(e.target.value)}
                className="bg-transparent text-sm font-bold text-neutral-200 outline-none border-b border-transparent focus:border-brand/60 transition-colors"
                placeholder="Song name..."
              />
              <span className="text-[11px] font-mono text-neutral-600">
                {totalBars} bars · {durationSec.toFixed(1)}s
              </span>
            </div>
            <button
              onClick={handleAddSection}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand/15 text-brand text-[11px] font-bold uppercase tracking-wider hover:bg-brand/25 transition-all"
            >
              <Plus size={12} /> Add Section
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
            {displaySections.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-[13px] text-neutral-600 italic">Add sections to build your song arrangement</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="grid grid-cols-[24px_1fr_80px_80px_60px_40px] gap-2 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-neutral-600">
                  <span></span>
                  <span>Pattern</span>
                  <span>Repeat</span>
                  <span>Bars</span>
                  <span>Duration</span>
                  <span></span>
                </div>
                {displaySections.map((section, idx) => (
                  <div
                    key={section.id}
                    className={`grid grid-cols-[24px_1fr_80px_80px_60px_40px] gap-2 items-center px-2 py-1.5 rounded-lg transition-all ${
                      dragOverIdx === idx ? 'border-t-2 border-brand' : ''
                    } hover:bg-bg-main/60`}
                  >
                    <div className="flex items-center gap-0.5 text-neutral-600">
                      <GripVertical size={12} className="cursor-grab opacity-40" />
                      <span className="text-[10px] font-mono w-4 text-right">{idx + 1}</span>
                    </div>
                    <select
                      value={section.patternIndex}
                      onChange={(e) => handleChangePattern(idx, Number(e.target.value))}
                      className="bg-bg-main border border-border-main rounded px-2 py-1 text-xs font-mono text-neutral-200 outline-none focus:border-brand/60"
                    >
                      {patterns.map((p, pi) => (
                        <option key={p.id} value={pi}>{p.name}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      max={16}
                      value={section.repeatCount}
                      onChange={(e) => handleChangeRepeat(idx, Number(e.target.value))}
                      className="bg-bg-main border border-border-main rounded px-2 py-1 text-xs font-mono text-neutral-200 outline-none focus:border-brand/60 text-center w-full"
                    />
                    <span className="text-xs font-mono text-neutral-400 text-center">{section.repeatCount * 4}</span>
                    <span className="text-[11px] font-mono text-neutral-500 text-center">
                      {((section.repeatCount * 4 * 4 * 60) / displayBpm).toFixed(1)}s
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleMoveSection(idx, -1)}
                        disabled={idx === 0}
                        className="p-0.5 rounded text-neutral-700 hover:text-neutral-400 disabled:opacity-20 transition-colors"
                      >
                        <ChevronUp size={12} />
                      </button>
                      <button
                        onClick={() => handleMoveSection(idx, 1)}
                        disabled={idx === displaySections.length - 1}
                        className="p-0.5 rounded text-neutral-700 hover:text-neutral-400 disabled:opacity-20 transition-colors"
                      >
                        <ChevronDown size={12} />
                      </button>
                      <button
                        onClick={() => handleRemoveSection(idx)}
                        className="p-0.5 rounded text-neutral-700 hover:text-red-400 transition-colors"
                        title="Remove section"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-border-main px-4 py-2 flex items-center justify-between bg-bg-main/30">
            <div className="flex items-center gap-4 text-[11px] font-mono text-neutral-500">
              <span>Sections: <strong className="text-neutral-300">{displaySections.length}</strong></span>
              <span>Total Bars: <strong className="text-neutral-300">{totalBars}</strong></span>
              <span>Duration: <strong className="text-neutral-300">{durationSec.toFixed(1)}s</strong></span>
            </div>
            <div className="flex items-center gap-2">
              {isNewSong && sections.length > 0 && (
                <span className="text-[10px] text-neutral-600 italic">Unsaved</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
