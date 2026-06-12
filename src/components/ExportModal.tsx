import {
  Download, X, FileAudio, Loader2, AlertCircle, CheckCircle2, Upload,
} from "lucide-react";
import type { BounceFormat, Mp3Bitrate, BounceResult } from "../lib/TBMAudioEngine";

type BouncePhase = "idle" | "bouncing" | "done" | "error";

interface Props {
  show: boolean;
  phase: BouncePhase;
  progress: number;
  results: BounceResult[];
  error: string | null;
  bounceBars: number;
  bounceBpm: number;
  bounceBitDepth: 16 | 24 | 32;
  bounceStemMode: boolean;
  bounceFormat: BounceFormat;
  bounceMp3Kbps: Mp3Bitrate;
  sendingToStudio: boolean;
  onClose: () => void;
  onBounceBarsChange: (v: number) => void;
  onBounceBpmChange: (v: number) => void;
  onBounceBitDepthChange: (v: 16 | 24 | 32) => void;
  onBounceStemModeChange: (v: boolean) => void;
  onBounceFormatChange: (v: BounceFormat) => void;
  onBounceMp3KbpsChange: (v: Mp3Bitrate) => void;
  onBounce: () => void;
  onDownload: (result: BounceResult) => void;
  onSendToStudio: () => void;
  onReset: () => void;
}

export function ExportModal({
  show, phase, progress, results, error,
  bounceBars, bounceBpm, bounceBitDepth, bounceStemMode, bounceFormat, bounceMp3Kbps, sendingToStudio,
  onClose, onBounceBarsChange, onBounceBpmChange, onBounceBitDepthChange, onBounceStemModeChange,
  onBounceFormatChange, onBounceMp3KbpsChange, onBounce, onDownload, onSendToStudio, onReset,
}: Props) {
  if (!show) return null;

  return (
    <div className="absolute inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-8">
      <div className="bg-bg-surface border border-border-main rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] panel-inset">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-main bg-bg-main/40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand/15 border border-brand/30 flex items-center justify-center">
              <Download size={15} className="text-brand" />
            </div>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-200">Audio Bounce</h2>
              <p className="text-[13px] text-neutral-500 font-mono uppercase">
                Offline render · {bounceFormat === "mp3" ? `MP3 ${bounceMp3Kbps} kbps` : "WAV 48 kHz · BWF"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-bg-main/60 transition-all">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar space-y-5">
          {phase === "idle" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-bold uppercase tracking-wider text-neutral-500">BPM</label>
                  <input type="number" min={20} max={300} value={bounceBpm}
                    onChange={(e) => onBounceBpmChange(Math.max(20, Math.min(300, Number(e.target.value))))}
                    className="w-full bg-bg-main border border-border-main rounded-lg px-3 py-2 text-sm font-mono text-neutral-200 outline-none focus:border-brand/60 transition-colors"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-bold uppercase tracking-wider text-neutral-500">Bars</label>
                  <input type="number" min={1} max={32} value={bounceBars}
                    onChange={(e) => onBounceBarsChange(Math.max(1, Math.min(32, Number(e.target.value))))}
                    className="w-full bg-bg-main border border-border-main rounded-lg px-3 py-2 text-sm font-mono text-neutral-200 outline-none focus:border-brand/60 transition-colors"
                  />
                </div>
              </div>
              {bounceFormat === "wav" && (
                <div className="space-y-1.5">
                  <label className="text-[13px] font-bold uppercase tracking-wider text-neutral-500">Bit Depth</label>
                  <div className="flex gap-2">
                    {([16, 24, 32] as const).map((bd) => (
                      <button key={bd} onClick={() => onBounceBitDepthChange(bd)}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border ${
                          bounceBitDepth === bd ? "bg-brand/15 border-brand/50 text-brand" : "bg-bg-main border-border-main text-neutral-500 hover:text-neutral-300 hover:border-neutral-600"
                        }`}
                      >{bd}-bit{bd === 32 ? " float" : ""}</button>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-[13px] font-bold uppercase tracking-wider text-neutral-500">Format</label>
                <div className="flex gap-2">
                  {(["wav", "mp3"] as const).map((fmt) => (
                    <button key={fmt} onClick={() => onBounceFormatChange(fmt)}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border ${
                        bounceFormat === fmt ? "bg-brand/15 border-brand/50 text-brand" : "bg-bg-main border-border-main text-neutral-500 hover:text-neutral-300 hover:border-neutral-600"
                      }`}
                    >{fmt === "wav" ? "WAV" : "MP3"}</button>
                  ))}
                </div>
              </div>
              {bounceFormat === "mp3" && (
                <div className="space-y-1.5">
                  <label className="text-[13px] font-bold uppercase tracking-wider text-neutral-500">Bitrate</label>
                  <div className="flex gap-2">
                    {([128, 192, 256, 320] as const).map((br) => (
                      <button key={br} onClick={() => onBounceMp3KbpsChange(br)}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border ${
                          bounceMp3Kbps === br ? "bg-brand/15 border-brand/50 text-brand" : "bg-bg-main border-border-main text-neutral-500 hover:text-neutral-300 hover:border-neutral-600"
                        }`}
                      >{br}k</button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between bg-bg-main/50 rounded-xl border border-border-main p-4">
                <div>
                  <div className="text-sm font-bold uppercase tracking-wider text-neutral-300">Stem Export</div>
                  <div className="text-[13px] text-neutral-500 font-mono mt-0.5">
                    {bounceStemMode ? "Kicks · Snares · Hats · Perc (4 stems)" : "Single full mix bounce"}
                  </div>
                </div>
                <button onClick={() => onBounceStemModeChange(!bounceStemMode)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${bounceStemMode ? "bg-brand" : "bg-neutral-700"}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${bounceStemMode ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
              </div>
              <div className="text-[13px] font-mono text-neutral-500 text-center">
                Duration: {((bounceBars * 4 * 60) / bounceBpm).toFixed(2)}s · {bounceBars * 16} steps · {bounceFormat === "mp3" ? `MP3 ${bounceMp3Kbps} kbps` : `WAV 48 kHz ${bounceBitDepth}-bit`}
              </div>
              <button onClick={onBounce}
                className="w-full py-3 rounded-xl bg-brand hover:opacity-90 active:scale-[0.98] text-white text-sm font-bold uppercase tracking-widest shadow-lg shadow-brand/20 transition-all flex items-center justify-center gap-2"
              ><FileAudio size={16} /> Bounce to {bounceFormat === "mp3" ? "MP3" : "WAV"}</button>
            </>
          )}

          {phase === "bouncing" && (
            <div className="space-y-4 py-8">
              <div className="flex items-center justify-center gap-3">
                <Loader2 size={20} className="text-brand animate-spin" />
                <span className="text-sm font-bold uppercase tracking-widest text-neutral-300">Rendering offline...</span>
              </div>
              <div className="w-full bg-neutral-800 rounded-full h-2 overflow-hidden">
                <div className="h-full bg-brand rounded-full transition-all duration-200" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <div className="text-center text-[13px] font-mono text-neutral-500">{Math.round(progress * 100)}%</div>
            </div>
          )}

          {phase === "error" && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3 bg-red-950/40 border border-red-700/40 rounded-xl p-4">
                <AlertCircle size={18} className="text-red-400 shrink-0" />
                <div className="text-sm text-red-300">{error}</div>
              </div>
              <button onClick={onReset} className="w-full py-2 rounded-lg border border-border-main text-neutral-400 hover:text-neutral-200 text-xs font-bold uppercase tracking-wider transition-colors">
                Back to Config
              </button>
            </div>
          )}

          {phase === "done" && results.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 size={16} />
                <span className="text-sm font-bold uppercase tracking-widest">Bounce Complete</span>
              </div>
              <div className="space-y-2">
                {results.map((result, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-bg-main/50 rounded-xl border border-border-main p-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileAudio size={16} className="text-brand shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-bold uppercase tracking-wider text-neutral-200 truncate">{result.stemName}</div>
                        <div className="text-[13px] font-mono text-neutral-500">
                          {result.durationSeconds.toFixed(2)}s · Peak {(result.peakAmplitude * 100).toFixed(1)}% · RMS{" "}
                          {result.rmsDbfs === -Infinity ? "-inf" : result.rmsDbfs.toFixed(1)} dBFS
                        </div>
                      </div>
                    </div>
                    <button onClick={() => onDownload(result)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-main border border-border-main text-neutral-400 hover:text-white hover:border-brand/50 transition-all text-[13px] font-bold uppercase tracking-wider shrink-0"
                    ><Download size={12} /> {result.format === "mp3" && result.mp3 ? "MP3" : "WAV"}</button>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                {results.length > 1 && (
                  <button onClick={() => results.forEach((r, idx) => setTimeout(() => onDownload(r), idx * 300))}
                    className="flex-1 py-2.5 rounded-xl border border-border-main text-neutral-300 hover:text-white hover:border-brand/50 text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2"
                  ><Download size={14} /> Download All</button>
                )}
                <button onClick={onSendToStudio} disabled={sendingToStudio}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
                >{sendingToStudio ? <><Loader2 size={14} className="animate-spin" /> Sending...</> : <><Upload size={14} /> Send to Studio 48</>}</button>
              </div>
              <button onClick={onReset} className="w-full py-2 rounded-lg border border-border-main text-neutral-500 hover:text-neutral-300 text-[13px] font-bold uppercase tracking-wider transition-colors">
                Bounce Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
