"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import Link from "next/link";
import { fetchGalleryByWallet, fetchJobStatus, fetchGalleryMedia, GalleryItem } from "@/lib/api";
import { JobStatus } from "@/types/models";
import { ImageModal } from "@/components/image-modal";
import { WalletButton } from "@/components/wallet-button";

interface ItemWithStatus extends GalleryItem {
  status?: JobStatus;
  loading?: boolean;
  mediaUrls?: string[];
  mediaError?: string;
}

// Wrapper component to ensure we only use wagmi after mounting
export default function ProfilePage() {
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);
  
  if (!mounted) {
    return (
      <main className="flex-1 w-full px-4 md:px-10 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-2 border-white/30 border-t-orange-500 rounded-full" />
        </div>
      </main>
    );
  }
  
  return <ProfilePageClient />;
}

function ProfilePageClient() {
  const [items, setItems] = useState<ItemWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ItemWithStatus | null>(null);
  const { address, isConnected } = useAccount();

  useEffect(() => {
    if (isConnected && address) {
      loadCreations(address);
    } else {
      setLoading(false);
    }
  }, [address, isConnected]);

  async function loadCreations(walletAddress: string) {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetchGalleryByWallet(walletAddress, 100);
      
      // Initialize with loading state
      const itemsWithLoading: ItemWithStatus[] = response.items.map(item => ({
        ...item,
        loading: true,
      }));
      
      setItems(itemsWithLoading);
      setLoading(false);
      
      // Fetch media for items (non-blocking, in batches)
      // Job status is optional - we prioritize media URLs from the gallery
      const itemsToProcess = response.items;
      const batchSize = 10; // Increased batch size since we're not fetching job status
      
      for (let i = 0; i < itemsToProcess.length; i += batchSize) {
        const batch = itemsToProcess.slice(i, i + batchSize);
        
        // Process batch in parallel - only fetch media, skip job status to avoid 502 errors
        Promise.allSettled(
          batch.map(async (item) => {
            try {
              // Only fetch media URLs - job status is optional and often unavailable
              const media = await fetchGalleryMedia(item.jobId).catch((err) => {
                // Silently handle errors - don't log expected failures
                return { mediaUrls: item.mediaUrls || [], error: undefined };
              });
              
              setItems(prev => prev.map(i => 
                i.jobId === item.jobId 
                  ? { 
                      ...i, 
                      mediaUrls: media.mediaUrls || item.mediaUrls || [],
                      mediaError: media.error,
                      loading: false 
                    }
                  : i
              ));
            } catch (err) {
              // Silently handle errors - use existing mediaUrls if available
              setItems(prev => prev.map(i => 
                i.jobId === item.jobId 
                  ? { 
                      ...i, 
                      loading: false, 
                      mediaUrls: item.mediaUrls || [],
                      mediaError: undefined
                    }
                  : i
              ));
            }
          })
        );
        
        // Small delay between batches to avoid overwhelming the server
        if (i + batchSize < itemsToProcess.length) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
    } catch (err: any) {
      console.error("Error loading creations:", err);
      setError(err.message || "Failed to load your creations");
      setLoading(false);
    }
  }

  function handleDownload(item: ItemWithStatus) {
    const generation = item.status?.generations?.[0];
    const mediaSrc = generation?.base64 || generation?.url;
    if (!mediaSrc) return;
    
    const isVideo = generation?.kind === "video" || item.type === "video";
    const filename = `${item.jobId}.${isVideo ? "mp4" : "png"}`;
    
    try {
      // For base64 data, create a blob directly
      if (mediaSrc.startsWith("data:")) {
        const link = document.createElement("a");
        link.href = mediaSrc;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }
      
      // For URLs, fetch and download
      fetch(mediaSrc)
        .then(response => response.blob())
        .then(blob => {
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
        })
        .catch(err => {
          console.error("Download failed:", err);
          // Fallback: open in new tab
          window.open(mediaSrc, "_blank");
        });
    } catch (err) {
      console.error("Download failed:", err);
      window.open(mediaSrc, "_blank");
    }
  }

  // Not connected
  if (!isConnected) {
    return (
      <main className="flex-1 w-full min-h-screen bg-black">
        {/* Header with navigation and wallet */}
        <header className="sticky top-0 z-40 bg-black/80 backdrop-blur-md border-b border-white/5">
          <div className="max-w-[1920px] mx-auto px-6 md:px-12 py-4 flex items-center justify-between">
            <Link href="/" className="text-white text-xl font-semibold">
              AIPG Art Gallery
            </Link>
            <div className="flex items-center gap-6">
              <Link
                href="/"
                className="text-white/80 hover:text-white text-sm transition"
              >
                Gallery
              </Link>
              <Link
                href="/create"
                className="text-white/80 hover:text-white text-sm transition"
              >
                Create
              </Link>
              <Link
                href="/profile"
                className="text-white/80 hover:text-white text-sm transition"
              >
                My Creations
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <WalletButton />
            </div>
          </div>
        </header>

        <div className="max-w-[1920px] mx-auto px-6 md:px-12 py-8 space-y-8">
          {/* Title */}
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
              AIPG Art Gallery
            </h1>
            <p className="text-white/50 text-sm">
              My Creations
            </p>
          </div>

          <div className="text-center py-20">
            <div className="panel max-w-md mx-auto space-y-4">
              <div className="text-4xl">🔗</div>
              <h2 className="text-xl font-semibold text-white">Connect Your Wallet</h2>
              <p className="text-white/70">
                Your wallet address is used to identify your creations across devices.
              </p>
              <p className="text-white/50 text-sm">
                Connect your wallet using the button in the top right corner.
              </p>
              <Link
                href="/create"
                className="inline-block px-6 py-2 rounded-md bg-gradient-to-r from-orange-500 to-yellow-400 text-black font-semibold hover:opacity-90 transition"
              >
                Start Creating
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 w-full min-h-screen bg-black">
      {/* Header with navigation and wallet */}
      <header className="sticky top-0 z-40 bg-black/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-[1920px] mx-auto px-6 md:px-12 py-4 flex items-center justify-between">
          <Link href="/" className="text-white text-xl font-semibold">
            AIPG Art Gallery
          </Link>
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="text-white/80 hover:text-white text-sm transition"
            >
              Gallery
            </Link>
            <Link
              href="/create"
              className="text-white/80 hover:text-white text-sm transition"
            >
              Create
            </Link>
            <Link
              href="/profile"
              className="text-white/80 hover:text-white text-sm transition"
            >
              My Creations
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <WalletButton />
          </div>
        </div>
      </header>

      {/* Prominent search bar in center */}
      <div className="max-w-[1920px] mx-auto px-6 md:px-12 py-12">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <h1 className="text-center text-3xl md:text-4xl font-bold text-white mb-8">
            My Creations
          </h1>
          
          {/* Search bar */}
          <div className="relative mb-6">
            <input
              type="text"
              placeholder="Search for an image..."
              className="w-full px-6 py-4 bg-white/10 border-2 border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:border-orange-500/50 transition text-lg"
            />
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-white/70 hover:text-white transition"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-[1920px] mx-auto px-6 md:px-12 py-8">
        {loading ? (
          <div className="text-center text-white/50 py-20">
            <div className="animate-spin w-8 h-8 border-2 border-white/30 border-t-white rounded-full mx-auto mb-4" />
            Loading your creations...
          </div>
        ) : error ? (
          <div className="text-center py-40">
            <div className="max-w-md mx-auto space-y-4">
              <div className="text-4xl">⚠️</div>
              <h2 className="text-xl font-semibold text-white">Could not load creations</h2>
              <p className="text-white/70">{error}</p>
              <button
                onClick={() => address && loadCreations(address)}
                className="inline-block px-6 py-2 rounded-md bg-white/10 border border-white/20 text-white hover:bg-white/20 transition"
              >
                Try Again
              </button>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-40">
            <div className="max-w-md mx-auto space-y-4">
              <div className="text-4xl">🎨</div>
              <h2 className="text-xl font-semibold text-white">No creations yet</h2>
              <p className="text-white/70">
                When you generate images or videos with your wallet connected, they'll appear here.
              </p>
              <Link
                href="/create"
                className="inline-block px-6 py-2 rounded-md bg-gradient-to-r from-orange-500 to-yellow-400 text-black font-semibold hover:opacity-90 transition"
              >
                Start Creating
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Gallery grid - lexica style masonry layout */}
            <div className="max-w-[1920px] mx-auto px-6 md:px-12 pb-12">
              <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-0">
              {items.map((item) => (
                <CreationCard 
                  key={item.jobId} 
                  item={item}
                  onSelect={() => setSelectedItem(item)}
                  onDownload={() => handleDownload(item)}
                />
              ))}
            </div>
          </div>

          {/* Image Modal */}
          {selectedItem && (() => {
            const generation = selectedItem.status?.generations?.[0];
            const mediaSrc = generation?.base64 || generation?.url || selectedItem.mediaUrls?.[0];
            
            if (!mediaSrc) return null;
            
            // Construct a GalleryItem for the modal with mediaUrls
            const modalItem: GalleryItem = {
              jobId: selectedItem.jobId,
              modelId: selectedItem.modelId,
              modelName: selectedItem.modelName,
              prompt: selectedItem.prompt,
              negativePrompt: selectedItem.negativePrompt,
              type: selectedItem.type,
              isNsfw: selectedItem.isNsfw,
              walletAddress: selectedItem.walletAddress,
              createdAt: selectedItem.createdAt,
              params: selectedItem.params,
              mediaUrls: mediaSrc.startsWith('data:') || mediaSrc.startsWith('http') 
                ? [mediaSrc] 
                : selectedItem.mediaUrls || [],
            };
            
            return (
              <ImageModal
                isOpen={!!selectedItem}
                onClose={() => setSelectedItem(null)}
                item={modalItem}
                onDownload={() => handleDownload(selectedItem)}
              />
            );
          })()}
        </>
        )}
      </div>
    </main>
  );
}

interface CreationCardProps {
  item: ItemWithStatus;
  onSelect: () => void;
  onDownload: () => void;
}

function CreationCard({ item, onSelect, onDownload }: CreationCardProps) {
  const [imageError, setImageError] = useState(false);
  const [showControls, setShowControls] = useState(false);
  
  // Use mediaUrls if available, otherwise fall back to generation data from job status
  const generation = item.status?.generations?.[0];
  const isFaulted = item.status?.status === "faulted";
  const mediaSrc = item.mediaUrls?.[0] || generation?.base64 || generation?.url;
  const isVideo = item.type === "video";
  // Don't require job status - if we have mediaUrls, show the media
  const hasMedia = !!mediaSrc && !isFaulted && (item.mediaUrls?.length ?? 0) > 0;

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
        ) : isFaulted ? (
          <div className="w-full min-h-[200px] flex flex-col items-center justify-center text-white/30 p-4">
            <span className="text-3xl mb-2">❌</span>
            <span className="text-xs text-center">Generation failed</span>
          </div>
        ) : !hasMedia ? (
          <div className="w-full min-h-[200px] flex flex-col items-center justify-center text-white/30 p-4">
            <span className="text-3xl mb-2">{isVideo ? "🎬" : "🖼️"}</span>
            <span className="text-xs text-center">Media unavailable</span>
          </div>
        ) : isVideo ? (
          // Display videos with proper video element
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
        
        {/* Overlay with controls - visible on hover */}
        {showControls && hasMedia && (
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 z-10">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDownload();
              }}
              className="p-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white rounded-full transition-all"
              title="Download"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
          </div>
        )}

        {/* NSFW badge */}
        {item.isNsfw && (
          <div className="absolute top-2 right-2 px-2 py-1 bg-red-500/90 text-white text-xs rounded backdrop-blur-sm">
            NSFW
          </div>
        )}
      </div>
      {/* No metadata shown on card - clean lexica style */}
    </div>
  );
}
