import React from "react";
import {
  SlidersHorizontal,
  Link2,
  Filter,
  Activity,
  Repeat,
} from "lucide-react";
import type { PadFilterType } from "../lib/TBMAudioEngine";

type VelocityCurveType = 'linear' | 'exponential' | 'logarithmic' | 'constant';

interface TrackSettings {
  chokeGroup: number | null;
  filterType: PadFilterType;
  filterCutoff: number;
  filterResonance: number;
  swing: number;
  muted: boolean;
  solo: boolean;
  velocityCurve: VelocityCurveType;
  padSensitivity: number;
  minVelocity: number;
  maxVelocity: number;
  timeStretch: number;
  pitchShift: number;
}

interface TrackDetailPanelProps {
  activeTrack: number;
  trackSettings: TrackSettings[];
  showTrackDetail: boolean;
  setShowTrackDetail: (v: boolean | ((prev: boolean) => boolean)) => void;
  onUpdateTrack: (trackId: number, patch: Partial<TrackSettings>) => void;
  TRACK_NAMES: readonly string[];
  CHOKE_COLORS: Record<number, string>;
}

export function TrackDetailPanel({
  activeTrack,
  trackSettings,
  showTrackDetail,
  setShowTrackDetail,
  onUpdateTrack,
  TRACK_NAMES,
  CHOKE_COLORS,
}: TrackDetailPanelProps) {
  const activeSettings = trackSettings[activeTrack];

  return (
    <div className="bg-neutral-800/50 rounded-lg border border-neutral-700/50 p-3 flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-2">
          <SlidersHorizontal size={12} />{" "}
          {TRACK_NAMES[activeTrack] ?? `Track ${activeTrack + 1}`}
        </h3>
        <button
          onClick={() => setShowTrackDetail((v: boolean) => !v)}
          className="text-xs font-bold text-neutral-600 hover:text-neutral-300 uppercase transition-colors"
        >
          {showTrackDetail ? "Hide" : "Show"}
        </button>
      </div>

      {showTrackDetail && (
        <div className="flex flex-col gap-3">
          {/* Choke Group */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <Link2 size={10} className="text-neutral-500" />
              <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Choke Group</span>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => onUpdateTrack(activeTrack, { chokeGroup: null })}
                className={`px-2 py-1 text-[11px] font-bold uppercase border rounded ${
                  activeSettings.chokeGroup === null
                    ? "bg-red-600 border-red-500 text-white"
                    : "bg-neutral-800 border-neutral-700 text-neutral-500 hover:border-neutral-600"
                }`}
              >
                None
              </button>
              {[1, 2, 3, 4].map((g) => (
                <button
                  key={g}
                  onClick={() => onUpdateTrack(activeTrack, { chokeGroup: g })}
                  className={`px-2 py-1 text-[11px] font-bold uppercase border rounded ${
                    activeSettings.chokeGroup === g
                      ? "border-white text-white"
                      : "bg-neutral-800 border-neutral-700 text-neutral-500 hover:border-neutral-600"
                  }`}
                  style={activeSettings.chokeGroup === g ? { backgroundColor: CHOKE_COLORS[g] + "60", borderColor: CHOKE_COLORS[g] } : undefined}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Filter */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <Filter size={10} className="text-neutral-500" />
              <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Filter</span>
            </div>
            <div className="flex gap-1">
              {(["off", "lp", "hp", "bp"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => onUpdateTrack(activeTrack, { filterType: type })}
                  className={`px-2 py-1 text-[11px] font-bold uppercase border rounded ${
                    activeSettings.filterType === type
                      ? "bg-cyan-600 border-cyan-500 text-white"
                      : "bg-neutral-800 border-neutral-700 text-neutral-500 hover:border-neutral-600"
                  }`}
                >
                  {type === "off" ? "Off" : type === "lp" ? "LP" : type === "hp" ? "HP" : "BP"}
                </button>
              ))}
            </div>
            {activeSettings.filterType !== "off" && (
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-neutral-500">
                  <span>Cutoff</span>
                  <span>{activeSettings.filterCutoff}</span>
                </div>
                <input
                  type="range" min={0} max={127}
                  value={activeSettings.filterCutoff}
                  onChange={(e) => onUpdateTrack(activeTrack, { filterCutoff: parseInt(e.target.value, 10) })}
                  className="w-full h-1 bg-neutral-800 appearance-none accent-cyan-500"
                />
                <div className="flex justify-between text-[11px] text-neutral-500">
                  <span>Resonance</span>
                  <span>{activeSettings.filterResonance}</span>
                </div>
                <input
                  type="range" min={0} max={127}
                  value={activeSettings.filterResonance}
                  onChange={(e) => onUpdateTrack(activeTrack, { filterResonance: parseInt(e.target.value, 10) })}
                  className="w-full h-1 bg-neutral-800 appearance-none accent-cyan-500"
                />
              </div>
            )}
          </div>

          {/* Velocity Curve */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <Activity size={10} className="text-neutral-500" />
              <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Velocity</span>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={activeSettings.velocityCurve}
                onChange={(e) => onUpdateTrack(activeTrack, { velocityCurve: e.target.value as VelocityCurveType })}
                className="flex-1 bg-neutral-800 border border-neutral-700 text-xs text-neutral-300 rounded px-1 py-1"
              >
                <option value="linear">Linear</option>
                <option value="exponential">Exponential</option>
                <option value="logarithmic">Logarithmic</option>
                <option value="constant">Constant</option>
              </select>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-[10px] text-neutral-600">Sensitivity</span>
              <input
                type="range" min={0} max={100} step={1}
                value={activeSettings.padSensitivity}
                onChange={(e) => onUpdateTrack(activeTrack, { padSensitivity: parseInt(e.target.value, 10) })}
                className="flex-1 h-1 bg-neutral-800 appearance-none accent-cyan-500"
              />
              <span className="text-[10px] font-mono text-neutral-500 w-6">{activeSettings.padSensitivity}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] text-neutral-600">Min</span>
              <input
                type="range" min={0} max={100} step={1}
                value={activeSettings.minVelocity * 100}
                onChange={(e) => onUpdateTrack(activeTrack, { minVelocity: parseInt(e.target.value, 10) / 100 })}
                className="flex-1 h-1 bg-neutral-800 appearance-none accent-green-500"
              />
              <span className="text-[10px] font-mono text-neutral-500 w-6">{Math.round(activeSettings.minVelocity * 100)}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] text-neutral-600">Max</span>
              <input
                type="range" min={0} max={100} step={1}
                value={activeSettings.maxVelocity * 100}
                onChange={(e) => onUpdateTrack(activeTrack, { maxVelocity: parseInt(e.target.value, 10) / 100 })}
                className="flex-1 h-1 bg-neutral-800 appearance-none accent-green-500"
              />
              <span className="text-[10px] font-mono text-neutral-500 w-6">{Math.round(activeSettings.maxVelocity * 100)}</span>
            </div>
          </div>

          {/* Per-track Swing */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <Repeat size={10} className="text-neutral-500" />
              <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Track Swing</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range" min={0} max={100} step={1}
                value={activeSettings.swing}
                onChange={(e) => onUpdateTrack(activeTrack, { swing: parseInt(e.target.value, 10) })}
                className="flex-1 h-1 bg-neutral-800 appearance-none accent-red-500"
              />
              <span className="text-[13px] font-mono text-neutral-400 min-w-10">
                {activeSettings.swing === 0 ? "Global" : `${activeSettings.swing}%`}
              </span>
            </div>
          </div>

          {/* Time Stretch + Pitch Shift */}
          <div className="flex flex-col gap-1 border-t border-neutral-800 pt-2 mt-1">
            <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Time & Pitch</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-neutral-600 min-w-14">Stretch</span>
              <input
                type="range" min={50} max={200} step={1}
                value={Math.round(activeSettings.timeStretch * 100)}
                onChange={(e) => onUpdateTrack(activeTrack, { timeStretch: parseInt(e.target.value, 10) / 100 })}
                className="flex-1 h-1 bg-neutral-800 appearance-none accent-purple-500"
              />
              <span className="text-[11px] font-mono text-neutral-400 w-10 text-right">
                {Math.round(activeSettings.timeStretch * 100)}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-neutral-600 min-w-14">Pitch</span>
              <input
                type="range" min={-12} max={12} step={1}
                value={activeSettings.pitchShift}
                onChange={(e) => onUpdateTrack(activeTrack, { pitchShift: parseInt(e.target.value, 10) })}
                className="flex-1 h-1 bg-neutral-800 appearance-none accent-purple-500"
              />
              <span className="text-[11px] font-mono text-neutral-400 w-10 text-right">
                {activeSettings.pitchShift > 0 ? "+" : ""}{activeSettings.pitchShift}
              </span>
            </div>
          </div>

          {/* Mute / Solo */}
          <div className="flex gap-2">
            <button
              onClick={() => onUpdateTrack(activeTrack, { muted: !activeSettings.muted })}
              className={`flex-1 py-1.5 text-[11px] font-bold uppercase border rounded ${
                activeSettings.muted
                  ? "bg-yellow-600 border-yellow-500 text-white"
                  : "bg-neutral-800 border-neutral-700 text-neutral-500 hover:border-neutral-600"
              }`}
            >
              {activeSettings.muted ? "Unmute" : "Mute"}
            </button>
            <button
              onClick={() => onUpdateTrack(activeTrack, { solo: !activeSettings.solo })}
              className={`flex-1 py-1.5 text-[11px] font-bold uppercase border rounded ${
                activeSettings.solo
                  ? "bg-green-600 border-green-500 text-white"
                  : "bg-neutral-800 border-neutral-700 text-neutral-500 hover:border-neutral-600"
              }`}
            >
              {activeSettings.solo ? "Unsolo" : "Solo"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
