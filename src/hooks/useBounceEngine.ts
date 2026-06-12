import { useState, useCallback } from "react";
import { DEFAULT_BPM } from "../lib/constants";
import { BounceEngine } from "../lib/TBMAudioEngine";
import type { BounceConfig, BounceResult, BounceFormat, Mp3Bitrate, TBMAudioEngine, Sequencer, Pad } from "../lib/TBMAudioEngine";

type BouncePhase = "idle" | "bouncing" | "done" | "error";

export function useBounceEngine() {
  const [showExportModal, setShowExportModal] = useState(false);
  const [bouncePhase, setBouncePhase] = useState<BouncePhase>("idle");
  const [bounceProgress, setBounceProgress] = useState(0);
  const [bounceResults, setBounceResults] = useState<BounceResult[]>([]);
  const [bounceError, setBounceError] = useState<string | null>(null);
  const [bounceBars, setBounceBars] = useState(4);
  const [bounceBpm, setBounceBpm] = useState(DEFAULT_BPM);
  const [bounceBitDepth, setBounceBitDepth] = useState<16 | 24 | 32>(24);
  const [bounceStemMode, setBounceStemMode] = useState(false);
  const [bounceFormat, setBounceFormat] = useState<BounceFormat>("wav");
  const [bounceMp3Kbps, setBounceMp3Kbps] = useState<Mp3Bitrate>(320);
  const [sendingToStudio, setSendingToStudio] = useState(false);

  const openExportModal = useCallback(() => {
    setBouncePhase("idle");
    setBounceProgress(0);
    setBounceResults([]);
    setBounceError(null);
    setSendingToStudio(false);
    setShowExportModal(true);
  }, []);

  const handleBounce = useCallback(
    async (engine: TBMAudioEngine | null, sequencer: Sequencer | null, pads: Pad[]) => {
      if (!engine || !sequencer) {
        setBounceError("Audio engine not ready");
        setBouncePhase("error");
        return;
      }

      const pattern = sequencer.getPattern();
      if (!pattern || pattern.length === 0) {
        setBounceError("No pattern loaded — open the Drums tab and create a pattern first");
        setBouncePhase("error");
        return;
      }

      const samples = engine.getSamples();
      if (samples.size === 0) {
        setBounceError("No samples loaded — load samples into pads first");
        setBouncePhase("error");
        return;
      }

      setBouncePhase("bouncing");
      setBounceProgress(0);
      setBounceError(null);
      setBounceResults([]);

      try {
        const bounceEngine = new BounceEngine(samples);
        const baseConfig: BounceConfig = {
          bars: bounceBars,
          bpm: bounceBpm,
          sampleRate: 48000,
          bitDepth: bounceBitDepth,
          channels: 2,
          format: bounceFormat,
          mp3Kbps: bounceMp3Kbps,
        };

        if (bounceStemMode) {
          const stemConfigs = [
            { name: "kicks", padIndices: [0, 1, 2, 3] },
            { name: "snares", padIndices: [4, 5, 6, 7] },
            { name: "hats", padIndices: [8, 9, 10, 11] },
            { name: "perc", padIndices: [12, 13, 14, 15] },
          ];
          const results = await bounceEngine.renderStems(
            pads, pattern, stemConfigs, baseConfig,
            (_stemIdx, _stemName, progress) => {
              setBounceProgress((_stemIdx + progress) / stemConfigs.length);
            },
          );
          setBounceResults(results);
        } else {
          const result = await bounceEngine.render(pads, pattern, baseConfig, (progress) => setBounceProgress(progress));
          setBounceResults([result]);
        }
        setBouncePhase("done");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error during bounce";
        setBounceError(msg);
        setBouncePhase("error");
      }
    },
    [bounceBars, bounceBpm, bounceBitDepth, bounceStemMode, bounceFormat, bounceMp3Kbps],
  );

  const downloadBounce = useCallback(
    (result: BounceResult) => {
      const ismp3 = result.format === "mp3" && result.mp3 !== null;
      const blob = ismp3 ? result.mp3! : result.wav;
      const ext = ismp3 ? "mp3" : "wav";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tbm_${result.stemName}_${bounceBars}bar_${bounceBpm}bpm.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    [bounceBars, bounceBpm],
  );

  const sendToStudio48 = useCallback(
    async (showNotification: (type: "success" | "error", message: string) => void) => {
      if (bounceResults.length === 0) return;
      setSendingToStudio(true);
      try {
        const formData = new FormData();
        bounceResults.forEach((result) => {
          const ismp3 = result.format === "mp3" && result.mp3 !== null;
          const blob = ismp3 ? result.mp3! : result.wav;
          const ext = ismp3 ? "mp3" : "wav";
          const filename = `tbm_${result.stemName}_${bounceBars}bar_${bounceBpm}bpm.${ext}`;
          formData.append("stems", new File([blob], filename, { type: ismp3 ? "audio/mpeg" : "audio/wav" }));
        });
        formData.append("metadata", JSON.stringify({
          source: "tbm", bpm: bounceBpm, bars: bounceBars,
          format: bounceFormat, mp3Kbps: bounceFormat === "mp3" ? bounceMp3Kbps : undefined,
          bitDepth: bounceFormat === "wav" ? bounceBitDepth : undefined, sampleRate: 48000,
          stems: bounceResults.map((r) => ({ name: r.stemName, format: r.format, durationSeconds: r.durationSeconds, peakAmplitude: r.peakAmplitude, rmsDbfs: r.rmsDbfs })),
        }));
        const res = await fetch("/api/export", { method: "POST", body: formData });
        if (!res.ok) { const errText = await res.text(); throw new Error(`Export failed: ${res.status} ${errText}`); }
        showNotification("success", "SENT TO STUDIO 48");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to send to Studio 48";
        showNotification("error", msg);
      } finally { setSendingToStudio(false); }
    },
    [bounceResults, bounceBars, bounceBpm, bounceBitDepth, bounceFormat, bounceMp3Kbps],
  );

  return {
    showExportModal, setShowExportModal,
    bouncePhase, bounceProgress, bounceResults, bounceError,
    bounceBars, setBounceBars,
    bounceBpm, setBounceBpm,
    bounceBitDepth, setBounceBitDepth,
    bounceStemMode, setBounceStemMode,
    bounceFormat, setBounceFormat,
    bounceMp3Kbps, setBounceMp3Kbps,
    sendingToStudio,
    openExportModal, handleBounce, downloadBounce, sendToStudio48,
    setBouncePhase,
  };
}
