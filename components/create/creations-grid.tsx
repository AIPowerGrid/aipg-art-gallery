"use client";

import Masonry from 'react-masonry-css';
import Link from 'next/link';
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
  heading?: string;
  viewAllHref?: string;
  hideEmptyState?: boolean;
}

export function CreationsGrid({
  creations,
  onDelete,
  onEditInStudio,
  onRefresh,
  isGenerating,
  heading = "Your Creations",
  viewAllHref,
  hideEmptyState = false,
}: CreationsGridProps) {
  if (creations.length === 0 && hideEmptyState) return null;
  if (creations.length === 0 && !isGenerating) {
    return (
      <div className="text-center py-20 text-tertiary">
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
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-white">{heading}</h2>
        {viewAllHref && (
          <Link href={viewAllHref} className="text-sm text-primary hover:text-primary/80">
            View all
          </Link>
        )}
      </div>
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
