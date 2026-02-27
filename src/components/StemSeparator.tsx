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
import { separateStems, getStemJob, stemDownloadUrl, demucsHealth, type StemJob } from '../lib/api';

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

const STEM_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  drums:  { label: 'Drums',  color: '#3b82f6', icon: <Drum size={13} /> },
  bass:   { label: 'Bass',   color: '#a855f7', icon: <Waves size={13} /> },
  vocals: { label: 'Vocals', color: '#eab308', icon: <Mic size={13} /> },
  other:  { label: 'Other',  color: '#22c55e', icon: <Music size={13} /> },
  guitar: { label: 'Guitar', color: '#f97316', icon: <Radio size={13} /> },
  piano:  { label: 'Piano',  color: '#ec4899', icon: <Music size={13} /> },
};

const DEFAULT_STEMS = ['drums', 'bass', 'vocals', 'other'];

function makeStemTracks(stemIds: string[]): StemTrack[] {
  return stemIds.map(id => ({
    id,
    label: STEM_META[id]?.label ?? id,
    color: STEM_META[id]?.color ?? '#888',
    icon:  STEM_META[id]?.icon  ?? <Music size={13} />,
    muted: false,
    volume: 80,
    ready: false,
  }));
}

const INITIAL_STEMS = makeStemTracks(DEFAULT_STEMS);
const ALL_STEMS     = makeStemTracks([...DEFAULT_STEMS, 'guitar', 'piano']);

export function StemSeparator() {
  const [status, setStatus] = useState<StemStatus>('idle');
  const [model, setModel] = useState('htdemucs_ft');
  const [fileName, setFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [stems, setStems] = useState<StemTrack[]>(INITIAL_STEMS);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [backendInstalled, setBackendInstalled] = useState<boolean | null>(null);
  const [cachedModels, setCachedModels] = useState<string[]>([]);

  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});

  const selectedModel = MODELS.find(m => m.id === model) ?? MODELS[0];

  // Pre-generate deterministic waveform heights per stem id so they are stable across re-renders
  const waveformData = useMemo<Record<string, number[]>>(() => {
    const result: Record<string, number[]> = {};
    for (const s of ALL_STEMS) {
      result[s.id] = Array.from({ length: 80 }, (_, i) => {
        const phase = i * 0.3 + s.id.charCodeAt(0);
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
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowModelMenu(false); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showModelMenu]);

  // Cleanup polling and audio on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      for (const a of Object.values(audioRefs.current) as HTMLAudioElement[]) {
        if (a) { a.pause(); a.src = ''; }
      }
    };
  }, []);

  // Check demucs backend health on mount
  useEffect(() => {
    demucsHealth()
      .then(h => { setBackendInstalled(h.installed); setCachedModels(h.cachedModels); })
      .catch(() => setBackendInstalled(false));
  }, []);

  /** Poll the backend for job status and update state */
  const startPolling = (jid: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const job: StemJob = await getStemJob(jid);
        setProgress(job.progress);
        setPhase(job.phase);

        if (job.status === 'done') {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          const stemTracks = makeStemTracks(job.stems.length > 0 ? job.stems : DEFAULT_STEMS);
          setStems(stemTracks.map(s => ({ ...s, ready: true })));
          setStatus('done');
          setProgress(100);
        } else if (job.status === 'error') {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setErrorMsg(job.error ?? 'Demucs separation failed.');
          setStatus('error');
        } else if (job.status === 'running') {
          setStatus('separating');
        }
      } catch (err) {
        clearInterval(pollRef.current!);
        pollRef.current = null;
        setErrorMsg((err as Error).message);
        setStatus('error');
      }
    }, 2000);
  };

  const handleFile = async (file: File) => {
    if (!(file.type.startsWith('audio/') || file.name.match(/\.(mp3|wav|flac|aiff?|ogg|m4a)$/i))) {
      setErrorMsg('Please upload an audio file (mp3, wav, flac, aiff, ogg, m4a).');
      setStatus('error');
      return;
    }

    setFileName(file.name);
    setErrorMsg('');
    setStatus('uploading');
    setProgress(0);
    setPhase('Uploading…');

    // Reset stems to pending state
    const is6s = model === 'htdemucs_6s';
    const stemIds = is6s ? [...DEFAULT_STEMS, 'guitar', 'piano'] : DEFAULT_STEMS;
    setStems(makeStemTracks(stemIds));
    setPlayingId(null);

    try {
      const job = await separateStems(file, model);
      setJobId(job.jobId);
      setStatus('separating');
      setProgress(2);
      setPhase('Starting Demucs…');
      startPolling(job.jobId);
    } catch (err) {
      setErrorMsg((err as Error).message);
      setStatus('error');
    }
  };

  const toggleMute = (id: string) => {
    setStems(prev => prev.map(s => s.id === id ? { ...s, muted: !s.muted } : s));
  };

  const setVolume = (id: string, vol: number) => {
    setStems(prev => prev.map(s => s.id === id ? { ...s, volume: vol } : s));
    const audio = audioRefs.current[id];
    if (audio) audio.volume = vol / 100;
  };

  const togglePlay = (id: string) => {
    if (!jobId) return;
    const prevId = playingId;

    // Pause previous
    if (prevId && prevId !== id && audioRefs.current[prevId]) {
      audioRefs.current[prevId].pause();
    }

    if (prevId === id) {
      audioRefs.current[id]?.pause();
      setPlayingId(null);
    } else {
      const url = stemDownloadUrl(jobId, id);
      if (!audioRefs.current[id]) {
        audioRefs.current[id] = new Audio(url);
        audioRefs.current[id].onended = () => setPlayingId(null);
      } else {
        audioRefs.current[id].src = url;
        audioRefs.current[id].load(); // reset playback position when src changes
      }
      const stem = stems.find(s => s.id === id);
      audioRefs.current[id].volume = (stem?.volume ?? 80) / 100;
      audioRefs.current[id].muted = stem?.muted ?? false;
      audioRefs.current[id].play().catch(() => setPlayingId(null));
      setPlayingId(id);
    }
  };

  const reset = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    // Stop all audio
    for (const a of Object.values(audioRefs.current) as HTMLAudioElement[]) { a.pause(); a.src = ''; }
    audioRefs.current = {};
    setStatus('idle');
    setFileName('');
    setProgress(0);
    setPhase('');
    setErrorMsg('');
    setStems(INITIAL_STEMS);
    setPlayingId(null);
    setJobId(null);
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
                      {phase || (status === 'uploading' ? 'Uploading…' : 'Separating Stems…')}
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
                        className="h-full bg-brand rounded-full transition-all duration-500"
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
              <p className="text-[10px] text-red-300 break-words">{errorMsg}</p>
            </div>
          )}

          {/* Demucs info box */}
          <div className="bg-bg-main/50 rounded-xl border border-border-main p-3 flex flex-col gap-2 flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <Info size={11} className="text-brand flex-shrink-0" />
              <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">Demucs Backend</span>
              {backendInstalled === true && (
                <span className="ml-auto text-[8px] font-bold text-emerald-500 uppercase">● Ready</span>
              )}
              {backendInstalled === false && (
                <span className="ml-auto text-[8px] font-bold text-red-500 uppercase">● Offline</span>
              )}
            </div>
            <p className="text-[9px] text-neutral-500 leading-relaxed">
              Real separation via <span className="text-neutral-300 font-mono">demucs {selectedModel.label}</span> running on the local Express server.
            </p>
            {cachedModels.length > 0 ? (
              <p className="text-[9px] text-emerald-600 font-mono">
                Cached: {cachedModels.slice(0, 4).join(', ')}
              </p>
            ) : (
              <p className="text-[9px] text-neutral-600 leading-relaxed">
                Model files (~300 MB) download automatically on first use from dl.fbaipublicfiles.com.
              </p>
            )}
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
                      <a
                        href={jobId ? stemDownloadUrl(jobId, stem.id) : '#'}
                        download={`${stem.label.toLowerCase()}.mp3`}
                        className="p-1.5 rounded-lg bg-bg-surface border border-border-main text-neutral-500 hover:text-brand hover:border-brand/40 transition-all"
                        title={`Download ${stem.label} stem`}
                      >
                        <Download size={11} />
                      </a>
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
          {status === 'done' && jobId && (
            <div className="flex flex-col gap-2 flex-shrink-0">
              <div className="grid grid-cols-2 gap-2">
                {stems.filter(s => s.ready).map(stem => (
                  <a
                    key={stem.id}
                    href={stemDownloadUrl(jobId, stem.id)}
                    download={`${stem.label.toLowerCase()}.mp3`}
                    className="flex items-center justify-center gap-2 py-2 rounded-xl border border-border-main text-neutral-500 hover:text-neutral-200 hover:border-neutral-600 text-[9px] font-bold uppercase tracking-wider transition-all"
                    style={{ borderColor: stem.color + '40' }}
                  >
                    <Download size={11} style={{ color: stem.color }} /> {stem.label}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

