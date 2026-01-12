"use client";

import { useState } from "react";
import { GalleryItem } from "@/lib/api";

interface MediaCardProps {
  item: GalleryItem;
  thumbnailUrl?: string; // Optimized thumbnail URL for grid view
  onSelect?: () => void;
  onDownload?: () => void;
  onDelete?: () => void;
  canDelete?: boolean;
  isDeleting?: boolean;
}

export function MediaCard({
  item,
  thumbnailUrl,
  onSelect,
  onDownload,
  onDelete,
  canDelete = false,
  isDeleting = false,
}: MediaCardProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [showControls, setShowControls] = useState(false);

  // Use thumbnail URL if provided, otherwise fall back to full URL
  const mediaSrc = thumbnailUrl || item.mediaUrls?.[0];
  const isVideo = item.type === "video";
  const hasMedia = !!mediaSrc;

  // Hide completely if no media or failed to load
  if (!hasMedia || imageError) {
    return null;
  }

  return (
    <div
      className="group relative cursor-pointer break-inside-avoid mb-0 overflow-hidden bg-neutral-900"
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
      onClick={hasMedia && !imageError ? onSelect : undefined}
    >
      <div className="relative w-full overflow-hidden">
        {isVideo ? (
          <video
            src={item.mediaUrls?.[0]} // Use full URL for video
            className="w-full h-auto object-contain"
            muted
            loop
            playsInline
            onMouseEnter={(e) => e.currentTarget.play()}
            onMouseLeave={(e) => e.currentTarget.pause()}
            onError={() => setImageError(true)}
          />
        ) : (
          <>
            {/* Placeholder while loading */}
            {!imageLoaded && (
              <div className="absolute inset-0 bg-neutral-800 animate-pulse" />
            )}
          <img
            src={mediaSrc}
            alt={item.prompt}
              className={`w-full h-auto object-contain transition-opacity duration-300 ${
                imageLoaded ? "opacity-100" : "opacity-0"
              }`}
            loading="lazy"
              onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
          />
          </>
        )}

        {/* Hover overlay with controls */}
        {showControls && hasMedia && !imageError && (
          <>
            {/* Gradient overlay for text readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
            
            {/* Top right action buttons */}
            <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-20">
            {onDownload && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDownload();
                }}
                  className="p-2 bg-black/50 hover:bg-black/70 backdrop-blur-sm text-white rounded-full transition-all"
                title="Download"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
              </button>
            )}
            {canDelete && onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                disabled={isDeleting}
                className="p-2 bg-red-500/80 hover:bg-red-600 backdrop-blur-sm text-white rounded-full transition-all disabled:opacity-50"
                title="Delete from gallery"
              >
                {isDeleting ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                )}
              </button>
            )}
          </div>

            {/* Bottom prompt overlay */}
            <div className="absolute bottom-0 left-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
              <p className="text-white text-sm line-clamp-2 leading-snug">
                {item.prompt}
              </p>
            </div>
          </>
        )}

        {/* NSFW badge - always visible */}
        {item.isNsfw && (
          <div className="absolute top-2 left-2 px-2 py-1 bg-red-500/90 text-white text-xs rounded backdrop-blur-sm z-20">
            NSFW
          </div>
        )}
      </div>
    </div>
  );
}
