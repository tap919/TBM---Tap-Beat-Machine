import { useState, useCallback } from "react";

export interface MacroSnapshot {
  id: string;
  name: string;
  values: number[];
}

function loadSnapshots(): MacroSnapshot[] {
  try {
    const saved = localStorage.getItem("tbm_macro_snapshots");
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
}

function saveSnapshots(snapshots: MacroSnapshot[]) {
  try { localStorage.setItem("tbm_macro_snapshots", JSON.stringify(snapshots)); } catch { /* ignore */ }
}

export function useMacroControls() {
  const [macroValues, setMacroValues] = useState<number[]>(Array(8).fill(0.5));
  const [snapshots, setSnapshots] = useState<MacroSnapshot[]>(loadSnapshots);

  const handleMacroChange = useCallback((index: number, value: number) => {
    setMacroValues((prev) => { const next = [...prev]; next[index] = value; return next; });
  }, []);

  const handleSaveSnapshot = useCallback(
    (name: string) => {
      const snap: MacroSnapshot = { id: `snap-${Date.now()}`, name, values: [...macroValues] };
      setSnapshots((prev) => { const next = [...prev, snap]; saveSnapshots(next); return next; });
    },
    [macroValues],
  );

  const handleLoadSnapshot = useCallback(
    (id: string) => {
      const snap = snapshots.find((s) => s.id === id);
      if (snap) {
        setMacroValues([...snap.values]);
        snap.values.forEach((v, i) => handleMacroChange(i, v));
      }
    },
    [snapshots, handleMacroChange],
  );

  const handleMorphToSnapshot = useCallback(
    (id: string, duration: number) => {
      const snap = snapshots.find((s) => s.id === id);
      if (!snap) return;
      const startValues = [...macroValues];
      const targetValues = snap.values;
      const startTime = performance.now();
      const morph = (now: number) => {
        const elapsed = (now - startTime) / 1000;
        const t = Math.min(1, elapsed / duration);
        const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        const newValues = startValues.map((sv, i) => sv + (targetValues[i] - sv) * eased);
        setMacroValues(newValues);
        if (t < 1) requestAnimationFrame(morph);
      };
      requestAnimationFrame(morph);
    },
    [macroValues, snapshots],
  );

  return {
    macroValues, snapshots,
    handleMacroChange, handleSaveSnapshot, handleLoadSnapshot, handleMorphToSnapshot,
  };
}
