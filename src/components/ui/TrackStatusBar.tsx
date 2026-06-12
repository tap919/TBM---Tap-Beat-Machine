import React, { useState, useEffect } from 'react';
import { useTBMAudio } from '../../contexts/TBMAudioContext';
import { type TrackSlot, TRACK_TYPE_LABELS } from '../../lib/trackRouter';

/**
 * TrackStatusBar — compact visual indicator showing mixer channel
 * occupancy from the shared TrackRouter. Drop into any component
 * header to give producers at-a-glance visibility of what's on
 * each mixer channel.
 *
 * Props:
 *  - maxVisible: how many channels to show (default 16)
 *  - compact: if true, shows only the dot strip without labels
 */
interface TrackStatusBarProps {
  maxVisible?: number;
  compact?: boolean;
}

export function TrackStatusBar({ maxVisible = 16, compact = false }: TrackStatusBarProps) {
  const { trackRouter } = useTBMAudio();
  const [slots, setSlots] = useState<TrackSlot[]>(trackRouter?.slots || []);

  useEffect(() => {
    if (!trackRouter) return;
    const unsub = trackRouter.subscribe((updated) => setSlots(updated));
    return unsub;
  }, [trackRouter]);

  const visible = slots.slice(0, maxVisible);
  const occupied = visible.filter(s => s.occupied).length;

  if (compact) {
    return (
      <div className="flex items-center gap-1" title={`${occupied}/${visible.length} mixer channels used`}>
        <div className="flex gap-px">
          {visible.map((slot, i) => (
            <div
              key={i}
              className="w-1.5 h-3 rounded-sm transition-colors"
              style={{ backgroundColor: slot.occupied ? slot.color : '#333' }}
              title={slot.occupied ? `${slot.name}: ${TRACK_TYPE_LABELS[slot.type]}` : `Track ${i + 1}: Empty`}
            />
          ))}
        </div>
        <span className="text-[9px] font-mono text-neutral-600 ml-0.5">
          {occupied}/{visible.length}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 bg-neutral-900/60 border border-neutral-800 rounded-lg px-2 py-1">
      <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-600 shrink-0">Tracks</span>
      <div className="flex gap-0.5">
        {visible.map((slot, i) => (
          <div
            key={i}
            className="w-2 h-4 rounded-sm transition-colors cursor-default"
            style={{ backgroundColor: slot.occupied ? slot.color : '#333' }}
            title={slot.occupied ? `${slot.name}: ${TRACK_TYPE_LABELS[slot.type]}` : `Track ${i + 1}: Empty`}
          />
        ))}
      </div>
      <span className="text-[9px] font-mono text-neutral-600 shrink-0">
        {occupied}/{visible.length}
      </span>
    </div>
  );
}
