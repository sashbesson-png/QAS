
import React, { FC } from 'react';

interface TextInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  monospace?: boolean;
}

export const TextInput: FC<TextInputProps> = ({ label, value, onChange, placeholder, monospace = false }) => {
  return (
    <div className="flex-1">
      <label htmlFor={label} className="block text-sm font-medium text-gray-400">{label}</label>
      <input
        type="text"
        id={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`mt-1 block w-full text-sm bg-gray-700 border-gray-600 rounded-md p-2 focus:ring-cyan-500 focus:border-cyan-500 text-white ${monospace ? 'font-mono' : ''}`}
      />
    </div>
  );
};
