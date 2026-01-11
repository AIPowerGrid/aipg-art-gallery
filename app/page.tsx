"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { fetchGallery, fetchGalleryMedia, deleteGalleryItem, GalleryItem } from "@/lib/api";
import { ImageModal } from "@/components/image-modal";
import { WalletButton } from "@/components/wallet-button";
import { NetworkSelector } from "@/components/network-selector";

const PAGE_SIZE = 25;

interface GalleryItemWithMedia extends GalleryItem {
  mediaUrls?: string[];
  mediaSource?: string;
  loading?: boolean;
  mediaError?: string;
}

// SSR-safe hook for wagmi account
function useWalletAddress() {
  const [address, setAddress] = useState<string | undefined>(undefined);
  const [isConnected, setIsConnected] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Dynamic import wagmi to avoid SSR issues
    import("wagmi").then(({ useAccount }) => {
      // This won't work - hooks can't be called in useEffect
      // We need a different approach
    }).catch(() => {});
  }, []);

  // Use window.ethereum to check connection status directly
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const checkWallet = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ethereum = (window as any).ethereum;
        if (ethereum) {
          const accounts: string[] = await ethereum.request({ method: "eth_accounts" });
          if (accounts && accounts.length > 0) {
            setAddress(accounts[0]);
            setIsConnected(true);
          }
        }
      } catch (e) {
        // Wallet not available or user denied
      }
    };
    
    checkWallet();
    
    // Listen for account changes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ethereum = (window as any).ethereum;
    if (ethereum) {
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length > 0) {
          setAddress(accounts[0]);
          setIsConnected(true);
        } else {
          setAddress(undefined);
          setIsConnected(false);
        }
      };
      ethereum.on("accountsChanged", handleAccountsChanged);
      return () => ethereum.removeListener("accountsChanged", handleAccountsChanged);
    }
  }, []);

  return { address, isConnected, mounted };
}

export default function GalleryPage() {
  const { address, isConnected, mounted } = useWalletAddress();
  const [items, setItems] = useState<GalleryItemWithMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "image" | "video">("all");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [nextOffset, setNextOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [selectedItem, setSelectedItem] = useState<GalleryItemWithMedia | null>(null);
  
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Fetch media for a batch of items
  const fetchMediaForItems = useCallback(async (itemsToFetch: GalleryItem[]) => {
    for (const item of itemsToFetch) {
      try {
        const media = await fetchGalleryMedia(item.jobId);
        setItems(prev => prev.map(i => 
          i.jobId === item.jobId 
            ? { 
                ...i, 
                mediaUrls: media.mediaUrls,
                mediaSource: media.source,
                mediaError: media.error,
                loading: false 
              }
            : i
        ));
      } catch (err: any) {
        setItems(prev => prev.map(i => 
          i.jobId === item.jobId 
            ? { ...i, loading: false, mediaError: err.message }
            : i
        ));
      }
    }
  }, []);

  // Load initial page
  const loadGallery = useCallback(async () => {
    setLoading(true);
    setError(null);
    setItems([]);
    setNextOffset(0);
    setHasMore(true);
    
    try {
      const response = await fetchGallery(filter, PAGE_SIZE, 0);
      
      const itemsWithLoading: GalleryItemWithMedia[] = response.items.map(item => ({
        ...item,
        loading: true,
      }));
      
      setItems(itemsWithLoading);
      setTotal(response.total);
      setHasMore(response.hasMore);
      setNextOffset(response.nextOffset);
      setLoading(false);
      
      // Fetch media for loaded items
      fetchMediaForItems(response.items);
    } catch (err: any) {
      console.error("Error loading gallery:", err);
      setError(err.message || "Failed to load gallery");
      setLoading(false);
    }
  }, [filter, fetchMediaForItems]);

  // Load more items (for infinite scroll)
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    
    setLoadingMore(true);
    
    try {
      const response = await fetchGallery(filter, PAGE_SIZE, nextOffset);
      
      const newItems: GalleryItemWithMedia[] = response.items.map(item => ({
        ...item,
        loading: true,
      }));
      
      setItems(prev => [...prev, ...newItems]);
      setHasMore(response.hasMore);
      setNextOffset(response.nextOffset);
      setLoadingMore(false);
      
      // Fetch media for new items
      fetchMediaForItems(response.items);
    } catch (err: any) {
      console.error("Error loading more:", err);
      setLoadingMore(false);
    }
  }, [filter, nextOffset, hasMore, loadingMore, fetchMediaForItems]);

  // Initial load
  useEffect(() => {
    loadGallery();
  }, [loadGallery]);

  // Infinite scroll observer
  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          loadMore();
        }
      },
      { threshold: 0.1, rootMargin: "100px" }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, loadingMore, loading, loadMore]);

  async function handleDelete(jobId: string, itemWallet?: string) {
    // Check if wallet is connected
    if (!isConnected || !address) {
      alert("Please connect your wallet to delete items");
      return;
    }
    
    // Check ownership (case-insensitive comparison)
    if (itemWallet && itemWallet.toLowerCase() !== address.toLowerCase()) {
      alert("You can only delete your own gallery items");
      return;
    }
    
    if (!confirm("Are you sure you want to delete this item from the gallery?")) {
      return;
    }
    
    setDeleting(jobId);
    try {
      await deleteGalleryItem(jobId, address);
      setItems(prev => prev.filter(i => i.jobId !== jobId));
      if (selectedItem?.jobId === jobId) {
        setSelectedItem(null);
      }
    } catch (err: any) {
      alert(`Failed to delete: ${err.message}`);
    } finally {
      setDeleting(null);
    }
  }

  function handleDownload(item: GalleryItemWithMedia) {
    const mediaSrc = item.mediaUrls?.[0];
    if (!mediaSrc) return;
    
    const isVideo = item.type === "video";
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
          {/* Title */}
          <h1 className="text-center text-3xl md:text-4xl font-bold text-white mb-8">
            AIPG Art Gallery
          </h1>
          
          {/* Search bar */}
          <div className="relative mb-6">
            <input
              type="text"
              placeholder="Search for an image..."
              className="w-full px-6 py-4 bg-white/10 border-2 border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:border-orange-500/50 transition text-lg"
              disabled
            />
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-white/70 hover:text-white transition"
              disabled
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </div>
          
          {/* Action buttons */}
          <div className="flex gap-4 justify-center mb-8">
            <button
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-orange-500 to-yellow-400 text-black font-semibold hover:opacity-90 transition"
              disabled
            >
              Search
            </button>
            <Link
              href="/create"
              className="px-6 py-3 rounded-xl bg-white/10 border border-white/20 text-white font-semibold hover:bg-white/20 transition"
            >
              Create
            </Link>
          </div>

          {/* Filters */}
          <div className="flex gap-2 justify-center">
            {(["all", "image", "video"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-lg text-sm transition ${
                  filter === f
                    ? "bg-gradient-to-r from-orange-500 to-yellow-400 text-black font-semibold"
                    : "bg-white/5 text-white/70 hover:text-white hover:bg-white/10 border border-white/10"
                }`}
              >
                {f === "all" ? "All" : f === "image" ? "Images" : "Videos"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-white/50 py-20">
          <div className="animate-spin w-8 h-8 border-2 border-white/30 border-t-white rounded-full mx-auto mb-4" />
          Loading gallery...
        </div>
      ) : error ? (
        <div className="text-center py-40">
          <div className="max-w-md mx-auto space-y-4">
            <div className="text-4xl">⚠️</div>
            <h2 className="text-xl font-semibold text-white">Could not load gallery</h2>
            <p className="text-white/70">{error}</p>
            <button
              onClick={loadGallery}
              className="inline-block px-6 py-2 rounded-md bg-white/10 border border-white/20 text-white hover:bg-white/20 transition"
            >
              Try Again
            </button>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-40">
          <div className="max-w-md mx-auto space-y-4">
            <div className="text-4xl">🖼️</div>
            <h2 className="text-xl font-semibold text-white">No shared creations yet</h2>
            <p className="text-white/70">
              Be the first! Create something and enable "Share to gallery" to have it appear here.
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
                <GalleryCard 
                  key={item.jobId} 
                  item={item} 
                  onDelete={() => handleDelete(item.jobId, item.walletAddress)}
                  isDeleting={deleting === item.jobId}
                  canDelete={mounted && isConnected && address ? 
                    (!item.walletAddress || item.walletAddress.toLowerCase() === address.toLowerCase()) 
                    : false}
                  onSelect={() => setSelectedItem(item)}
                  onDownload={() => handleDownload(item)}
                />
              ))}
            </div>
          </div>

          {/* Infinite scroll trigger */}
          <div 
            ref={loadMoreRef}
            className="flex justify-center py-12"
          >
            {loadingMore ? (
              <div className="flex items-center gap-3 text-white/50">
                <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full" />
                Loading more...
              </div>
            ) : hasMore ? (
              <button
                onClick={loadMore}
                className="px-6 py-2 rounded-md bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition"
              >
                Load More
              </button>
            ) : items.length > 0 ? (
              <p className="text-white/30 text-sm">No more items to load</p>
            ) : null}
          </div>
        </>
      )}

      {/* Image Modal */}
      {selectedItem && (
        <ImageModal
          isOpen={!!selectedItem}
          onClose={() => setSelectedItem(null)}
          item={selectedItem}
          onDownload={() => handleDownload(selectedItem)}
        />
      )}
    </main>
  );
}

interface GalleryCardProps {
  item: GalleryItemWithMedia;
  onDelete: () => void;
  isDeleting: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onDownload: () => void;
}

function GalleryCard({ item, onDelete, isDeleting, canDelete, onSelect, onDownload }: GalleryCardProps) {
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
            {canDelete && (
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
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                )}
              </button>
            )}
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
