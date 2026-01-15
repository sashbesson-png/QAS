
import React, { FC, useRef, useEffect, memo } from 'react';
import type { ImageSourceType } from '../types';

interface HistogramProps {
  data: number[];
  height?: number;
  sourceType: ImageSourceType;
}

const HistogramComponent: FC<HistogramProps> = ({ data, height = 120, sourceType }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const h = canvas.height;
    const maxValue = Math.max(...data, 1);
    const barWidth = width / data.length;

    ctx.clearRect(0, 0, width, h);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(0, 0, width, h);

    ctx.fillStyle = sourceType === 'live' ? '#22d3ee' : '#eab308';

    for (let i = 0; i < data.length; i++) {
      const barHeight = (data[i] / maxValue) * h;
      ctx.fillRect(i * barWidth, h - barHeight, barWidth, barHeight);
    }

    ctx.strokeStyle = 'rgba(156, 163, 175, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(width, h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, h);
    ctx.stroke();

    ctx.fillStyle = 'rgba(209, 213, 219, 0.7)';
    ctx.font = '10px sans-serif';
    ctx.fillText('Counts', 5, 12);
    ctx.textAlign = 'right';
    ctx.fillText('Pixel Value', width - 5, h - 5);
  }, [data, sourceType, height]);

  if (!data || data.length === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center w-full bg-gray-900/50 text-gray-500 text-sm rounded-md">
        No histogram data
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={256}
      height={height}
      className="w-full rounded-md"
      style={{ height }}
    />
  );
};

export const Histogram = memo(HistogramComponent);
