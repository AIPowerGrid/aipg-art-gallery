"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { fetchGallery, fetchGalleryMedia, deleteGalleryItem, GalleryItem } from "@/lib/api";

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
        // @ts-ignore - ethereum is injected by wallet
        const ethereum = window.ethereum;
        if (ethereum) {
          const accounts = await ethereum.request({ method: "eth_accounts" });
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
    // @ts-ignore
    const ethereum = window.ethereum;
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
    } catch (err: any) {
      alert(`Failed to delete: ${err.message}`);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <main className="flex-1 w-full px-4 md:px-10 py-8 space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-gradient">
            Gallery
          </h1>
          <p className="text-white/50 text-sm mt-1">
            Browse community creations
          </p>
        </div>
        <Link
          href="/create"
          className="px-6 py-2 rounded-full bg-gradient-to-r from-orange-500 to-yellow-400 text-black font-semibold hover:opacity-90 transition"
        >
          Create
        </Link>
      </header>

      {/* Filters */}
      <div className="flex gap-2">
        {(["all", "image", "video"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-full border transition text-sm ${
              filter === f
                ? "border-white text-white bg-white/10"
                : "border-white/20 text-white/70 hover:text-white"
            }`}
          >
            {f === "all" ? "All" : f === "image" ? "🖼️ Images" : "🎬 Videos"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center text-white/50 py-20">
          <div className="animate-spin w-8 h-8 border-2 border-white/30 border-t-white rounded-full mx-auto mb-4" />
          Loading gallery...
        </div>
      ) : error ? (
        <div className="text-center py-20">
          <div className="panel max-w-md mx-auto space-y-4">
            <div className="text-4xl">⚠️</div>
            <h2 className="text-xl font-semibold text-white">Could not load gallery</h2>
            <p className="text-white/70">{error}</p>
            <button
              onClick={loadGallery}
              className="inline-block px-6 py-2 rounded-full bg-white/10 border border-white/20 text-white hover:bg-white/20 transition"
            >
              Try Again
            </button>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20">
          <div className="panel max-w-md mx-auto space-y-4">
            <div className="text-4xl">🖼️</div>
            <h2 className="text-xl font-semibold text-white">No shared creations yet</h2>
            <p className="text-white/70">
              Be the first! Create something and enable "Share to gallery" to have it appear here.
            </p>
            <Link
              href="/create"
              className="inline-block px-6 py-2 rounded-full bg-gradient-to-r from-orange-500 to-yellow-400 text-black font-semibold hover:opacity-90 transition"
            >
              Start Creating
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Item count */}
          <div className="text-white/50 text-sm">
            Showing {items.length} of {total} items
          </div>

          {/* Gallery grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {items.map((item) => (
              <GalleryCard 
                key={item.jobId} 
                item={item} 
                onDelete={() => handleDelete(item.jobId, item.walletAddress)}
                isDeleting={deleting === item.jobId}
                canDelete={mounted && isConnected && address ? 
                  (!item.walletAddress || item.walletAddress.toLowerCase() === address.toLowerCase()) 
                  : false}
              />
            ))}
          </div>

          {/* Infinite scroll trigger */}
          <div 
            ref={loadMoreRef}
            className="flex justify-center py-8"
          >
            {loadingMore ? (
              <div className="flex items-center gap-3 text-white/50">
                <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full" />
                Loading more...
              </div>
            ) : hasMore ? (
              <button
                onClick={loadMore}
                className="px-6 py-2 rounded-full bg-white/10 border border-white/20 text-white/70 hover:text-white hover:bg-white/20 transition"
              >
                Load More
              </button>
            ) : items.length > 0 ? (
              <p className="text-white/30 text-sm">No more items to load</p>
            ) : null}
          </div>
        </>
      )}
    </main>
  );
}

interface GalleryCardProps {
  item: GalleryItemWithMedia;
  onDelete: () => void;
  isDeleting: boolean;
  canDelete: boolean;
}

function GalleryCard({ item, onDelete, isDeleting, canDelete }: GalleryCardProps) {
  const [imageError, setImageError] = useState(false);
  const [showControls, setShowControls] = useState(false);
  
  const mediaSrc = item.mediaUrls?.[0];
  const isVideo = item.type === "video";
  const hasMedia = !!mediaSrc && !item.mediaError;

  return (
    <div 
      className="panel group hover:scale-[1.02] transition-transform relative"
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      <div className="relative aspect-square rounded-xl overflow-hidden bg-black/40">
        {item.loading ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="animate-spin w-6 h-6 border-2 border-white/30 border-t-white rounded-full" />
          </div>
        ) : !hasMedia ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-white/30 p-4">
            <span className="text-3xl mb-2">{isVideo ? "🎬" : "🖼️"}</span>
            <span className="text-xs text-center">
              {item.mediaError || "Media unavailable"}
            </span>
          </div>
        ) : isVideo ? (
          <video
            src={mediaSrc}
            className="w-full h-full object-cover"
            controls
            muted
            playsInline
            onError={() => setImageError(true)}
          />
        ) : imageError ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-white/50 p-4">
            <span className="text-2xl mb-2">🖼️</span>
            <span className="text-xs">Image unavailable</span>
          </div>
        ) : (
          <img
            src={mediaSrc}
            alt={item.prompt}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        )}
        
        {/* Type badge */}
        <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 text-white/80 text-xs rounded">
          {item.type === "video" ? "🎬" : "🖼️"}
        </div>
        
        {item.isNsfw && (
          <div className="absolute top-2 right-2 px-2 py-0.5 bg-red-500/80 text-white text-xs rounded">
            NSFW
          </div>
        )}

        {/* Delete button - visible on hover, only for owner */}
        {showControls && canDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            disabled={isDeleting}
            className="absolute bottom-2 right-2 p-2 bg-red-500/80 hover:bg-red-600 text-white rounded-full transition-all opacity-0 group-hover:opacity-100 disabled:opacity-50"
            title="Delete from gallery"
          >
            {isDeleting ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            )}
          </button>
        )}

        {/* Media source indicator (for debugging) */}
        {item.mediaSource && (
          <div className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-black/60 text-white/50 text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity">
            {item.mediaSource}
          </div>
        )}
      </div>
      <div className="p-4 space-y-2">
        <p className="text-sm text-white/90 line-clamp-2">{item.prompt}</p>
        <div className="flex items-center justify-between text-xs text-white/50">
          <span>{item.modelName}</span>
          <span>{new Date(item.createdAt).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}
