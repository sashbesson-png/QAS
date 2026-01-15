
import React, { FC } from 'react';
import type { CameraStatus, WsConnectionStatus } from '../types';

interface StatusBarProps {
  status: CameraStatus;
  wsStatus: WsConnectionStatus;
  temperature: number | null;
  frameRate: number;
  justConnected: boolean;
  integrationTime: number | null;
}

const statusConfig = {
  POWERED_OFF: { text: 'Powered Off', color: 'bg-gray-500' },
  IDLE: { text: 'Idle', color: 'bg-yellow-500' },
  STREAMING: { text: 'Streaming', color: 'bg-green-500 animate-pulse' },
};

const wsStatusConfig = {
    DISCONNECTED: { text: 'Disconnected', color: 'bg-red-500' },
    CONNECTING: { text: 'Connecting...', color: 'bg-yellow-500' },
    CONNECTED: { text: 'Connected', color: 'bg-green-500' },
}

export const StatusBar: FC<StatusBarProps> = ({ status, wsStatus, temperature, frameRate, justConnected, integrationTime }) => {
  const { text, color } = statusConfig[status];
  const { text: wsText, color: wsColor } = wsStatusConfig[wsStatus];
  const animationClass = justConnected ? 'animate-pulse-once' : '';

  return (
    <div className="flex items-center space-x-4 bg-gray-800/50 rounded-lg px-4 py-2 text-sm">
       <div className="flex items-center space-x-2">
        <span className="font-semibold text-gray-400">Server:</span>
        <div className="flex items-center space-x-2">
            <span className={`w-3 h-3 rounded-full ${wsColor} ${animationClass}`}></span>
            <span className="font-bold text-white">{wsText}</span>
        </div>
      </div>
      <div className="w-px h-5 bg-gray-600"></div>
      <div className="flex items-center space-x-2">
        <span className="font-semibold text-gray-400">Status:</span>
        <div className="flex items-center space-x-2">
            <span className={`w-3 h-3 rounded-full ${color}`}></span>
            <span className="font-bold text-white">{text}</span>
        </div>
      </div>
      <div className="w-px h-5 bg-gray-600"></div>
      <div className="flex items-center space-x-2">
        <span className="font-semibold text-gray-400">Temp:</span>
        <span className="font-mono text-cyan-300">{temperature !== null ? `${temperature.toFixed(1)}°C` : '--'}</span>
      </div>
      <div className="w-px h-5 bg-gray-600"></div>
      <div className="flex items-center space-x-2">
        <span className="font-semibold text-gray-400">Int. Time:</span>
        <span className="font-mono text-cyan-300">{integrationTime !== null ? `${integrationTime.toFixed(2)} ms` : '--'}</span>
      </div>
      <div className="w-px h-5 bg-gray-600"></div>
       <div className="flex items-center space-x-2">
        <span className="font-semibold text-gray-400">FPS:</span>
        <span className="font-mono text-cyan-300">{frameRate.toFixed(0)} Hz</span>
      </div>
    </div>
  );
};