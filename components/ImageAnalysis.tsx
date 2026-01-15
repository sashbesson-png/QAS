
import React, { FC } from 'react';
import { Section } from './Section';
import { Histogram } from './Histogram';
import { ChartBarIcon } from './icons';
import type { ImageSourceType } from '../types';

interface ImageAnalysisProps {
  histogramData: number[];
  sourceType: ImageSourceType;
  serverStats: { min: number; max: number; mean: number } | null;
}

export const ImageAnalysis: FC<ImageAnalysisProps> = ({ histogramData, sourceType, serverStats }) => {
  const stats = serverStats || { mean: 0, min: 0, max: 0 };


  return (
    <Section title="Histogram Analysis" icon={<ChartBarIcon className="w-6 h-6" />}>
      <div className="w-full">
        <Histogram data={histogramData} height={120} sourceType={sourceType} />
      </div>
      <div className="mt-4 flex justify-around text-center border-t border-gray-700 pt-3">
        <div className="font-mono">
          <div className="text-xs text-gray-400">Mean</div>
          <div className="text-lg font-semibold text-cyan-300">{stats.mean.toFixed(1)}</div>
        </div>
        <div className="font-mono">
          <div className="text-xs text-gray-400">Min</div>
          <div className="text-lg font-semibold text-cyan-300">{stats.min}</div>
        </div>
        <div className="font-mono">
          <div className="text-xs text-gray-400">Max</div>
          <div className="text-lg font-semibold text-cyan-300">{stats.max}</div>
        </div>
      </div>
    </Section>
  );
};
