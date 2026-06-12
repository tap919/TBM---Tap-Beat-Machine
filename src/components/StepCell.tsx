import React, { useCallback } from "react";

export const StepCell = React.memo(function StepCell({
  trackId,
  step,
  isActive,
  trackColor,
  isCurrent,
  onToggle,
  stepCount,
  velocity,
  showVelocity,
}: {
  trackId: number;
  step: number;
  isActive: boolean;
  trackColor: string;
  isCurrent: boolean;
  onToggle: (trackId: number, step: number) => void;
  stepCount: 16 | 32 | 64;
  velocity?: number;
  showVelocity?: boolean;
}) {
  const handleClick = useCallback(
    () => onToggle(trackId, step),
    [onToggle, trackId, step],
  );
  const isBeat = step % 4 === 0;
  const isBar = step % 16 === 0;
  const vel = velocity ?? 1;
  return (
    <div
      className={`absolute h-full cursor-pointer transition-colors ${isCurrent ? "step-playhead" : ""}`}
      style={{
        left: `${step * (100 / stepCount)}%`,
        width: `${100 / stepCount}%`,
        backgroundColor: isActive
          ? trackColor + (isCurrent ? "60" : "40")
          : isBeat
            ? "rgba(255,255,255,0.015)"
            : undefined,
        borderLeft: isActive
          ? `1px solid ${trackColor}`
          : isBar
            ? "1px solid rgba(255,255,255,0.06)"
            : isBeat
              ? "1px solid rgba(255,255,255,0.03)"
              : undefined,
      }}
      onClick={handleClick}
    >
      {isActive && showVelocity && (
        <div
          className="absolute bottom-0 left-[1px] right-[1px] velocity-bar rounded-t-sm"
          style={{
            height: `${vel * 100}%`,
            backgroundColor: trackColor + "70",
            borderTop: `1px solid ${trackColor}`,
          }}
        />
      )}
    </div>
  );
}, (prev, next) => 
  prev.isActive === next.isActive && 
  prev.isCurrent === next.isCurrent &&
  prev.trackId === next.trackId &&
  prev.step === next.step &&
  prev.trackColor === next.trackColor &&
  prev.stepCount === next.stepCount &&
  prev.velocity === next.velocity &&
  prev.showVelocity === next.showVelocity
);
