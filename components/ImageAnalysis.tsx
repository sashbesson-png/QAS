
import React, { FC, useMemo } from 'react';
import { Section } from './Section';
import { Histogram } from './Histogram';
import { ChartBarIcon } from './icons';
import type { ImageSourceType } from '../types';

interface ImageAnalysisProps {
  histogramData: number[];
  sourceType: ImageSourceType;
}

export const ImageAnalysis: FC<ImageAnalysisProps> = ({ histogramData, sourceType }) => {
  const stats = useMemo(() => {
    if (!histogramData || histogramData.length === 0) {
      return { mean: 0, min: 0, max: 0 };
    }

    let totalPixels = 0;
    let weightedSum = 0;
    let min = -1;
    let max = -1;

    for (let i = 0; i < histogramData.length; i++) {
      const count = histogramData[i];
      if (count > 0) {
        if (min === -1) {
          min = i;
        }
        max = i;
        totalPixels += count;
        weightedSum += i * count;
      }
    }

    if (totalPixels === 0) {
      return { mean: 0, min: 0, max: 0 };
    }

    return {
      mean: weightedSum / totalPixels,
      min: min,
      max: max,
    };
  }, [histogramData]);


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
