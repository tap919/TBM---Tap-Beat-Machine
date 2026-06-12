import React, { useState, useCallback, useEffect } from 'react';
import { Play, Square, Circle, Repeat, Volume2, Clock, Zap } from 'lucide-react';
import { useTBMAudio } from '../../contexts/TBMAudioContext';

interface MPCTransportProps {
  isPlaying: boolean;
  isRecording?: boolean;
  isLooping?: boolean;
  bpm: number;
  currentStep: number;
  totalSteps: number;
  onPlay: () => void;
  onStop: () => void;
  onRecord?: () => void;
  onLoopToggle?: () => void;
  onTapTempo?: (bpm: number) => void;
  onMetronomeToggle?: () => void;
  onQuantize?: () => void;
  metronomeEnabled?: boolean;
  quantizeEnabled?: boolean;
}

export const MPCTransport = ({
  isPlaying,
  isRecording = false,
  isLooping = false,
  bpm,
  currentStep,
  totalSteps,
  onPlay,
  onStop,
  onRecord,
  onLoopToggle,
  onTapTempo,
  onMetronomeToggle,
  onQuantize,
  metronomeEnabled = false,
  quantizeEnabled = false,
}: MPCTransportProps) => {
  const { projectKey } = useTBMAudio();
  const [tapTimes, setTapTimes] = useState<number[]>([]);
  const [positionDisplay, setPositionDisplay] = useState<string>('1:1:0');

  // Calculate position display (Bar:Beat:Step)
  useEffect(() => {
    const bars = Math.floor(currentStep / 16) + 1;
    const beats = Math.floor((currentStep % 16) / 4) + 1;
    const steps = currentStep % 4;
    setPositionDisplay(`${bars}:${beats}:${steps}`);
  }, [currentStep]);

  const handleTapTempo = useCallback(() => {
    const now = Date.now();
    const newTapTimes = [...tapTimes, now].slice(-4);
    setTapTimes(newTapTimes);

    if (newTapTimes.length >= 2) {
      const intervals = [];
      for (let i = 1; i < newTapTimes.length; i++) {
        intervals.push(newTapTimes[i] - newTapTimes[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const calculatedBpm = Math.round(60000 / avgInterval);
      if (onTapTempo) onTapTempo(calculatedBpm);
    }
  }, [tapTimes, onTapTempo]);

  const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      action();
    }
  };

  return (
    <div className="flex flex-col gap-3 bg-neutral-900 rounded-lg border border-neutral-800 p-4 glass">
      {/* Top row: Position display and BPM */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          {/* Position Display */}
          <div className="bg-neutral-950 px-3 py-1.5 rounded border border-neutral-800">
            <div className="text-[10px] font-mono text-neutral-600 uppercase tracking-wider">
              Position
            </div>
            <div className="text-lg font-mono text-white font-bold tracking-wider">
              {positionDisplay}
            </div>
          </div>

          {/* BPM Display */}
          <div className="bg-neutral-950 px-3 py-1.5 rounded border border-neutral-800">
            <div className="text-[10px] font-mono text-neutral-600 uppercase tracking-wider">
              BPM
            </div>
            <div className="text-lg font-mono text-red-500 font-bold">
              {bpm}
            </div>
          </div>

          {/* Key Display */}
          <div className="bg-neutral-950 px-3 py-1.5 rounded border border-neutral-800">
            <div className="text-[10px] font-mono text-neutral-600 uppercase tracking-wider">
              Key
            </div>
            <div className="text-lg font-mono text-blue-400 font-bold">
              {projectKey || "None"}
            </div>
          </div>

          {/* Steps Display */}
          <div className="bg-neutral-950 px-3 py-1.5 rounded border border-neutral-800">
            <div className="text-[10px] font-mono text-neutral-600 uppercase tracking-wider">
              Steps
            </div>
            <div className="text-lg font-mono text-blue-500 font-bold">
              {totalSteps}
            </div>
          </div>
        </div>

        {/* Metronome and Quantize Toggles */}
        <div className="flex gap-2">
          <button
            onClick={onMetronomeToggle}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-[13px] font-bold uppercase transition-all border ${metronomeEnabled ? "bg-yellow-600/20 text-yellow-400 border-yellow-500/50" : "bg-neutral-800 text-neutral-500 border-neutral-700"}`}
            title="Metronome"
          >
            <Volume2 size={12} /> Click
          </button>
          <button
            onClick={onQuantize}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-[13px] font-bold uppercase transition-all border ${quantizeEnabled ? "bg-green-600/20 text-green-400 border-green-500/50" : "bg-neutral-800 text-neutral-500 border-neutral-700"}`}
            title="Quantize"
          >
            <Zap size={12} /> Quantize
          </button>
        </div>
      </div>

      {/* Bottom row: Transport controls */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {/* Main Transport */}
          <div className="flex gap-1" role="group" aria-label="Transport controls">
            <button
              onClick={() => (isPlaying ? onStop() : onPlay())}
              onKeyDown={(e) => handleKeyDown(e, () => (isPlaying ? onStop() : onPlay()))}
              tabIndex={0}
              className={`p-3 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 ${isPlaying ? 'bg-emerald-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-white'}`}
              aria-label={isPlaying ? 'Stop playback' : 'Start playback'}
              aria-pressed={isPlaying}
            >
              <Play size={20} fill={isPlaying ? 'currentColor' : 'none'} />
            </button>
            <button
              onClick={onStop}
              onKeyDown={(e) => handleKeyDown(e, onStop)}
              tabIndex={0}
              className="p-3 rounded bg-neutral-800 text-neutral-400 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
              aria-label="Stop"
            >
              <Square size={20} fill="currentColor" />
            </button>
            {onRecord !== undefined && (
              <button
                onClick={onRecord}
                onKeyDown={(e) => onRecord && handleKeyDown(e, onRecord)}
                tabIndex={0}
                className={`p-3 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 ${isRecording ? 'bg-red-600 text-white animate-pulse' : 'bg-neutral-800 text-neutral-400 hover:text-red-500'}`}
                aria-label={isRecording ? 'Stop recording' : 'Start recording'}
                aria-pressed={isRecording}
              >
                <Circle size={20} fill={isRecording ? 'currentColor' : 'none'} />
              </button>
            )}
          </div>

          {/* Loop Control */}
          {onLoopToggle && (
            <button
              onClick={onLoopToggle}
              className={`flex items-center gap-2 px-4 py-3 rounded text-[13px] font-bold uppercase transition-all border ${isLooping ? "bg-blue-600/20 text-blue-400 border-blue-500/50" : "bg-neutral-800 text-neutral-500 border-neutral-700"}`}
              title="Loop"
            >
              <Repeat size={16} /> Loop
            </button>
          )}

          {/* Tap Tempo */}
          <button
            onClick={handleTapTempo}
            className="flex items-center gap-2 px-4 py-3 rounded text-[13px] font-bold uppercase transition-all border bg-neutral-800 text-neutral-500 border-neutral-700 hover:text-white"
            title="Tap Tempo"
          >
            <Clock size={16} /> Tap
          </button>
        </div>

        {/* Step Progress */}
        <div className="flex items-center gap-2">
          <div className="w-48 h-2 bg-neutral-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-red-500 transition-all duration-100"
              style={{ width: `${(currentStep / totalSteps) * 100}%` }}
            />
          </div>
          <span className="text-xs font-mono text-neutral-500">
            {currentStep + 1}/{totalSteps}
          </span>
        </div>
      </div>
    </div>
  );
};