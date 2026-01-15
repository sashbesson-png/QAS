
import React, { useState, FC, ReactNode } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from './icons';

interface SectionProps {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}

export const Section: FC<SectionProps> = ({ title, icon, children, defaultOpen = true }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-4 bg-gray-700/50 hover:bg-gray-700 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center space-x-3">
          <span className="text-cyan-400">{icon}</span>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
        </div>
        {isOpen ? <ChevronUpIcon className="w-6 h-6 text-gray-400" /> : <ChevronDownIcon className="w-6 h-6 text-gray-400" />}
      </button>
      {isOpen && (
        <div className="p-4 md:p-6">
          {children}
        </div>
      )}
    </div>
  );
};
