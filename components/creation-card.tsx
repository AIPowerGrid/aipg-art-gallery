"use client";

import { useState, useEffect } from "react";
import { deleteGalleryItem, publishGalleryItem, unpublishGalleryItem } from "@/lib/api";
import { downloadMedia, getMediaFilename } from "@/lib/utils/download";
import { getThumbnailUrl } from "@/lib/utils/thumbnails";
import { DisplayCreation, removeCreation } from "@/lib/storage";

interface CreationCardProps {
  creation: DisplayCreation;
  onDelete?: (jobId: string) => void;
  onPublishChange?: (jobId: string, isPublic: boolean) => void;
}

// Unified Creation Card - handles both generating and completed states
export function CreationCard({ creation, onDelete, onPublishChange }: CreationCardProps) {
  const [showModal, setShowModal] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [selectedGenIndex, setSelectedGenIndex] = useState(0);
  
  // Lock body scroll when modal is open
  useEffect(() => {
    if (showModal) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [showModal]);
  
  // Close modal on Escape key
  useEffect(() => {
    if (!showModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showModal]);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [showFeedback, setShowFeedback] = useState<'published' | 'unpublished' | null>(null);
  const [localIsPublic, setLocalIsPublic] = useState(creation.isPublic);
  const [copied, setCopied] = useState(false);
  
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
    if (!confirm('Delete this image?')) return;
    setIsDeleting(true);
    try {
      // Delete from server
      await deleteGalleryItem(creation.jobId);
    } catch (err: any) {
      // If server says not found (404), that's fine - just clean up locally
      // Error format is "404: message" from jsonFetch
      const isNotFound = err?.message?.startsWith('404:') || err?.message?.includes('not found');
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
        setShowModal(false);
        setTimeout(() => setShowFeedback(null), 2000);
      } else {
        await publishGalleryItem(creation.jobId);
        setLocalIsPublic(true);
        onPublishChange?.(creation.jobId, true);
        setShowFeedback('published');
        setShowModal(false);
        setTimeout(() => setShowFeedback(null), 2000);
      }
    } catch (err) {
      console.error('Failed to toggle publish:', err);
      alert(localIsPublic ? 'Failed to unpublish' : 'Failed to publish');
    } finally {
      setIsPublishing(false);
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

  const handleDownload = () => {
    if (isBatchMode) {
      // Download current selected image in batch
      const selectedGen = creation.generations[selectedGenIndex];
      const selectedUrl = selectedGen?.url || selectedGen?.base64;
      if (!selectedUrl) return;
      const filename = getMediaFilename(creation.jobId, selectedGen?.id, selectedGen?.kind === "video");
      downloadMedia(selectedUrl, filename);
    } else {
      if (!mediaUrl) return;
      const filename = getMediaFilename(creation.jobId, firstGen?.id, isVideo);
      downloadMedia(mediaUrl, filename);
    }
  };

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

      {/* Modal */}
      {showModal && canOpenModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4"
          onClick={() => setShowModal(false)}
        >
          <div 
            className="flex flex-col max-w-[95vw] max-h-[95vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Media container - fits in viewport */}
            <div className="relative flex-1 min-h-0 flex items-center justify-center">
              {/* Batch mode: Show selected image with navigation */}
              {isBatchMode ? (
                <>
                  {creation.generations.map((gen, idx) => {
                    const genUrl = gen.url || gen.base64;
                    const genIsVideo = gen.kind === "video";
                    
                    if (idx !== selectedGenIndex || !genUrl) return null;
                    
                    return genIsVideo ? (
                      <video 
                        key={gen.id}
                        id={`modal-media-${creation.jobId}-${idx}`}
                        src={genUrl} 
                        className="max-w-full max-h-[75vh] object-contain rounded-lg" 
                        controls 
                        autoPlay 
                        loop 
                        playsInline 
                      />
                    ) : (
                      <img 
                        key={gen.id}
                        id={`modal-media-${creation.jobId}-${idx}`}
                        src={genUrl} 
                        alt={`${creation.prompt} (${idx + 1}/${creation.generations.length})`}
                        className="max-w-full max-h-[75vh] object-contain rounded-lg" 
                      />
                    );
                  })}
                  
                  {/* Navigation arrows for batch */}
                  {creation.generations.length > 1 && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedGenIndex((prev) => (prev - 1 + creation.generations.length) % creation.generations.length);
                        }}
                        className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/60 hover:bg-black/80 rounded-full transition-colors"
                        title="Previous"
                      >
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedGenIndex((prev) => (prev + 1) % creation.generations.length);
                        }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/60 hover:bg-black/80 rounded-full transition-colors"
                        title="Next"
                      >
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                      
                      {/* Image counter */}
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-black/60 rounded-full text-white text-sm font-medium">
                        {selectedGenIndex + 1} / {creation.generations.length}
                      </div>
                    </>
                  )}
                </>
              ) : (
                /* Single image mode */
                mediaUrl && (
                  isVideo ? (
                    <video 
                      id={`modal-media-${creation.jobId}`}
                      src={mediaUrl} 
                      className="max-w-full max-h-[75vh] object-contain rounded-lg" 
                      controls 
                      autoPlay 
                      loop 
                      playsInline 
                    />
                  ) : (
                    <img 
                      id={`modal-media-${creation.jobId}`}
                      src={mediaUrl} 
                      alt={creation.prompt} 
                      className="max-w-full max-h-[75vh] object-contain rounded-lg" 
                    />
                  )
                )
              )}
              
              {/* Control buttons */}
              <div className="absolute top-3 right-3 flex gap-2">
                {/* Fullscreen button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const elId = isBatchMode 
                      ? `modal-media-${creation.jobId}-${selectedGenIndex}`
                      : `modal-media-${creation.jobId}`;
                    const el = document.getElementById(elId);
                    if (el) {
                      if (el.requestFullscreen) {
                        el.requestFullscreen();
                      } else if ((el as any).webkitRequestFullscreen) {
                        (el as any).webkitRequestFullscreen();
                      }
                    }
                  }}
                  className="p-2 bg-black/60 hover:bg-black/80 rounded-full transition-colors"
                  title="Fullscreen"
                >
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                </button>
                {/* Close button */}
                <button
                  onClick={() => setShowModal(false)}
                  className="p-2 bg-black/60 hover:bg-black/80 rounded-full transition-colors"
                >
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Info bar below image */}
            <div className="mt-3 px-4 py-3 bg-zinc-900/90 rounded-xl backdrop-blur-sm max-w-2xl mx-auto w-full">
              {/* Prompt box with copy */}
              <div className="relative mb-3">
                <div className="bg-black/40 rounded-lg p-3 pr-20 border border-white/10">
                  <p className="text-white/90 text-sm leading-relaxed max-h-20 overflow-y-auto">
                    {creation.prompt}
                  </p>
                </div>
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      await navigator.clipboard.writeText(creation.prompt);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    } catch (err) {
                      console.error('Failed to copy:', err);
                    }
                  }}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition ${
                    copied 
                      ? 'bg-green-600 text-white' 
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  }`}
                  title="Copy prompt"
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
              
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 text-xs text-zinc-400">
                  <span>{creation.modelName}</span>
                  <span>•</span>
                  <span>{new Date(creation.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleTogglePublish}
                    disabled={isPublishing}
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    {isPublishing ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        {localIsPublic ? 'Unpublishing...' : 'Publishing...'}
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        {localIsPublic ? 'Unpublish' : 'Publish to Gallery'}
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleDownload}
                    className="px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
