"use client";

import { useState } from "react";
import { GalleryItem } from "@/lib/api";

interface MediaCardProps {
  item: GalleryItem & {
    mediaUrls?: string[];
    loading?: boolean;
    mediaError?: string;
  };
  onSelect?: () => void;
  onDownload?: () => void;
  onDelete?: () => void;
  canDelete?: boolean;
  isDeleting?: boolean;
}

export function MediaCard({
  item,
  onSelect,
  onDownload,
  onDelete,
  canDelete = false,
  isDeleting = false,
}: MediaCardProps) {
  const [imageError, setImageError] = useState(false);
  const [showControls, setShowControls] = useState(false);

  const mediaSrc = item.mediaUrls?.[0];
  const isVideo = item.type === "video";
  const hasMedia = !!mediaSrc && !item.mediaError;

  return (
    <div
      className="group relative cursor-pointer break-inside-avoid mb-0 rounded-none overflow-hidden bg-black/20 hover:bg-black/30 transition-all"
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
      onClick={hasMedia ? onSelect : undefined}
    >
      <div className="relative w-full overflow-hidden bg-black/40">
        {item.loading ? (
          <div className="w-full min-h-[200px] flex items-center justify-center">
            <div className="animate-spin w-6 h-6 border-2 border-white/30 border-t-white rounded-full" />
          </div>
        ) : !hasMedia ? (
          <div className="w-full min-h-[200px] flex flex-col items-center justify-center text-white/30 p-4">
            <span className="text-3xl mb-2">{isVideo ? "🎬" : "🖼️"}</span>
            <span className="text-xs text-center">
              {item.mediaError || "Media unavailable"}
            </span>
          </div>
        ) : isVideo ? (
          <video
            src={mediaSrc}
            className="w-full h-auto object-contain"
            muted
            loop
            playsInline
            onMouseEnter={(e) => e.currentTarget.play()}
            onMouseLeave={(e) => e.currentTarget.pause()}
            onError={() => setImageError(true)}
          />
        ) : imageError ? (
          <div className="w-full min-h-[200px] flex flex-col items-center justify-center text-white/50 p-4">
            <span className="text-2xl mb-2">🖼️</span>
            <span className="text-xs">Image unavailable</span>
          </div>
        ) : (
          <img
            src={mediaSrc}
            alt={item.prompt}
            className="w-full h-auto object-contain"
            loading="lazy"
            onError={() => setImageError(true)}
          />
        )}

        {showControls && hasMedia && (
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 z-10">
            {onDownload && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDownload();
                }}
                className="p-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white rounded-full transition-all"
                title="Download"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
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
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
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
        )}

        {item.isNsfw && (
          <div className="absolute top-2 right-2 px-2 py-1 bg-red-500/90 text-white text-xs rounded backdrop-blur-sm">
            NSFW
          </div>
        )}
      </div>
    </div>
  );
}
