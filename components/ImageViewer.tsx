
import React, { FC, useState } from 'react';
import { Section } from './Section';
import { ViewfinderCircleIcon } from './icons';
import type { ImageSourceType } from '../types';

interface ImageViewerProps {
  imageSrc: string | null;
  sourceType: ImageSourceType;
}

export const ImageViewer: FC<ImageViewerProps> = ({ imageSrc, sourceType }) => {
  const [hoveredPixel, setHoveredPixel] = useState<{ x: number, y: number } | null>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
        setHoveredPixel(null);
        return;
    }

    // Scale coordinates to VGA resolution (640x480)
    const vgaX = Math.floor((x / rect.width) * 640);
    const vgaY = Math.floor((y / rect.height) * 480);

    setHoveredPixel({ x: vgaX, y: vgaY });
  };

  const handleMouseLeave = () => {
    setHoveredPixel(null);
  };

  return (
    <Section title="Image View" icon={<ViewfinderCircleIcon className="w-6 h-6" />}>
      <div
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="w-full aspect-[4/3] bg-gray-900/50 border-2 border-dashed border-gray-600 rounded-lg cursor-crosshair relative overflow-hidden"
      >
         {imageSrc ? (
            <img src={imageSrc} alt="Live feed" className="w-full h-full object-cover" />
         ) : (
            <div className="flex items-center justify-center h-full text-gray-500 select-none">
                (VGA 4:3 Image Display)
            </div>
         )}
         {sourceType !== 'none' && (
            <div className={`absolute top-2 left-2 px-2 py-0.5 text-xs font-bold text-white rounded-full shadow-lg ${sourceType === 'live' ? 'bg-green-600/80' : 'bg-yellow-600/80'}`}>
                {sourceType.toUpperCase()}
            </div>
        )}
      </div>
      <div className="mt-2 text-sm font-mono text-gray-400 h-5 text-center">
        {hoveredPixel ?
          <span>(X: {hoveredPixel.x}, Y: {hoveredPixel.y})</span> :
          <span>Hover over image for coordinates</span>
        }
      </div>
    </Section>
  );
};
