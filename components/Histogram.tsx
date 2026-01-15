
import React, { FC, useMemo } from 'react';
import type { ImageSourceType } from '../types';

interface HistogramProps {
  data: number[];
  height?: number;
  sourceType: ImageSourceType;
}

export const Histogram: FC<HistogramProps> = ({ data, height = 120, sourceType }) => {
  const maxValue = useMemo(() => Math.max(...data, 1), [data]);
  
  if (!data || data.length === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center w-full bg-gray-900/50 text-gray-500 text-sm rounded-md">
        No histogram data
      </div>
    );
  }
  
  const barColorClass = sourceType === 'live' ? 'text-cyan-400' : 'text-yellow-500';

  return (
    <svg width="100%" height={height} className="bg-black/20 rounded-md" preserveAspectRatio="none">
      <g>
        {data.map((value, index) => {
          const barHeight = (value / maxValue) * height;
          const x = `${(index / data.length) * 100}%`;
          const barWidth = `${100 / data.length}%`;
          return (
            <rect
              key={index}
              x={x}
              y={height - barHeight}
              width={barWidth}
              height={barHeight}
              fill="currentColor"
              className={barColorClass}
            />
          );
        })}
      </g>
      {/* X and Y Axis lines for context */}
      <line x1="0" y1={height} x2="100%" y2={height} stroke="rgba(156, 163, 175, 0.5)" strokeWidth="1" />
      <line x1="0" y1="0" x2="0" y2={height} stroke="rgba(156, 163, 175, 0.5)" strokeWidth="1" />
      {/* Labels */}
      <text x="5" y="15" fontSize="10" fill="rgba(209, 213, 219, 0.7)" className="select-none">Counts</text>
      <text x="98%" y={height - 5} textAnchor="end" fontSize="10" fill="rgba(209, 213, 219, 0.7)" className="select-none">Pixel Value</text>
    </svg>
  );
};
