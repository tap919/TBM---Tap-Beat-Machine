import { useState, useCallback } from "react";

interface UseDeckLoaderOptions {
  resumeAudio: () => Promise<void>;
  loadUrlToDeck: (deck: "A" | "B", url: string) => Promise<AudioBuffer | null>;
  detectBpm: (buffer: AudioBuffer) => number;
  setDeckBpm: (deck: "A" | "B", bpm: number) => void;
  showNotification: (type: "success" | "error", message: string) => void;
}

export function useDeckLoader(options: UseDeckLoaderOptions) {
  const { resumeAudio, loadUrlToDeck, detectBpm, setDeckBpm, showNotification } = options;

  const [externalBufferA, setExternalBufferA] = useState<AudioBuffer | null>(null);
  const [externalBufferB, setExternalBufferB] = useState<AudioBuffer | null>(null);
  const [externalNameA, setExternalNameA] = useState("");
  const [externalNameB, setExternalNameB] = useState("");

  const handleLoadDeckA = useCallback(
    async (url: string, name: string) => {
      await resumeAudio();
      try {
        const buffer = await loadUrlToDeck("A", url);
        if (buffer) {
          setExternalBufferA(buffer);
          setExternalNameA(name);
          const bpm = detectBpm(buffer);
          if (bpm > 0) setDeckBpm("A", bpm);
        }
        showNotification("success", `Deck A: ${name}`);
      } catch { showNotification("error", "Failed to load track to Deck A"); }
    },
    [resumeAudio, loadUrlToDeck, detectBpm, setDeckBpm, showNotification],
  );

  const handleLoadDeckB = useCallback(
    async (url: string, name: string) => {
      await resumeAudio();
      try {
        const buffer = await loadUrlToDeck("B", url);
        if (buffer) {
          setExternalBufferB(buffer);
          setExternalNameB(name);
          const bpm = detectBpm(buffer);
          if (bpm > 0) setDeckBpm("B", bpm);
        }
        showNotification("success", `Deck B: ${name}`);
      } catch { showNotification("error", "Failed to load track to Deck B"); }
    },
    [resumeAudio, loadUrlToDeck, detectBpm, setDeckBpm, showNotification],
  );

  return {
    externalBufferA, externalBufferB, externalNameA, externalNameB,
    handleLoadDeckA, handleLoadDeckB,
  };
}
