"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import { deleteGalleryItem, publishGalleryItem, unpublishGalleryItem, extractSingleImage, GalleryItem } from "@/lib/api";
import { downloadMedia, getMediaFilename } from "@/lib/utils/download";
import { getThumbnailUrl } from "@/lib/utils/thumbnails";
import { extractFrame } from "@/lib/utils/video-frames";
import { useDirectorStore } from "@/lib/stores/director-store";
import { DisplayCreation, removeCreation } from "@/lib/storage";
import { ImageModal } from "./image-modal";

interface CreationCardProps {
  creation: DisplayCreation;
  onDelete?: (jobId: string) => void;
  onPublishChange?: (jobId: string, isPublic: boolean) => void;
  onRegenerate?: (creation: DisplayCreation) => void;
  onExtractComplete?: () => void; // Called after Save as Single succeeds
  isRegenerating?: boolean;
}

// Unified Creation Card - handles both generating and completed states
export function CreationCard({ creation, onDelete, onPublishChange, onRegenerate, onExtractComplete, isRegenerating }: CreationCardProps) {
  const [showModal, setShowModal] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isExtending, setIsExtending] = useState(false);
  const router = useRouter();
  const [showFeedback, setShowFeedback] = useState<'published' | 'unpublished' | 'extracted' | null>(null);
  const [localIsPublic, setLocalIsPublic] = useState(creation.isPublic);
  
  const isBatchGeneration = creation.generations.length > 1;
  const firstGen = creation.generations[0];
  const mediaUrl = firstGen?.url || firstGen?.base64;
  const isVideo = creation.type === "video" || firstGen?.kind === "video";
  
  // Calculate aspect ratio for generating placeholder
  const aspectRatio = creation.width && creation.height 
    ? `${creation.width} / ${creation.height}` 
    : '1 / 1';
  
  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirmDialog({
      title: 'Delete this creation?',
      message: 'It will be removed from your creations and the gallery.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    setIsDeleting(true);
    try {
      // Delete from server
      await deleteGalleryItem(creation.jobId);
    } catch (err: unknown) {
      // If server says not found (404), that's fine - just clean up locally
      // Error format is "404: message" from jsonFetch
      const message = err instanceof Error ? err.message : '';
      const isNotFound = message.startsWith('404:') || message.includes('not found');
      if (!isNotFound) {
        console.error('Failed to delete from server:', err);
        // Still try to clean up locally
      }
    }
    // Always remove from localStorage and UI (even if server delete failed)
    removeCreation(creation.jobId);
    onDelete?.(creation.jobId);
    setIsDeleting(false);
  };
  
  const handleTogglePublish = async () => {
    setIsPublishing(true);
    try {
      if (localIsPublic) {
        await unpublishGalleryItem(creation.jobId);
        setLocalIsPublic(false);
        onPublishChange?.(creation.jobId, false);
        setShowFeedback('unpublished');
        setTimeout(() => setShowFeedback(null), 2000);
      } else {
        await publishGalleryItem(creation.jobId);
        setLocalIsPublic(true);
        onPublishChange?.(creation.jobId, true);
        setShowFeedback('published');
        setTimeout(() => setShowFeedback(null), 2000);
      }
    } catch (err) {
      console.error('Failed to toggle publish:', err);
      toast.error(localIsPublic ? 'Failed to unpublish' : 'Failed to publish');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleExtract = async (index: number) => {
    setIsExtracting(true);
    try {
      await extractSingleImage(creation.jobId, index);
      setShowFeedback('extracted');
      setTimeout(() => setShowFeedback(null), 2000);
      setShowModal(false);
      // Trigger refresh so new item appears
      onExtractComplete?.();
    } catch (err) {
      console.error('Failed to extract image:', err);
      toast.error('Failed to save as single');
    } finally {
      setIsExtracting(false);
    }
  };
  
  // Extend this clip in the Director: grab its last frame as a new segment's
  // start image, then jump into the console to chain from it.
  const handleExtendInDirector = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!mediaUrl || isExtending) return;
    setIsExtending(true);
    try {
      const frame = await extractFrame(mediaUrl, 'last');
      // New project seeded with this clip's last frame; the current project is
      // auto-saved by the store.
      useDirectorStore.getState().startProjectFromClip({
        image: frame,
        name: (creation.prompt || 'Extended clip').slice(0, 40),
      });
      router.push('/create/director');
    } catch (err) {
      console.error('Extend in Director failed:', err);
      toast.error('Could not read the clip’s last frame.');
      setIsExtending(false);
    }
  };

  const thumbnailUrl = mediaUrl && !mediaUrl.startsWith('data:') && !isVideo
    ? getThumbnailUrl(mediaUrl, 400)
    : mediaUrl;
  
  // Reset imageLoaded when URL changes
  const [prevUrl, setPrevUrl] = useState<string | undefined>(undefined);
  if (thumbnailUrl !== prevUrl) {
    setPrevUrl(thumbnailUrl);
    if (thumbnailUrl) setImageLoaded(false);
  }
    
  // Show spinner until BOTH: generation done AND image loaded (or no image to load)
  const showSpinner = creation.isGenerating || (thumbnailUrl && !imageLoaded && !mediaError);
  
  // Show image only when fully ready - not generating AND image loaded
  const showImage = !creation.isGenerating && thumbnailUrl && imageLoaded && !mediaError;

  // For batch generations during loading, we need to track expected count
  const expectedBatchSize = creation.expectedGenerations || creation.generations.length || 1;
  const isBatchMode = expectedBatchSize > 1;
  
  // For batch mode: can click if at least one image is ready
  const batchHasImages = isBatchMode && creation.generations.length > 0;
  const canOpenModal = isBatchMode ? batchHasImages : !showSpinner;
  
  // For batch mode: show generating border if not all images are ready
  const isStillGenerating = isBatchMode 
    ? (creation.isGenerating || creation.generations.length < expectedBatchSize)
    : showSpinner;

  return (
    <>
      <div 
        className="mb-0.5 group cursor-pointer break-inside-avoid"
        onClick={() => canOpenModal && setShowModal(true)}
      >
        <div className={`relative rounded-xl overflow-hidden bg-zinc-800 border transition-colors ${
          isStillGenerating ? 'border-indigo-500/50' : 'border-zinc-700/50 hover:border-zinc-600'
        }`}>
          {/* Publish/Unpublish feedback overlay */}
          {showFeedback && (
            <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center bg-black/50 animate-fadeIn">
              <div className="flex flex-col items-center gap-2 animate-bounce-in">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-lg ${
                  showFeedback === 'published' 
                    ? 'bg-purple-600 shadow-purple-500/50 animate-pulse-glow' 
                    : 'bg-zinc-700 shadow-zinc-600/50'
                }`}>
                  P
                </div>
                <span className="text-white font-semibold text-lg tracking-wide">
                  {showFeedback === 'published' ? 'Published!' : 'Unpublished'}
                </span>
              </div>
            </div>
          )}
          
          {/* BATCH MODE: 2x2 Grid of images/spinners */}
          {isBatchMode && (
            <div 
              className="grid grid-cols-2 grid-rows-2 gap-0.5 bg-zinc-800" 
              style={{ aspectRatio }}
            >
              {Array.from({ length: expectedBatchSize }).map((_, idx) => {
                const gen = creation.generations[idx];
                const genUrl = gen?.url || gen?.base64;
                const genThumbnail = genUrl && !genUrl.startsWith('data:') ? getThumbnailUrl(genUrl, 300) : genUrl;
                const genIsVideo = gen?.kind === "video";
                
                return (
                  <div 
                    key={idx} 
                    className="relative bg-zinc-900 overflow-hidden flex items-center justify-center"
                  >
                    {/* Show image/video if available */}
                    {genUrl ? (
                      genIsVideo ? (
                        <video 
                          src={genUrl} 
                          className="w-full h-full object-cover"
                          autoPlay loop muted playsInline 
                        />
                      ) : (
                        <img 
                          src={genThumbnail} 
                          alt={`${creation.prompt.slice(0, 20)}... (${idx + 1})`}
                          className="w-full h-full object-cover"
                          loading="eager"
                        />
                      )
                    ) : (
                      /* Spinner for this slot */
                      <div className="flex flex-col items-center justify-center">
                        <div className="w-8 h-8 rounded-full border-2 border-zinc-700 border-t-indigo-500 animate-spin" />
                        <span className="text-zinc-500 text-[10px] mt-2">{idx + 1}/{expectedBatchSize}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          
          {/* SINGLE MODE: Original single image display */}
          {!isBatchMode && (
            <div 
              className="relative bg-zinc-900 overflow-hidden" 
              style={showSpinner ? { aspectRatio } : undefined}
            >
              {/* ALWAYS render image to preload it - hidden until ready */}
              {thumbnailUrl && !mediaError && (
                <>
                  {isVideo ? (
                    <video 
                      src={thumbnailUrl} 
                      className={`w-full h-auto block ${showImage ? '' : 'sr-only'}`}
                      autoPlay loop muted playsInline 
                      onLoadedData={() => setImageLoaded(true)}
                      onError={() => setMediaError(true)} 
                    />
                  ) : (
                    <img 
                      src={thumbnailUrl} 
                      alt={creation.prompt.slice(0, 50)} 
                      className={`w-full h-auto block ${showImage ? '' : 'sr-only'}`}
                      loading="eager"
                      onLoad={() => setImageLoaded(true)}
                      onError={() => setMediaError(true)} 
                    />
                  )}
                </>
              )}
              
              {/* Show spinner while generating OR while image is loading */}
              {showSpinner && (
                <div className="absolute inset-0 overflow-hidden bg-zinc-900">
                  <div 
                    className="absolute inset-0 opacity-30"
                    style={{
                      background: 'radial-gradient(circle at 50% 50%, rgba(99, 102, 241, 0.15) 0%, transparent 70%)',
                      animation: 'pulse 3s ease-in-out infinite'
                    }}
                  />
                  
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
                    <div className="relative w-12 h-12 mb-3">
                      <div className="w-12 h-12 rounded-full border-2 border-zinc-700" />
                      <div 
                        className="absolute inset-0 w-12 h-12 rounded-full border-2 border-transparent border-t-indigo-500"
                        style={{ animation: 'spin 1s linear infinite' }}
                      />
                    </div>
                    
                    <p className="text-zinc-400 text-xs text-center">
                      {!creation.isGenerating 
                        ? 'Loading...'
                        : creation.status === 'queued' 
                          ? (creation.queuePosition && creation.queuePosition > 0 
                              ? `Queue #${creation.queuePosition}` 
                              : 'Finding worker...')
                          : isVideo ? 'Creating video...' : 'Creating image...'
                      }
                    </p>
                    
                    {creation.isGenerating && (
                      <p className="text-zinc-500 text-[10px] mt-1">
                        {Math.round(creation.progress || 0)}%
                      </p>
                    )}
                    
                    <p className="text-zinc-500 text-[10px] mt-2 line-clamp-2 text-center max-w-[90%]">
                      {creation.prompt}
                    </p>
                  </div>
                  
                  <div className="absolute top-2 left-2 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-[10px] text-zinc-400 flex items-center gap-1">
                    {isVideo ? (
                      <><svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>Video</>
                    ) : (
                      <><svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>Image</>
                    )}
                  </div>
                </div>
              )}
              
              {/* Error state */}
              {!showSpinner && (!thumbnailUrl || mediaError) && (
                <div className="absolute inset-0 flex items-center justify-center bg-zinc-800/50">
                  <span className="text-4xl opacity-50">{isVideo ? '🎬' : '🖼️'}</span>
                </div>
              )}
            </div>
          )}
          
          {/* Batch badge overlay */}
          {isBatchMode && creation.generations.length > 0 && (
            <div className="absolute top-2 left-2 px-2 py-1 bg-black/70 backdrop-blur-sm rounded text-[10px] text-white flex items-center gap-1 font-medium">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              {creation.generations.length}
            </div>
          )}
          
          {/* Video badge for single videos */}
          {!isBatchMode && !showSpinner && isVideo && thumbnailUrl && !mediaError && (
            <div className="absolute top-2 left-2 px-2 py-1 bg-black/70 rounded-md text-xs text-white flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              Video
            </div>
          )}
          
          {/* Action buttons - top right (show for single when ready, or batch with images) */}
          {(!showSpinner || batchHasImages) && (
            <div className="absolute top-2 right-2 flex gap-1.5 z-10">
              {/* Job info (worker + timing from the grid) — ⓘ with hover panel */}
              {(creation.worker || creation.genTime != null || firstGen?.seed) && (
                <div className="relative group/info">
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="w-7 h-7 flex items-center justify-center rounded-full bg-black/50 hover:bg-zinc-700 text-white text-xs opacity-0 group-hover:opacity-100 transition-all"
                    title="Generation details"
                    aria-label="Generation details"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute top-8 right-0 w-52 p-3 rounded-lg bg-zinc-900/95 border border-zinc-700 shadow-xl text-[11px] text-zinc-300 opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible transition-all z-30 cursor-default"
                  >
                    <div className="font-semibold text-zinc-100 mb-1.5">Generation details</div>
                    <dl className="space-y-1">
                      {creation.worker && (
                        <div className="flex justify-between gap-2"><dt className="text-zinc-500">Worker</dt><dd className="text-right truncate font-mono">{creation.worker}</dd></div>
                      )}
                      {creation.modelName && (
                        <div className="flex justify-between gap-2"><dt className="text-zinc-500">Model</dt><dd className="text-right truncate">{creation.modelName}</dd></div>
                      )}
                      {creation.genTime != null && (
                        <div className="flex justify-between gap-2"><dt className="text-zinc-500">Gen time</dt><dd className="text-right">{creation.genTime.toFixed(1)}s</dd></div>
                      )}
                      {firstGen?.seed && (
                        <div className="flex justify-between gap-2"><dt className="text-zinc-500">Seed</dt><dd className="text-right font-mono truncate">{firstGen.seed}</dd></div>
                      )}
                    </dl>
                  </div>
                </div>
              )}
              {/* Extend in Director (videos): last frame → new chained segment */}
              {isVideo && !isBatchMode && mediaUrl && !mediaError && (
                <button
                  onClick={handleExtendInDirector}
                  disabled={isExtending}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-black/50 hover:bg-amber-600 text-white opacity-0 group-hover:opacity-100 transition-all"
                  title="Extend in Director — continue this clip from its last frame"
                >
                  {isExtending ? (
                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 17H7A5 5 0 0 1 7 7h2" />
                      <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
                      <line x1="8" y1="12" x2="16" y2="12" />
                    </svg>
                  )}
                </button>
              )}
              {/* Publish toggle button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleTogglePublish();
                }}
                disabled={isPublishing}
                className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold transition-all ${
                  localIsPublic 
                    ? 'bg-purple-600 text-white hover:bg-purple-700' 
                    : 'bg-black/50 hover:bg-purple-600 text-white opacity-0 group-hover:opacity-100'
                }`}
                title={localIsPublic ? "Click to unpublish" : "Publish to Gallery"}
              >
                {isPublishing ? (
                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  "P"
                )}
              </button>
              {/* Delete button */}
              {onDelete && (
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="p-1.5 bg-black/60 hover:bg-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-all"
                  title="Delete"
                >
                  {isDeleting ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  )}
                </button>
              )}
            </div>
          )}
          
          {/* Hover overlay */}
          {(!showSpinner || batchHasImages) && (
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <p className="text-white text-xs line-clamp-2">{creation.prompt}</p>
              </div>
            </div>
          )}
          
        </div>
      </div>

      {/* Modal - using shared ImageModal component */}
      {showModal && canOpenModal && (
        <ImageModal
          isOpen={true}
          onClose={() => setShowModal(false)}
          item={{
            jobId: creation.jobId,
            modelId: creation.modelId,
            modelName: creation.modelName,
            prompt: creation.prompt,
            negativePrompt: "",
            type: creation.type,
            isNsfw: false,
            isPublic: localIsPublic || false,
            walletAddress: creation.walletAddress,
            createdAt: creation.createdAt,
            mediaUrls: creation.generations.map(g => g.url || g.base64 || "").filter(Boolean),
            seeds: creation.generations.map(g => g.seed).filter(Boolean),
            params: creation.params || {
              width: creation.width,
              height: creation.height,
            },
          }}
          onDownload={(index) => {
            const gen = creation.generations[index];
            const url = gen?.url || gen?.base64;
            if (url) {
              const filename = getMediaFilename(creation.jobId, gen?.id, gen?.kind === "video");
              downloadMedia(url, filename);
            }
          }}
          isOwner={true}
          isPublic={localIsPublic || false}
          onPublish={handleTogglePublish}
          onDelete={() => handleDelete({ stopPropagation: () => {} } as React.MouseEvent)}
          onRegenerate={onRegenerate ? () => onRegenerate(creation) : undefined}
          onExtract={isBatchGeneration ? handleExtract : undefined}
          isDeleting={isDeleting}
          isPublishing={isPublishing}
          isRegenerating={isRegenerating}
          isExtracting={isExtracting}
        />
      )}
    </>
  );
}
