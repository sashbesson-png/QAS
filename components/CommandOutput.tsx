
import React, { FC, useState } from 'react';
import { CodeBracketIcon, ClipboardDocumentIcon, CheckIcon } from './icons';

interface CommandOutputProps {
  command: string;
}

export const CommandOutput: FC<CommandOutputProps> = ({ command }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="bg-gray-800 rounded-lg shadow-lg flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center space-x-3">
            <CodeBracketIcon className="w-6 h-6 text-cyan-400" />
            <h2 className="text-lg font-semibold text-gray-200">Last Server Action</h2>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center space-x-2 bg-gray-700 hover:bg-gray-600 text-gray-300 font-semibold py-1 px-3 rounded-md text-sm transition-colors"
        >
          {copied ? <CheckIcon className="w-4 h-4 text-green-400" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
          <span>{copied ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>
      <div className="p-4 font-mono text-cyan-300 bg-black/20 text-sm whitespace-pre-wrap break-words flex-grow flex items-center">
        <span>{command}</span>
      </div>
    </div>
  );
};
