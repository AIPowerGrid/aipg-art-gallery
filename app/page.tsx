"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import Masonry from "react-masonry-css";
import { fetchGallery, deleteGalleryItem, GalleryItem, addFavorite, removeFavorite } from "@/lib/api";
import { ImageModal } from "@/components/image-modal";
import { Header } from "@/components/header";
import { useWalletAddress } from "@/lib/hooks/use-wallet-address";
import { downloadMedia, getMediaFilename } from "@/lib/utils/download";

const INITIAL_PAGE_SIZE = 50; // Load many initially like Lexica
const PAGE_SIZE = 50; // Then load more on scroll

// Masonry breakpoints - matches Lexica's 286px column width
const MASONRY_BREAKPOINTS = {
  default: 5, // 5 columns on large screens
  1400: 4,    // 4 columns
  1100: 3,    // 3 columns  
  768: 2,     // 2 columns on tablet
  500: 1,     // 1 column on mobile
};

// Cloudflare Image Resizing for thumbnails (like Lexica's /md2/)
function getThumbnailUrl(fullUrl: string, width: number = 400): string {
  if (!fullUrl || !fullUrl.includes('images.aipg.art')) {
    return fullUrl;
  }
  
  // Extract the path after images.aipg.art
  const url = new URL(fullUrl);
  const path = url.pathname;
  
  // Use Cloudflare Image Resizing
  return `https://images.aipg.art/cdn-cgi/image/width=${width},quality=85,format=auto${path}`;
}

export const dynamic = 'force-dynamic';

export default function GalleryPage() {
  const { address, isConnected, mounted } = useWalletAddress();
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "image" | "video">("all");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [nextOffset, setNextOffset] = useState(0);
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const loadGallery = useCallback(async () => {
    setLoading(true);
    setError(null);
    setItems([]);
    setNextOffset(0);
    setHasMore(true);
    
    try {
      const response = await fetchGallery(filter, INITIAL_PAGE_SIZE, 0, debouncedSearch || undefined);
      const validItems = response.items.filter(item => 
        item.mediaUrls && item.mediaUrls.length > 0 && item.mediaUrls[0]
      );
      setItems(validItems);
      setHasMore(response.hasMore);
      setNextOffset(response.nextOffset);
      setLoading(false);
    } catch (err: any) {
      setError(err.message || "Failed to load gallery");
      setLoading(false);
    }
  }, [filter, debouncedSearch]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    
    try {
      const response = await fetchGallery(filter, PAGE_SIZE, nextOffset, debouncedSearch || undefined);
      const validItems = response.items.filter(item => 
        item.mediaUrls && item.mediaUrls.length > 0 && item.mediaUrls[0]
      );
      setItems(prev => [...prev, ...validItems]);
      setHasMore(response.hasMore);
      setNextOffset(response.nextOffset);
      setLoadingMore(false);
    } catch {
      setLoadingMore(false);
    }
  }, [filter, nextOffset, hasMore, loadingMore, debouncedSearch]);

  // Debounce search input
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  useEffect(() => {
    loadGallery();
  }, [loadGallery]);

  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          loadMore();
        }
      },
      { threshold: 0.1, rootMargin: "1500px" }
    );

    if (loadMoreRef.current) observerRef.current.observe(loadMoreRef.current);

    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, [hasMore, loadingMore, loading, loadMore]);

  async function handleDelete(jobId: string, itemWallet?: string) {
    if (!isConnected || !address) {
      alert("Please connect your wallet to delete items");
      return;
    }
    if (itemWallet && itemWallet.toLowerCase() !== address.toLowerCase()) {
      alert("You can only delete your own gallery items");
      return;
    }
    if (!confirm("Delete this item from the gallery?")) return;
    
    setDeleting(jobId);
    try {
      await deleteGalleryItem(jobId, address);
      setItems(prev => prev.filter(i => i.jobId !== jobId));
      if (selectedItem?.jobId === jobId) setSelectedItem(null);
    } catch (err: any) {
      alert(`Failed to delete: ${err.message}`);
    } finally {
      setDeleting(null);
    }
  }

  function handleDownload(item: GalleryItem) {
    const mediaSrc = item.mediaUrls?.[0];
    if (!mediaSrc) return;
    downloadMedia(mediaSrc, getMediaFilename(item.jobId, undefined, item.type === "video"));
  }

  async function handleToggleFavorite(jobId: string) {
    if (!isConnected || !address) return;
    
    const wasFavorited = favorites.has(jobId);
    
    // Optimistic update
    setFavorites(prev => {
      const next = new Set(prev);
      if (wasFavorited) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
    
    try {
      if (wasFavorited) {
        await removeFavorite(jobId, address);
      } else {
        await addFavorite(jobId, address);
      }
    } catch (err) {
      // Revert on error
      setFavorites(prev => {
        const next = new Set(prev);
        if (wasFavorited) {
          next.add(jobId);
        } else {
          next.delete(jobId);
        }
        return next;
      });
    }
  }

  const canDelete = (item: GalleryItem) => 
    mounted && isConnected && address && 
    (!item.walletAddress || item.walletAddress.toLowerCase() === address.toLowerCase());

  return (
    <main className="min-h-screen bg-[#0a0a0a]">
      <Header />

      {/* Search header - Lexica style */}
      <div className="w-full px-4 md:px-7 pt-2 sm:pt-4 pb-3 sm:pb-4">
        <div className="max-w-xl mx-auto">
          {/* Search box with arrow button */}
          <div className="relative">
            <div className="flex items-center bg-[#1a1a1a] border border-[#333] rounded-full overflow-hidden focus-within:border-[#555] transition-colors">
              <svg className="w-5 h-5 ml-4 text-[#666]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search images"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-3 bg-transparent text-white placeholder-[#666] focus:outline-none"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery("")}
                  className="mr-1 p-1.5 rounded-full hover:bg-[#333] text-[#666] hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
              <button 
                className="mr-2 p-2 rounded-full bg-[#2a2a2a] hover:bg-[#333] text-white/70 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-2 justify-center mt-4">
            {(["all", "image", "video"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-6 py-1.5 rounded-full text-sm transition-colors ${
                  filter === f
                    ? "bg-[#2a2a2a] text-white font-medium border border-[#444]"
                    : "text-[#666] hover:text-white hover:bg-[#1a1a1a]"
                }`}
              >
                {f === "all" ? "All" : f === "image" ? "Images" : "Videos"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Gallery content */}
      {loading ? (
        <div className="flex items-center justify-center py-32">
          <div className="w-6 h-6 border-2 border-[#333] border-t-white rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-32">
          <p className="text-[#666] mb-4">{error}</p>
          <button onClick={loadGallery} className="px-4 py-2 rounded-xl bg-[#1a1a1a] border border-[#333] text-white hover:bg-[#222]">
            Try Again
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-32">
          <p className="text-[#666] mb-4">No images yet</p>
          <Link href="/create" className="px-4 py-2 rounded-xl bg-gradient-to-r from-zinc-600 to-zinc-500 text-white font-medium">
            Create First Image
          </Link>
        </div>
      ) : (
        <>
          {/* Masonry grid - Lexica style */}
          <div className="px-4 md:px-7 pb-8">
            <Masonry
              breakpointCols={MASONRY_BREAKPOINTS}
              className="masonry-grid flex w-auto -ml-0.5"
              columnClassName="pl-0.5 bg-clip-padding"
            >
              {items.map((item, index) => {
                const fullUrl = item.mediaUrls?.[0] || '';
                const thumbnailUrl = getThumbnailUrl(fullUrl, 400);
                return (
                  <GalleryCard
                    key={item.jobId}
                    item={item}
                    index={index}
                    thumbnailUrl={thumbnailUrl}
                    onSelect={() => setSelectedItem(item)}
                    onDelete={() => handleDelete(item.jobId, item.walletAddress)}
                    onDownload={() => handleDownload(item)}
                    onToggleFavorite={() => handleToggleFavorite(item.jobId)}
                    canDelete={!!canDelete(item)}
                    isDeleting={deleting === item.jobId}
                    isFavorited={favorites.has(item.jobId)}
                    isLoggedIn={isConnected}
                  />
                );
              })}
            </Masonry>
          </div>

          {/* Load more trigger */}
          <div ref={loadMoreRef} className="flex justify-center py-8">
            {loadingMore && (
              <div className="w-6 h-6 border-2 border-[#333] border-t-white rounded-full animate-spin" />
            )}
          </div>
        </>
      )}

      {/* Modal */}
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

// Lexica-style gallery card
function GalleryCard({
  item,
  index,
  thumbnailUrl,
  onSelect,
  onDelete,
  onDownload,
  onToggleFavorite,
  canDelete,
  isDeleting,
  isFavorited,
  isLoggedIn,
}: {
  item: GalleryItem;
  index: number;
  thumbnailUrl: string;
  onSelect: () => void;
  onDelete: () => void;
  onDownload: () => void;
  onToggleFavorite: () => void;
  canDelete: boolean;
  isDeleting: boolean;
  isFavorited: boolean;
  isLoggedIn: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const mediaSrc = item.mediaUrls?.[0];
  const isVideo = item.type === "video";

  // Get dimensions from params to set on img tag (browser reserves space)
  const width = item.params?.width || 1024;
  const height = item.params?.height || 1024;

  if (!mediaSrc || error) return null;

  return (
    <div 
      className="group relative mb-0.5 cursor-pointer overflow-hidden bg-[#0a0a0a]"
      onClick={onSelect}
    >
      {/* Loading placeholder */}
      {!loaded && !isVideo && (
        <div 
          className="w-full bg-neutral-900 animate-pulse" 
          style={{ aspectRatio: `${width} / ${height}` }}
        />
      )}
      
      {/* Image/Video */}
      {isVideo ? (
        <video
          src={mediaSrc}
          className="w-full h-auto block"
          muted
          loop
          playsInline
          onMouseEnter={(e) => e.currentTarget.play()}
          onMouseLeave={(e) => e.currentTarget.pause()}
          onError={() => setError(true)}
        />
      ) : (
        <img
          src={thumbnailUrl}
          alt=""
          width={width}
          height={height}
          className={`w-full h-auto block transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          loading={index < 100 ? "eager" : "lazy"}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      )}
      
      {/* Hover overlay - Lexica style */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        {/* Top actions */}
        <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Favorite star - only for logged in users */}
          {isLoggedIn && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
              className={`p-1.5 rounded-full transition-colors ${
                isFavorited 
                  ? 'bg-yellow-500/80 text-white hover:bg-yellow-500' 
                  : 'bg-black/60 hover:bg-black/80 text-white/80 hover:text-white'
              }`}
            >
              <svg className="w-4 h-4" fill={isFavorited ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onDownload(); }}
            className="p-1.5 bg-black/60 hover:bg-black/80 rounded-full text-white/80 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
        </div>
        
        {/* Bottom prompt */}
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <p className="text-white text-sm leading-snug line-clamp-2">{item.prompt}</p>
        </div>
      </div>
      
      {/* NSFW badge */}
      {item.isNsfw && (
        <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-red-600 text-white text-xs font-medium rounded">
          NSFW
        </div>
      )}
    </div>
  );
}
