import { useState, useRef, useEffect } from "react";

export function usePerformanceMeter() {
  const [cpuPct, setCpuPct] = useState(0);
  const [ramStr, setRamStr] = useState("N/A");
  const rafMeterRef = useRef<number | null>(null);
  const lastRafTimeRef = useRef<number>(performance.now());
  const lastCpuRef = useRef<number>(0);
  const lastRamRef = useRef<string>("N/A");

  useEffect(() => {
    const tick = (now: number) => {
      const delta = now - lastRafTimeRef.current;
      lastRafTimeRef.current = now;
      const nextCpu = Math.min(99, Math.round((delta / 10) * 100) / 10);
      if (Math.abs(nextCpu - lastCpuRef.current) >= 0.5) {
        lastCpuRef.current = nextCpu;
        setCpuPct(nextCpu);
      }
      const mem = (
        performance as unknown as { memory?: { usedJSHeapSize: number } }
      ).memory;
      if (mem) {
        const mb = (mem.usedJSHeapSize / 1048576).toFixed(0);
        const nextRam = `${mb} MB`;
        if (nextRam !== lastRamRef.current) {
          lastRamRef.current = nextRam;
          setRamStr(nextRam);
        }
      }
      rafMeterRef.current = requestAnimationFrame(tick);
    };
    rafMeterRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafMeterRef.current !== null) cancelAnimationFrame(rafMeterRef.current);
    };
  }, []);

  return { cpuPct, ramStr };
}
