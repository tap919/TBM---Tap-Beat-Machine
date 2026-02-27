import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Scissors,
  UploadCloud,
  Download,
  Play,
  Square,
  Volume2,
  VolumeX,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Music,
  Mic,
  Drum,
  Radio,
  Waves,
  Info,
  ChevronDown,
} from 'lucide-react';

type StemStatus = 'idle' | 'uploading' | 'separating' | 'done' | 'error';

interface StemTrack {
  id: string;
  label: string;
  color: string;
  icon: React.ReactNode;
  muted: boolean;
  volume: number;
  ready: boolean;
}

const MODELS = [
  { id: 'htdemucs',     label: 'htdemucs',       desc: 'Hybrid Transformer · 4 stems · Fast' },
  { id: 'htdemucs_ft',  label: 'htdemucs_ft',    desc: 'Hybrid Transformer Fine-tuned · 4 stems · Best quality' },
  { id: 'mdx_extra',    label: 'mdx_extra',      desc: 'MDX-Net Extra · 4 stems · Balanced' },
  { id: 'mdx_extra_q',  label: 'mdx_extra_q',    desc: 'MDX-Net Extra Quantized · 4 stems · Lightweight' },
  { id: 'htdemucs_6s',  label: 'htdemucs_6s',    desc: 'Hybrid Transformer · 6 stems (guitar + piano)' },
];

const INITIAL_STEMS: StemTrack[] = [
  { id: 'drums',  label: 'Drums',  color: '#3b82f6', icon: <Drum size={13} />,   muted: false, volume: 80, ready: false },
  { id: 'bass',   label: 'Bass',   color: '#a855f7', icon: <Waves size={13} />,  muted: false, volume: 80, ready: false },
  { id: 'vocals', label: 'Vocals', color: '#eab308', icon: <Mic size={13} />,    muted: false, volume: 80, ready: false },
  { id: 'other',  label: 'Other',  color: '#22c55e', icon: <Music size={13} />,  muted: false, volume: 80, ready: false },
];

const EXTRA_STEMS: StemTrack[] = [
  { id: 'guitar', label: 'Guitar', color: '#f97316', icon: <Radio size={13} />,  muted: false, volume: 80, ready: false },
  { id: 'piano',  label: 'Piano',  color: '#ec4899', icon: <Music size={13} />,  muted: false, volume: 80, ready: false },
];

export function StemSeparator() {
  const [status, setStatus] = useState<StemStatus>('idle');
  const [model, setModel] = useState('htdemucs_ft');
  const [fileName, setFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [stems, setStems] = useState<StemTrack[]>(INITIAL_STEMS);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);

  const selectedModel = MODELS.find(m => m.id === model) ?? MODELS[0];

  // Pre-generate deterministic waveform heights per stem id so they are stable across re-renders
  const waveformData = useMemo<Record<string, number[]>>(() => {
    const all = [...INITIAL_STEMS, ...EXTRA_STEMS];
    const result: Record<string, number[]> = {};
    for (const stem of all) {
      result[stem.id] = Array.from({ length: 80 }, (_, i) => {
        const phase = i * 0.3 + stem.id.charCodeAt(0);
        const h = Math.sin(phase) * 0.4 + Math.cos(phase * 0.7) * 0.2 + 0.6;
        return Math.max(0.1, Math.min(1, h));
      });
    }
    return result;
  }, []);

  // Close model menu when clicking outside or pressing Escape
  useEffect(() => {
    if (!showModelMenu) return;
    const onPointerDown = (e: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setShowModelMenu(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowModelMenu(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showModelMenu]);

  // Cleanup interval on unmount to prevent state updates on an unmounted component
  useEffect(() => {
    return () => {
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, []);

  const handleFile = (file: File) => {
    if (!(file.type.startsWith('audio/') || file.name.match(/\.(mp3|wav|flac|aiff?|ogg|m4a)$/i))) {
      setErrorMsg('Please upload an audio file (mp3, wav, flac, aiff, ogg, m4a).');
      setStatus('error');
      return;
    }
    setFileName(file.name);
    setErrorMsg('');
    startSeparation();
  };

  const startSeparation = () => {
    setStatus('uploading');
    setProgress(0);

    const is6s = model === 'htdemucs_6s';
    const stemSet = is6s ? [...INITIAL_STEMS, ...EXTRA_STEMS] : INITIAL_STEMS;
    setStems(stemSet.map(s => ({ ...s, ready: false })));

    // Simulate upload phase
    let p = 0;
    if (progressRef.current) clearInterval(progressRef.current);
    progressRef.current = setInterval(() => {
      p += 8;
      setProgress(Math.min(p, 100));
      if (p >= 100) {
        if (progressRef.current) clearInterval(progressRef.current);
        progressRef.current = null;
        setStatus('separating');
        runSeparation(stemSet);
      }
    }, 80);
  };

  const runSeparation = (stemSet: StemTrack[]) => {
    setProgress(0);
    let p = 0;
    if (progressRef.current) clearInterval(progressRef.current);
    progressRef.current = setInterval(() => {
      p += 2;
      setProgress(Math.min(p, 100));
      if (p >= 100) {
        if (progressRef.current) clearInterval(progressRef.current);
        progressRef.current = null;
        setStems(stemSet.map(s => ({ ...s, ready: true })));
        setStatus('done');
        setProgress(100);
      }
    }, 60);
  };

  const toggleMute = (id: string) => {
    setStems(prev => prev.map(s => s.id === id ? { ...s, muted: !s.muted } : s));
  };

  const setVolume = (id: string, vol: number) => {
    setStems(prev => prev.map(s => s.id === id ? { ...s, volume: vol } : s));
  };

  const togglePlay = (id: string) => {
    setPlayingId(prev => prev === id ? null : id);
  };

  const reset = () => {
    if (progressRef.current) clearInterval(progressRef.current);
    progressRef.current = null;
    setStatus('idle');
    setFileName('');
    setProgress(0);
    setErrorMsg('');
    setStems(INITIAL_STEMS);
    setPlayingId(null);
  };

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand/15 border border-brand/30 flex items-center justify-center">
            <Scissors size={17} className="text-brand" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-neutral-200 uppercase tracking-widest">Stem Separator</h2>
            <p className="text-[10px] text-neutral-500 font-mono uppercase">Powered by Demucs (open-source)</p>
          </div>
        </div>

        {/* Model picker */}
        <div className="relative" ref={modelMenuRef}>
          <button
            onClick={() => setShowModelMenu(v => !v)}
            className="flex items-center gap-2 bg-bg-main/70 border border-border-main rounded-lg px-3 py-1.5 text-[10px] font-bold text-neutral-300 hover:border-brand/50 transition-all"
          >
            <span className="text-brand">{selectedModel.label}</span>
            <ChevronDown size={10} className={`text-neutral-500 transition-transform ${showModelMenu ? 'rotate-180' : ''}`} />
          </button>
          {showModelMenu && (
            <div className="absolute right-0 top-full mt-1 w-72 bg-bg-surface border border-border-main rounded-xl shadow-2xl z-50 p-1.5 flex flex-col gap-0.5">
              {MODELS.map(m => (
                <button
                  key={m.id}
                  onClick={() => { setModel(m.id); setShowModelMenu(false); }}
                  className={`flex flex-col items-start px-3 py-2 rounded-lg text-left transition-all ${
                    model === m.id ? 'bg-brand/15 border border-brand/30' : 'hover:bg-bg-main/70'
                  }`}
                >
                  <span className={`text-[11px] font-bold ${model === m.id ? 'text-brand' : 'text-neutral-200'}`}>{m.label}</span>
                  <span className="text-[9px] text-neutral-500 font-mono">{m.desc}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
        {/* Left: upload + progress */}
        <div className="w-72 flex-shrink-0 flex flex-col gap-4">

          {/* Drop zone */}
          {status === 'idle' || status === 'error' ? (
            <div
              role="button"
              tabIndex={0}
              aria-label="Drop audio file or click to browse"
              className={`flex-1 rounded-xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-3 cursor-pointer min-h-[180px] ${
                isDragging
                  ? 'border-brand bg-brand/5'
                  : 'border-border-main hover:border-neutral-600 bg-bg-main/40'
              }`}
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onClick={() => fileRef.current?.click()}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click(); } }}
            >
              <UploadCloud size={32} className="text-neutral-600 opacity-60" />
              <div className="text-center px-4">
                <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest">Drop Audio File</p>
                <p className="text-[9px] text-neutral-600 font-mono mt-1">mp3 · wav · flac · aiff · ogg · m4a</p>
              </div>
              <button className="px-4 py-1.5 bg-brand/20 hover:bg-brand/30 text-brand text-[10px] font-bold uppercase rounded-lg border border-brand/40 transition-all">
                Browse Files
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="audio/*,.mp3,.wav,.flac,.aif,.aiff,.ogg,.m4a"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-bg-main/40 rounded-xl border border-border-main min-h-[180px]">
              {status === 'uploading' || status === 'separating' ? (
                <>
                  <Loader2 size={28} className="text-brand animate-spin" />
                  <div className="text-center w-full px-6">
                    <p className="text-[10px] font-bold text-neutral-300 uppercase tracking-widest mb-2">
                      {status === 'uploading' ? 'Uploading…' : 'Separating Stems…'}
                    </p>
                    <div
                      role="progressbar"
                      aria-valuenow={progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={status === 'uploading' ? 'Upload progress' : 'Stem separation progress'}
                      className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden"
                    >
                      <div
                        className="h-full bg-brand rounded-full transition-all duration-200"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="text-[9px] font-mono text-neutral-500 mt-1.5">{progress}%</p>
                  </div>
                  <p className="text-[9px] font-mono text-neutral-600 px-4 text-center truncate w-full">{fileName}</p>
                </>
              ) : status === 'done' ? (
                <>
                  <CheckCircle2 size={28} className="text-emerald-500" />
                  <div className="text-center">
                    <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Separation Complete</p>
                    <p className="text-[9px] font-mono text-neutral-600 mt-1 px-4 truncate">{fileName}</p>
                  </div>
                  <button
                    onClick={reset}
                    className="px-3 py-1 text-[9px] font-bold uppercase text-neutral-500 hover:text-neutral-200 border border-border-main hover:border-neutral-600 rounded-lg transition-all"
                  >
                    New File
                  </button>
                </>
              ) : null}
            </div>
          )}

          {/* Error banner */}
          {status === 'error' && (
            <div className="flex items-start gap-2 p-3 bg-red-950/50 border border-red-800/40 rounded-xl">
              <AlertCircle size={13} className="text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-[10px] text-red-300">{errorMsg}</p>
            </div>
          )}

          {/* Demucs info box */}
          <div className="bg-bg-main/50 rounded-xl border border-border-main p-3 flex flex-col gap-2 flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <Info size={11} className="text-brand flex-shrink-0" />
              <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">Demucs Backend</span>
            </div>
            <p className="text-[9px] text-neutral-500 leading-relaxed">
              Runs locally via <span className="text-neutral-300 font-mono">demucs</span> Python package.
              Start with:
            </p>
            <code className="text-[8px] font-mono text-brand bg-bg-surface/60 px-2 py-1 rounded-md border border-border-main break-all">
              pip install demucs && demucs-api --port 7070
            </code>
          </div>
        </div>

        {/* Right: stems grid */}
        <div className="flex-1 flex flex-col gap-3 min-h-0 overflow-y-auto custom-scrollbar pr-1">
          {stems.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-neutral-700 text-[11px] font-mono uppercase tracking-widest">
              Upload a file to begin separation
            </div>
          )}

          {stems.map(stem => (
            <div
              key={stem.id}
              className={`bg-bg-main/50 rounded-xl border transition-all p-4 flex flex-col gap-3 ${
                stem.ready ? 'border-border-main hover:border-neutral-600' : 'border-border-main opacity-50'
              }`}
            >
              {/* Stem header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center border"
                    style={{ backgroundColor: stem.color + '22', borderColor: stem.color + '55', color: stem.color }}
                  >
                    {stem.icon}
                  </div>
                  <span className="text-[11px] font-bold text-neutral-200 uppercase tracking-wider">{stem.label}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {stem.ready && (
                    <>
                      <button
                        onClick={() => togglePlay(stem.id)}
                        className={`p-1.5 rounded-lg border transition-all ${
                          playingId === stem.id
                            ? 'border-transparent text-white'
                            : 'bg-bg-surface border-border-main text-neutral-500 hover:text-neutral-200'
                        }`}
                        style={playingId === stem.id ? { backgroundColor: stem.color + '33', borderColor: stem.color + '70', color: stem.color } : {}}
                        title={playingId === stem.id ? 'Stop' : 'Play'}
                      >
                        {playingId === stem.id ? <Square size={11} /> : <Play size={11} />}
                      </button>
                      <button
                        onClick={() => toggleMute(stem.id)}
                        className={`p-1.5 rounded-lg border transition-all ${
                          stem.muted
                            ? 'bg-red-950/40 border-red-800/40 text-red-400'
                            : 'bg-bg-surface border-border-main text-neutral-500 hover:text-neutral-200'
                        }`}
                        title={stem.muted ? 'Unmute' : 'Mute'}
                      >
                        {stem.muted ? <VolumeX size={11} /> : <Volume2 size={11} />}
                      </button>
                      <button
                        className="p-1.5 rounded-lg bg-bg-surface border border-border-main text-neutral-500 hover:text-brand hover:border-brand/40 transition-all"
                        title={`Download ${stem.label} stem`}
                      >
                        <Download size={11} />
                      </button>
                    </>
                  )}
                  {!stem.ready && (status === 'separating' || status === 'uploading') && (
                    <Loader2 size={13} className="text-neutral-600 animate-spin" />
                  )}
                </div>
              </div>

              {/* Mini waveform preview */}
              <div className="h-10 rounded-lg overflow-hidden bg-bg-surface/50 border border-border-main/50 relative">
                {stem.ready ? (
                  <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                    <g opacity={stem.muted ? 0.2 : 0.7}>
                      {(waveformData[stem.id] ?? []).map((h, i) => (
                        <rect
                          key={i}
                          x={`${(i / 80) * 100}%`}
                          y={`${50 - h * 45}%`}
                          width="1.1%"
                          height={`${h * 90}%`}
                          rx="1"
                          fill={stem.color}
                        />
                      ))}
                    </g>
                    {playingId === stem.id && (
                      <line x1="30%" y1="0" x2="30%" y2="100%" stroke={stem.color} strokeWidth="1.5" opacity="0.8" />
                    )}
                  </svg>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[9px] font-mono text-neutral-700 uppercase tracking-wider">Pending…</span>
                  </div>
                )}
              </div>

              {/* Volume slider */}
              <div className="flex items-center gap-2">
                <Volume2 size={9} className="text-neutral-600 flex-shrink-0" />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={stem.volume}
                  onChange={e => setVolume(stem.id, parseInt(e.target.value))}
                  className="flex-1 h-1 bg-neutral-800 appearance-none rounded-full cursor-pointer"
                  style={{ accentColor: stem.color }}
                  disabled={!stem.ready}
                />
                <span className="text-[9px] font-mono text-neutral-600 w-6 text-right">{stem.volume}</span>
              </div>
            </div>
          ))}

          {/* Download all */}
          {status === 'done' && (
            <button className="w-full py-2.5 bg-brand/15 hover:bg-brand/25 text-brand border border-brand/30 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 flex-shrink-0">
              <Download size={13} /> Download All Stems (.zip)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
