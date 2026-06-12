import React from 'react';
import { Play, Square, Circle } from 'lucide-react';

interface TransportControlsProps {
  isPlaying: boolean;
  isRecording?: boolean;
  onPlay: () => void;
  onStop: () => void;
  onRecord?: () => void;
  /** Icon size in px. Defaults to 16. */
  size?: number;
}

export const TransportControls = ({
  isPlaying,
  isRecording = false,
  onPlay,
  onStop,
  onRecord,
  size = 16,
}: TransportControlsProps) => {
  const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      action();
    }
  };

  return (
    <div className="flex gap-1" role="group" aria-label="Transport controls">
      <button
        onClick={() => (isPlaying ? onStop() : onPlay())}
        onKeyDown={(e) => handleKeyDown(e, () => (isPlaying ? onStop() : onPlay()))}
        tabIndex={0}
        className={`p-2 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 ${
          isPlaying ? 'bg-emerald-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-white'
        }`}
        aria-label={isPlaying ? 'Stop playback' : 'Start playback'}
        aria-pressed={isPlaying}
      >
        <Play size={size} fill={isPlaying ? 'currentColor' : 'none'} />
      </button>
      <button
        onClick={onStop}
        onKeyDown={(e) => handleKeyDown(e, onStop)}
        tabIndex={0}
        className="p-2 rounded bg-neutral-800 text-neutral-400 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
        aria-label="Stop"
      >
        <Square size={size} fill="currentColor" />
      </button>
      {onRecord !== undefined && (
        <button
          onClick={onRecord}
          onKeyDown={(e) => onRecord && handleKeyDown(e, onRecord)}
          tabIndex={0}
          className={`p-2 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 ${
            isRecording ? 'bg-red-600 text-white animate-pulse' : 'bg-neutral-800 text-neutral-400 hover:text-red-500'
          }`}
          aria-label={isRecording ? 'Stop recording' : 'Start recording'}
          aria-pressed={isRecording}
        >
          <Circle size={size} fill={isRecording ? 'currentColor' : 'none'} />
        </button>
      )}
    </div>
  );
};
