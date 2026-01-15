
import React, { FC } from 'react';
import { ExclamationTriangleIcon } from './icons';

interface ErrorPanelProps {
  message: string;
  onClose: () => void;
}

export const ErrorPanel: FC<ErrorPanelProps> = ({ message, onClose }) => {
  return (
    <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg relative flex items-start space-x-3" role="alert">
      <div className="py-1">
        <ExclamationTriangleIcon className="h-6 w-6 text-red-400" />
      </div>
      <div>
        <strong className="font-bold">Server Error:</strong>
        <p className="block sm:inline text-sm ml-2">{message}</p>
      </div>
      <button 
        onClick={onClose} 
        className="absolute top-0 bottom-0 right-0 px-4 py-3"
        aria-label="Close"
      >
        <svg className="fill-current h-6 w-6 text-red-300 hover:text-red-500" role="button" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><title>Close</title><path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z"/></svg>
      </button>
    </div>
  );
};
