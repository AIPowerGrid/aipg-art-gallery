"use client";

import { useState } from "react";

export interface Dimension {
  id: number;
  width: number;
  height: number;
  label: string;
  aspectRatio?: string;
}

interface DimensionSliderProps {
  dimensions: Dimension[];
  selectedId: number;
  onChange: (id: number) => void;
}

// Dimension Slider with popup aspect ratio preview
export function DimensionSlider({ dimensions, selectedId, onChange }: DimensionSliderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const selected = dimensions.find(d => d.id === selectedId) || dimensions[3];
  
  // Calculate aspect ratio box size (max 60px, maintain ratio)
  const maxSize = 60;
  const aspectW = selected ? selected.width / Math.max(selected.width, selected.height) * maxSize : maxSize;
  const aspectH = selected ? selected.height / Math.max(selected.width, selected.height) * maxSize : maxSize;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 text-xs text-zinc-400 mb-3">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
        </svg>
        <span>Dimensions</span>
      </div>
      
      {/* Slider with popup */}
      <div className="relative">
        <input
          type="range"
          min={0}
          max={dimensions.length - 1 || 6}
          value={selectedId}
          onChange={(e) => onChange(Number(e.target.value))}
          onMouseDown={() => setIsDragging(true)}
          onMouseUp={() => setIsDragging(false)}
          onMouseLeave={() => setIsDragging(false)}
          onTouchStart={() => setIsDragging(true)}
          onTouchEnd={() => setIsDragging(false)}
          className="w-full h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-indigo-500"
        />
        
        {/* Popup tooltip with aspect ratio box - below slider */}
        {isDragging && (
          <div 
            className="absolute top-6 left-1/2 -translate-x-1/2 bg-zinc-800 border border-zinc-600 rounded-xl p-3 shadow-xl z-50"
            style={{ minWidth: '100px' }}
          >
            {/* Arrow pointing up */}
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-b-8 border-l-transparent border-r-transparent border-b-zinc-600" />
            <div className="flex flex-col items-center gap-2">
              {/* Aspect ratio box */}
              <div 
                className="border-2 border-indigo-500 rounded bg-indigo-500/20 transition-all duration-150"
                style={{ width: aspectW, height: aspectH }}
              />
              {/* Dimensions text */}
              <div className="text-xs text-white font-medium whitespace-nowrap">
                {selected ? `${selected.width} × ${selected.height}` : '1024 × 1024'}
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Static display below slider */}
      <div className="flex items-center justify-between mt-3">
        <svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="currentColor">
          <rect x="2" y="6" width="20" height="12" rx="2" />
        </svg>
        <div className="text-sm text-zinc-200 font-medium">
          {selected ? `${selected.width} × ${selected.height}` : '1024 × 1024'}
        </div>
        <svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="2" width="12" height="20" rx="2" />
        </svg>
      </div>
    </div>
  );
}
