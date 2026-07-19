"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { GalleryItem } from "@/lib/api";
import { downloadMedia, getMediaFilename } from "@/lib/utils/download";
import { extractFrame } from "@/lib/utils/video-frames";
import { useDirectorStore } from "@/lib/stores/director-store";
import { ChainIcon } from "@/components/create/director/chain-icon";

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
  onExtract?: (index: number) => void; // Save single image from batch
  isDeleting?: boolean;
  isPublishing?: boolean;
  isRegenerating?: boolean;
  isExtracting?: boolean;
}

function formatParamValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    // Format floats to 2 decimal places if needed
    if (key === "cfgscale" || key === "denoise") {
      return value.toFixed(2);
    }
    return String(value);
  }
  return String(value);
}

/** Small uppercase section label — matches the Director console's chips. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#8f8f99]">
      {children}
    </h2>
  );
}

const spinner = (
  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
);

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
  onExtract,
  isDeleting = false,
  isPublishing = false,
  isRegenerating = false,
  isExtracting = false,
}: ImageModalProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const mediaUrls = item.mediaUrls || [];
  const hasMultiple = mediaUrls.length > 1;
  const mediaSrc = mediaUrls[selectedIndex];
  const isVideo = item.type === "video";
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isExtending, setIsExtending] = useState(false);
  const router = useRouter();

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

  // Same action as the card's hover chain icon: seed a fresh Director project
  // with this clip's last frame and jump into the console.
  const handleExtendInDirector = async () => {
    if (!mediaSrc || isExtending) return;
    setIsExtending(true);
    try {
      const frame = await extractFrame(mediaSrc, 'last');
      useDirectorStore.getState().startProjectFromClip({
        image: frame,
        name: (item.prompt || 'Extended clip').slice(0, 40),
      });
      onClose();
      router.push('/create/director');
    } catch (err) {
      console.error('Extend in Director failed:', err);
      toast.error('Could not read the clip’s last frame.');
      setIsExtending(false);
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
  // Get the seed for the currently selected image (batch mode has per-image seeds)
  const currentSeed = item.seeds?.[selectedIndex] ?? params.seed;

  const paramEntries: [string, any][] = [
    ["Width", params.width],
    ["Height", params.height],
    ["Steps", params.steps],
    ["CFG Scale", params.cfgScale],
    ["Sampler", params.sampler],
    ["Scheduler", params.scheduler],
    ["Seed", currentSeed],
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
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 backdrop-blur-xl"
      onClick={onClose}
    >
      <div
        className="relative my-8 flex w-full max-w-[95vw] flex-col gap-6 rounded-2xl border border-[#2a2a31] bg-[#101014]/95 p-6 shadow-2xl backdrop-blur-sm lg:flex-row xl:max-w-7xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-transparent text-[#8f8f99] transition hover:border-[#313138] hover:bg-white/5 hover:text-white"
          aria-label="Close"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        {/* Media container */}
        <div className="group/media relative flex min-h-[400px] flex-1 items-center justify-center overflow-hidden rounded-xl border border-[#1d1d22] bg-black/60">
          {isVideo ? (
            <video
              id={`modal-media-${item.jobId}`}
              src={mediaSrc}
              controls
              autoPlay
              loop
              muted
              className="max-h-[80vh] max-w-full object-contain"
            />
          ) : (
            <img
              id={`modal-media-${item.jobId}`}
              src={mediaSrc}
              alt={item.prompt}
              className="max-h-[80vh] max-w-full object-contain"
            />
          )}

          {/* Fullscreen button - top right of media */}
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
            className="absolute right-4 top-4 rounded-lg border border-[#313138] bg-black/70 p-2.5 opacity-0 transition-all hover:bg-black/90 group-hover/media:opacity-100"
            title="View fullscreen"
          >
            <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-[#313138] bg-black/70 p-2 transition-colors hover:bg-black/90"
              >
                <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedIndex((prev) => (prev + 1) % mediaUrls.length);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-[#313138] bg-black/70 p-2 transition-colors hover:bg-black/90"
              >
                <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-[#313138] bg-black/70 px-3 py-1 text-[12px] font-medium tabular-nums text-white">
                {selectedIndex + 1} / {mediaUrls.length}
              </div>
            </>
          )}
        </div>

        {/* Info panel */}
        <div className="flex flex-col gap-5 lg:w-96">
          {/* Prompt */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <SectionLabel>Prompt</SectionLabel>
              <button
                onClick={handleCopyPrompt}
                className="flex items-center gap-1 rounded-md border border-[#2a2a31] bg-[#17171b] px-2 py-1 text-[11px] font-medium text-[#8f8f99] transition hover:border-[#4a4a53] hover:text-white"
              >
                {copied ? (
                  <>
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Copied
                  </>
                ) : (
                  <>
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy
                  </>
                )}
              </button>
            </div>
            <p className="text-sm leading-relaxed text-[#e9e9ec]">
              {item.prompt.length > 300
                ? item.prompt.slice(0, 300) + '...'
                : item.prompt}
            </p>
            {item.negativePrompt && (
              <>
                <h3 className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wider text-[#5a5a64]">
                  Negative prompt
                </h3>
                <p className="text-[13px] leading-relaxed text-[#8f8f99]">
                  {item.negativePrompt.length > 200
                    ? item.negativePrompt.slice(0, 200) + '...'
                    : item.negativePrompt}
                </p>
              </>
            )}
          </div>

          {/* Model */}
          <div>
            <SectionLabel>Model</SectionLabel>
            <p className="mt-1.5 text-sm text-[#e9e9ec]">{item.modelName}</p>
          </div>

          {/* Creator Wallet - only show for non-owners */}
          {item.walletAddress && !isOwner && (
            <div>
              <SectionLabel>Creator wallet</SectionLabel>
              <p className="mt-1.5 break-all font-mono text-[12px] text-[#8f8f99]">{item.walletAddress}</p>
            </div>
          )}

          {/* Parameters as chips */}
          {paramEntries.length > 0 && (
            <div>
              <SectionLabel>Parameters</SectionLabel>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {paramEntries.map(([key, value]) => (
                  <span
                    key={key}
                    className="rounded-md border border-[#2a2a31] bg-[#17171b] px-2 py-1 text-[11.5px]"
                  >
                    <span className="text-[#5a5a64]">{key}</span>{' '}
                    <span className="tabular-nums text-[#cfcfd7]">
                      {formatParamValue(key.toLowerCase().replace(/\s/g, ''), value)}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="mt-auto flex flex-col gap-2 border-t border-[#1d1d22] pt-4">
            {/* Extend in Director — same action as the card's hover chain icon */}
            {isVideo && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleExtendInDirector();
                }}
                disabled={isExtending}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#f5b544]/45 bg-[#f5b544]/10 px-4 py-2.5 text-[13px] font-semibold text-[#f5b544] transition hover:bg-[#f5b544]/20 disabled:opacity-50"
              >
                {isExtending ? spinner : <ChainIcon className="h-4 w-4" />}
                Extend in Director
              </button>
            )}

            {/* Edit in Studio button - only for owners with seed */}
            {isOwner && onRegenerate && currentSeed && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRegenerate();
                  onClose();
                }}
                disabled={isRegenerating}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-indigo-400/40 bg-indigo-500/10 px-4 py-2.5 text-[13px] font-semibold text-indigo-300 transition hover:bg-indigo-500/20 disabled:opacity-50"
              >
                {isRegenerating ? spinner : (
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                )}
                Edit in Studio
              </button>
            )}

            {/* Save as Single button - only for batches */}
            {isOwner && hasMultiple && onExtract && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onExtract(selectedIndex);
                }}
                disabled={isExtracting}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-purple-400/40 bg-purple-500/10 px-4 py-2.5 text-[13px] font-semibold text-purple-300 transition hover:bg-purple-500/20 disabled:opacity-50"
              >
                {isExtracting ? spinner : (
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                  </svg>
                )}
                Save as Single
              </button>
            )}

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
                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-[13px] font-semibold transition disabled:opacity-50 ${
                      isPublic
                        ? 'border-amber-400/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                        : 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                    }`}
                  >
                    {isPublishing ? spinner : isPublic ? (
                      <>
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                        Unpublish
                      </>
                    ) : (
                      <>
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-2.5 text-[13px] font-semibold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                  >
                    {isDeleting ? spinner : (
                      <>
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#f5b544] px-4 py-2.5 text-[13px] font-semibold text-[#141414] transition hover:bg-[#f7c166]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download
            </button>
            <a
              href={mediaSrc}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full rounded-lg border border-[#2a2a31] px-4 py-2 text-center text-[12.5px] text-[#8f8f99] transition hover:border-[#4a4a53] hover:text-white"
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
