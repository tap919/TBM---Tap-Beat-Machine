import React from 'react';

interface ToggleSwitchProps {
  value: boolean;
  onChange: (v: boolean) => void;
}

export const ToggleSwitch = ({ value, onChange }: ToggleSwitchProps) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onChange(!value);
    }
  };

  return (
    <button
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      className={`w-10 h-5 rounded-full relative transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 ${
        value ? 'bg-brand' : 'bg-neutral-700'
      }`}
      aria-label={value ? 'Enabled' : 'Disabled'}
    >
      <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${value ? 'right-0.5' : 'left-0.5'} shadow-sm`}></div>
    </button>
  );
};
