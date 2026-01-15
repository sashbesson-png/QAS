
import React, { FC } from 'react';

interface NumericInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

export const NumericInput: FC<NumericInputProps> = ({ label, value, onChange, min, max, step = 1 }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const numValue = e.target.type === 'number' ? parseFloat(e.target.value) : parseInt(e.target.value, 10);
    if (!isNaN(numValue)) {
      onChange(numValue);
    }
  };

  return (
    <div className="flex-1">
      <label htmlFor={label} className="block text-sm font-medium text-gray-400">{label}</label>
      <input
        type="number"
        id={label}
        value={value}
        onChange={handleChange}
        min={min}
        max={max}
        step={step}
        className="mt-1 block w-full text-sm bg-gray-700 border-gray-600 rounded-md p-2 focus:ring-cyan-500 focus:border-cyan-500 text-white"
      />
    </div>
  );
};
