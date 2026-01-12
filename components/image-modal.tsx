"use client";

import { useEffect } from "react";
import { GalleryItem, JobParams } from "@/lib/api";

interface ImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: GalleryItem;
  onDownload: () => void;
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

export function ImageModal({ isOpen, onClose, item, onDownload }: ImageModalProps) {
  const mediaSrc = item.mediaUrls?.[0];
  const isVideo = item.type === "video";
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

  if (!isOpen || !mediaSrc) return null;

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md overflow-y-auto"
      onClick={onClose}
    >
      <div className="relative max-w-[95vw] max-w-7xl w-full my-8 flex flex-col lg:flex-row gap-6 p-6" onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/80 hover:text-white text-4xl font-light leading-none z-10 w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition"
          aria-label="Close"
        >
          ×
        </button>

        {/* Media container */}
        <div className="flex-1 flex items-center justify-center min-h-[400px] bg-black/40 rounded-xl overflow-hidden">
          {isVideo ? (
            <video
              src={mediaSrc}
              controls
              autoPlay
              loop
              muted
              className="max-w-full max-h-[80vh] object-contain"
            />
          ) : (
            <img
              src={mediaSrc}
              alt={item.prompt}
              className="max-w-full max-h-[80vh] object-contain"
            />
          )}
        </div>

        {/* Info panel */}
        <div className="lg:w-96 flex flex-col gap-6">
          {/* Prompt */}
          <div>
            <h2 className="text-white font-semibold text-lg mb-2">Prompt</h2>
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

          {/* Creator Wallet */}
          {item.walletAddress && (
            <div>
              <h2 className="text-white font-semibold text-lg mb-2">Creator Wallet</h2>
              <p className="text-white/90 text-sm font-mono break-all">{item.walletAddress}</p>
            </div>
          )}

          {/* Parameters */}
          {paramEntries.length > 0 && (
            <div>
              <h2 className="text-white font-semibold text-lg mb-3">Parameters</h2>
              <div className="grid grid-cols-2 gap-3">
                {paramEntries.map(([key, value]) => (
                  <div key={key} className="bg-white/5 rounded-xl p-3">
                    <div className="text-white/60 text-xs mb-1">{key}</div>
                    <div className="text-white/90 text-sm font-medium">{formatParamValue(key.toLowerCase(), value)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-3 pt-4 border-t border-white/10">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDownload();
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
}
