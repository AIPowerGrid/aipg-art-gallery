"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { GalleryItem, JobParams } from "@/lib/api";
import { downloadMedia, getMediaFilename } from "@/lib/utils/download";

interface ImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: GalleryItem;
  onDownload?: (index: number) => void; // Optional - will use built-in download if not provided
  // Optional owner actions
  isOwner?: boolean;
  isPublic?: boolean;
  onPublish?: () => void;
  onDelete?: () => void;
  onRegenerate?: () => void; // Regenerate with same seed
  isDeleting?: boolean;
  isPublishing?: boolean;
  isRegenerating?: boolean;
}

function formatParamValue(key: string, value: any): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    // Format floats to 2 decimal places if needed
    if (key === "cfgScale" || key === "denoise") {
      return value.toFixed(2);
    }
    return String(value);
  }
  return String(value);
}

export function ImageModal({ 
  isOpen, 
  onClose, 
  item, 
  onDownload,
  isOwner = false,
  isPublic = false,
  onPublish,
  onDelete,
  onRegenerate,
  isDeleting = false,
  isPublishing = false,
  isRegenerating = false,
}: ImageModalProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const mediaUrls = item.mediaUrls || [];
  const hasMultiple = mediaUrls.length > 1;
  const mediaSrc = mediaUrls[selectedIndex];
  const isVideo = item.type === "video";
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Reset selected index when item changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [item.jobId]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(item.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleEscape);
    }
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !mediaSrc || !mounted) return null;

  const params = item.params || {};
  const paramEntries: [string, any][] = [
    ["Width", params.width],
    ["Height", params.height],
    ["Steps", params.steps],
    ["CFG Scale", params.cfgScale],
    ["Sampler", params.sampler],
    ["Scheduler", params.scheduler],
    ["Seed", params.seed],
    ["Denoise", params.denoise],
    ...(isVideo ? [
      ["Length", params.length] as [string, any],
      ["FPS", params.fps] as [string, any],
    ] : []),
    ["Tiling", params.tiling],
    ["Hires Fix", params.hiresFix],
  ].filter((entry): entry is [string, any] => {
    const [_, value] = entry;
    return value !== null && value !== undefined;
  });

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl overflow-y-auto"
      onClick={onClose}
    >
      <div 
        className="relative max-w-[95vw] max-w-7xl w-full my-8 flex flex-col lg:flex-row gap-6 p-6 bg-zinc-900/95 backdrop-blur-sm rounded-2xl border border-white/10 shadow-2xl" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/80 hover:text-white text-4xl font-light leading-none z-10 w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition"
          aria-label="Close"
        >
          ×
        </button>

        {/* Media container */}
        <div className="flex-1 flex items-center justify-center min-h-[400px] bg-black/40 rounded-xl overflow-hidden relative group/media">
          {isVideo ? (
            <video
              id={`modal-media-${item.jobId}`}
              src={mediaSrc}
              controls
              autoPlay
              loop
              muted
              className="max-w-full max-h-[80vh] object-contain"
            />
          ) : (
            <img
              id={`modal-media-${item.jobId}`}
              src={mediaSrc}
              alt={item.prompt}
              className="max-w-full max-h-[80vh] object-contain"
            />
          )}
          
          {/* Fullscreen button - bottom left of media */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              const el = document.getElementById(`modal-media-${item.jobId}`);
              if (el) {
                if (el.requestFullscreen) {
                  el.requestFullscreen();
                } else if ((el as any).webkitRequestFullscreen) {
                  (el as any).webkitRequestFullscreen();
                }
              }
            }}
            className="absolute bottom-3 left-3 p-2 bg-black/60 hover:bg-black/80 rounded-lg transition-all opacity-0 group-hover/media:opacity-100"
            title="View fullscreen"
          >
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
          
          {/* Navigation for multiple images */}
          {hasMultiple && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedIndex((prev) => (prev - 1 + mediaUrls.length) % mediaUrls.length);
                }}
                className="absolute left-3 top-1/2 -translate-y-1/2 p-2 bg-black/60 hover:bg-black/80 rounded-full transition-colors"
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedIndex((prev) => (prev + 1) % mediaUrls.length);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-black/60 hover:bg-black/80 rounded-full transition-colors"
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-black/60 rounded-full text-white text-sm font-medium">
                {selectedIndex + 1} / {mediaUrls.length}
              </div>
            </>
          )}
        </div>

        {/* Info panel */}
        <div className="lg:w-96 flex flex-col gap-6">
          {/* Prompt */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-white font-semibold text-lg">Prompt</h2>
              <button
                onClick={handleCopyPrompt}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition"
              >
                {copied ? (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy
                  </>
                )}
              </button>
            </div>
            <p className="text-white/90 text-sm leading-relaxed">
              {item.prompt.length > 300 
                ? item.prompt.slice(0, 300) + '...' 
                : item.prompt}
            </p>
            {item.negativePrompt && (
              <>
                <h3 className="text-white/70 font-medium text-sm mt-3 mb-1">Negative Prompt</h3>
                <p className="text-white/70 text-sm leading-relaxed">
                  {item.negativePrompt.length > 200 
                    ? item.negativePrompt.slice(0, 200) + '...' 
                    : item.negativePrompt}
                </p>
              </>
            )}
          </div>

          {/* Model */}
          <div>
            <h2 className="text-white font-semibold text-lg mb-2">Model</h2>
            <p className="text-white/90 text-sm">{item.modelName}</p>
          </div>

          {/* Creator Wallet - only show for non-owners */}
          {item.walletAddress && !isOwner && (
            <div>
              <h2 className="text-white font-semibold text-lg mb-2">Creator Wallet</h2>
              <p className="text-white/90 text-sm font-mono break-all">{item.walletAddress}</p>
            </div>
          )}

          {/* Parameters - compact inline display */}
          {paramEntries.length > 0 && (
            <div>
              <h2 className="text-white font-semibold text-lg mb-2">Parameters</h2>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {paramEntries.map(([key, value]) => (
                  <span key={key} className="text-white/70">
                    <span className="text-white/50">{key}:</span>{' '}
                    <span className="text-white/90">{formatParamValue(key.toLowerCase(), value)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Regenerate button - only for owners with seed */}
          {isOwner && onRegenerate && params.seed && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRegenerate();
              }}
              disabled={isRegenerating}
              className="w-full px-4 py-3 bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 font-semibold rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isRegenerating ? (
                <>
                  <span className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
                  Regenerating...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Regenerate with Same Seed
                </>
              )}
            </button>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-3 pt-4 border-t border-white/10">
            {/* Owner actions: Publish/Unpublish and Delete */}
            {isOwner && (
              <div className="flex gap-2">
                {onPublish && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onPublish();
                    }}
                    disabled={isPublishing}
                    className={`flex-1 px-4 py-3 font-semibold rounded-xl transition flex items-center justify-center gap-2 ${
                      isPublic 
                        ? 'bg-amber-600/20 text-amber-400 hover:bg-amber-600/30' 
                        : 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
                    } disabled:opacity-50`}
                  >
                    {isPublishing ? (
                      <span className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
                    ) : isPublic ? (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                        Unpublish
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        Publish
                      </>
                    )}
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete();
                    }}
                    disabled={isDeleting}
                    className="flex-1 px-4 py-3 bg-red-600/20 text-red-400 hover:bg-red-600/30 font-semibold rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isDeleting ? (
                      <span className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Delete
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onDownload) {
                  onDownload(selectedIndex);
                } else if (mediaSrc) {
                  // Built-in download
                  const filename = getMediaFilename(item.jobId, undefined, isVideo);
                  downloadMedia(mediaSrc, filename);
                }
              }}
              className="w-full px-4 py-3 bg-gradient-to-r from-zinc-600 to-zinc-500 text-white font-semibold rounded-xl hover:opacity-90 transition flex items-center justify-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download
            </button>
            <a
              href={mediaSrc}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full px-4 py-2 bg-white/5 hover:bg-white/10 text-white text-sm rounded-xl transition text-center"
              onClick={(e) => e.stopPropagation()}
            >
              Open in new tab
            </a>
          </div>
        </div>
      </div>
    </div>
  );

  // Use portal to render at document body level to avoid stacking context issues
  return createPortal(modalContent, document.body);
}
