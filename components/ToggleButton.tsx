
import React, { FC } from 'react';

interface ToggleButtonProps {
  label: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export const ToggleButton: FC<ToggleButtonProps> = ({ label, enabled, onChange }) => {
  return (
    <div className="flex items-center justify-between w-full">
      <span className="text-sm font-medium text-gray-300 mr-4">{label}</span>
      <button
        onClick={() => onChange(!enabled)}
        className={`${
          enabled ? 'bg-cyan-600' : 'bg-gray-600'
        } relative inline-flex items-center h-6 rounded-full w-11 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-cyan-500`}
      >
        <span
          className={`${
            enabled ? 'translate-x-6' : 'translate-x-1'
          } inline-block w-4 h-4 transform bg-white rounded-full transition-transform`}
        />
      </button>
    </div>
  );
};
