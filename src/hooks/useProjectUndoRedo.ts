import { useState, useCallback, useRef, useEffect } from "react";
import type { Sequencer, Pad } from "../lib/TBMAudioEngine";

export interface FullProjectSnapshot {
  key: string;
  abState: "A" | "B";
  pads?: Pad[];
  patterns?: Record<string, boolean[][]>;
  bpm?: number;
  swing?: number;
}

interface UseUndoRedoOptions {
  sequencer: Sequencer | null;
  pads: Pad[];
  setPads: (pads: Pad[]) => void;
  setBpm: (bpm: number) => void;
  onNotify?: (message: string) => void;
}

export function useProjectUndoRedo(options: UseUndoRedoOptions) {
  const { sequencer, pads, setPads, setBpm } = options;

  const [snapshot, setSnapshot] = useState<FullProjectSnapshot>({
    key: "Cm",
    abState: "A",
    pads: [],
    patterns: {},
    bpm: 120,
    swing: 0,
  });
  const [undoStack, setUndoStack] = useState<FullProjectSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<FullProjectSnapshot[]>([]);

  const padsRef = useRef(pads);
  const undoPadsRef = useRef(setPads);
  const undoSeqRef = useRef(sequencer);
  const undoSetBpmRef = useRef(setBpm);

  useEffect(() => {
    padsRef.current = pads;
    undoPadsRef.current = setPads;
    undoSeqRef.current = sequencer;
    undoSetBpmRef.current = setBpm;
  }, [pads, setPads, sequencer, setBpm]);

  const projectKey = snapshot.key;
  const activeState = snapshot.abState;

  const captureFullState = useCallback(
    (current: FullProjectSnapshot): FullProjectSnapshot => {
      const seq = undoSeqRef.current;
      const seqState = seq?.getState?.();
      const allPatterns = seq?.getAllPatterns?.();
      return {
        key: current.key,
        abState: current.abState,
        pads: [...padsRef.current],
        patterns: allPatterns ?? {},
        bpm: seq?.getBpm?.() ?? current.bpm,
        swing: seqState?.swing ?? current.swing,
      };
    },
    [],
  );

  const applySnapshot = useCallback((s: FullProjectSnapshot) => {
    const seq = undoSeqRef.current;
    if (seq && s.patterns) {
      for (const [id, steps] of Object.entries(s.patterns)) {
        if (steps.length > 0) seq.setPattern(id, steps);
      }
      if (s.bpm !== undefined) seq.setBpm(s.bpm);
      if (seq.setSwing && s.swing !== undefined) seq.setSwing(s.swing);
    }
    if (s.pads && s.pads.length > 0) {
      const sp = undoPadsRef.current;
      if (sp) sp(s.pads);
    }
    if (s.bpm !== undefined && s.bpm > 0) undoSetBpmRef.current?.(s.bpm);
  }, []);

  const pushSnapshot = useCallback((next: FullProjectSnapshot) => {
    setSnapshot((prev) => {
      const fullPrev = captureFullState(prev);
      setUndoStack((u) => [fullPrev, ...u].slice(0, 50));
      setRedoStack([]);
      return next;
    });
  }, [captureFullState]);

  const setProjectKey = useCallback(
    (k: string) => {
      setSnapshot((prev) => {
        setUndoStack((u) => [captureFullState(prev), ...u].slice(0, 50));
        setRedoStack([]);
        return { ...prev, key: k };
      });
    },
    [captureFullState],
  );

  const setActiveState = useCallback(
    (s: "A" | "B") => {
      setSnapshot((prev) => {
        setUndoStack((u) => [captureFullState(prev), ...u].slice(0, 50));
        setRedoStack([]);
        return { ...prev, abState: s };
      });
    },
    [captureFullState],
  );

  const handleUndo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const top = prev[0];
      const rest = prev.slice(1);
      setSnapshot((current) => {
        setRedoStack((r) => [captureFullState(current), ...r].slice(0, 50));
        return top;
      });
      setTimeout(() => applySnapshot(top), 0);
      return rest;
    });
  }, [captureFullState, applySnapshot]);

  const handleRedo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const top = prev[0];
      const rest = prev.slice(1);
      setSnapshot((current) => {
        setUndoStack((u) => [captureFullState(current), ...u].slice(0, 50));
        return top;
      });
      setTimeout(() => applySnapshot(top), 0);
      return rest;
    });
  }, [captureFullState, applySnapshot]);

  return {
    snapshot,
    setSnapshot,
    projectKey,
    activeState,
    undoStack,
    redoStack,
    setUndoStack,
    setRedoStack,
    captureFullState,
    applySnapshot,
    pushSnapshot,
    setProjectKey,
    setActiveState,
    handleUndo,
    handleRedo,
    undoSeqRef,
    bSnapshotRef: useRef<{ pattern: boolean[][]; bpm: number } | null>(null),
  };
}
