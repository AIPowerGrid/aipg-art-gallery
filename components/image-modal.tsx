"use client";

import { useEffect } from "react";

interface ImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  mediaSrc: string | undefined;
  prompt: string;
  isVideo: boolean;
  onDownload: () => void;
}

export function ImageModal({ isOpen, onClose, mediaSrc, prompt, isVideo, onDownload }: ImageModalProps) {
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 text-white/80 hover:text-white text-4xl font-light leading-none z-10"
          aria-label="Close"
        >
          ×
        </button>

        {/* Media container */}
        <div className="relative max-w-full max-h-[85vh] flex items-center justify-center">
          {isVideo ? (
            <video
              src={mediaSrc}
              controls
              autoPlay
              loop
              muted
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <img
              src={mediaSrc}
              alt={prompt}
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>

        {/* Info and actions */}
        <div className="mt-4 px-6 py-4 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20 min-w-[300px]">
          <p className="text-white/90 text-sm mb-3 line-clamp-2">{prompt}</p>
          <div className="flex items-center justify-between gap-4">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDownload();
              }}
              className="px-4 py-2 bg-gradient-to-r from-orange-500 to-yellow-400 text-black font-semibold rounded-full hover:opacity-90 transition flex items-center gap-2"
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
              className="text-white/70 hover:text-white text-sm underline"
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
