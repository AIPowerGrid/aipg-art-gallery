"use client";

import Masonry from 'react-masonry-css';
import { CreationCard } from '@/components/creation-card';
import { DisplayCreation } from '@/lib/storage';

const MASONRY_BREAKPOINTS = {
  default: 5,
  1400: 4,
  1100: 3,
  768: 2,
};

interface CreationsGridProps {
  creations: DisplayCreation[];
  onDelete: (jobId: string) => void;
  onEditInStudio: (creation: DisplayCreation) => void;
  onRefresh?: () => void;
  isGenerating: boolean;
}

export function CreationsGrid({
  creations,
  onDelete,
  onEditInStudio,
  onRefresh,
  isGenerating,
}: CreationsGridProps) {
  if (creations.length === 0 && !isGenerating) {
    return (
      <div className="text-center py-20 text-zinc-500">
        <p className="text-lg mb-2">No creations yet</p>
        <p className="text-sm">Describe something and click Generate to start creating</p>
      </div>
    );
  }

  if (creations.length === 0) {
    return null;
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-4">Your Creations</h2>
      <Masonry
        breakpointCols={MASONRY_BREAKPOINTS}
        className="masonry-grid flex w-auto -ml-0.5"
        columnClassName="pl-0.5 bg-clip-padding"
      >
        {creations.map((creation) => (
          <CreationCard
            key={creation.jobId}
            creation={creation}
            onDelete={onDelete}
            onRegenerate={() => onEditInStudio(creation)}
            onExtractComplete={onRefresh}
          />
        ))}
      </Masonry>
    </div>
  );
}
