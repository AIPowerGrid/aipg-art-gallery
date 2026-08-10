"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import Masonry from "react-masonry-css";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import { fetchGallery, deleteGalleryItem, GalleryItem, addFavorite, removeFavorite, getFavorites, GalleryFilters } from "@/lib/api";
import { GalleryFilter } from "@/components/gallery-filter";
import { ImageModal } from "@/components/image-modal";
import { Header } from "@/components/header";
import { useWalletAddress } from "@/lib/hooks/use-wallet-address";
import { downloadMedia, getMediaFilename } from "@/lib/utils/download";
import { isAuthenticated } from "@/lib/auth";
import { useAuthStore } from "@/lib/stores/auth-store";

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
  // Unified session state — true for any login type (wallet or Google).
  const loggedIn = useAuthStore((s) => s.isAuthenticated);
  const sessionChecked = useAuthStore((s) => s.sessionChecked);
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<GalleryFilters>({});
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
      const response = await fetchGallery(undefined, INITIAL_PAGE_SIZE, 0, debouncedSearch || undefined, filters);
      const validItems = response.items.filter(item => 
        item.mediaUrls && item.mediaUrls.length > 0 && item.mediaUrls[0]
      );
      setItems(validItems);
      setHasMore(response.hasMore);
      setNextOffset(response.nextOffset);
      setLoading(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load gallery";
      setError(message);
      setLoading(false);
    }
  }, [filters, debouncedSearch]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    
    try {
      const response = await fetchGallery(undefined, PAGE_SIZE, nextOffset, debouncedSearch || undefined, filters);
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
  }, [filters, nextOffset, hasMore, loadingMore, debouncedSearch]);

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
      toast.warning("Please connect your wallet to delete items");
      return;
    }
    if (!isAuthenticated()) {
      toast.warning("Please sign in with your wallet first");
      return;
    }
    if (itemWallet && itemWallet.toLowerCase() !== address.toLowerCase()) {
      toast.warning("You can only delete your own gallery items");
      return;
    }
    const ok = await confirmDialog({
      title: "Delete this item?",
      message: "It will be removed from the gallery permanently.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    
    setDeleting(jobId);
    try {
      await deleteGalleryItem(jobId);
      setItems(prev => prev.filter(i => i.jobId !== jobId));
      if (selectedItem?.jobId === jobId) setSelectedItem(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to delete: ${message}`);
    } finally {
      setDeleting(null);
    }
  }

  function handleDownload(item: GalleryItem) {
    const mediaSrc = item.mediaUrls?.[0];
    if (!mediaSrc) return;
    downloadMedia(mediaSrc, getMediaFilename(item.jobId, undefined, item.type === "video"));
  }

  // Seed favorite stars from the server so they reflect reality on load (works
  // for any login type). Clear them when signed out.
  useEffect(() => {
    if (!sessionChecked) return;
    if (!loggedIn) {
      setFavorites(new Set());
      return;
    }
    let cancelled = false;
    getFavorites(200)
      .then((res) => {
        if (!cancelled) setFavorites(new Set(res.items.map((i) => i.jobId)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [loggedIn, sessionChecked]);

  async function handleToggleFavorite(jobId: string) {
    if (!loggedIn) return;

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
        await removeFavorite(jobId);
      } else {
        await addFavorite(jobId);
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
    <main className="min-h-screen">
      <Header />

      {/* Search + filter — one connected control, centered */}
      <div className="w-full px-4 md:px-7 pt-3 sm:pt-5 pb-4">
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <div className="group flex flex-1 items-center gap-2 rounded-xl border border-border bg-card/70 px-3.5 transition-colors focus-within:border-primary/60 focus-within:shadow-[0_0_0_3px_hsl(var(--ring)/0.15)]">
            <svg className="h-[18px] w-[18px] shrink-0 text-tertiary transition-colors group-focus-within:text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search the gallery"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border-0 bg-transparent py-2.5 text-sm text-foreground placeholder:text-tertiary focus:outline-none focus:ring-0"
              style={{ borderRadius: 0 }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="rounded-md p-1 text-tertiary transition-colors hover:bg-white/5 hover:text-foreground"
                aria-label="Clear search"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <GalleryFilter filters={filters} onFiltersChange={setFilters} />
        </div>
      </div>

      {/* Gallery content */}
      {loading ? (
        <div className="flex items-center justify-center py-32">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
        </div>
      ) : error ? (
        <div className="py-32 text-center">
          <p className="mb-4 text-muted-foreground">{error}</p>
          <button onClick={loadGallery} className="btn btn-secondary">
            Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="py-32 text-center">
          <p className="mb-4 text-muted-foreground">
            {filters.type === "video" ? "No videos found" : filters.type === "image" ? "No images found" : "No results found"}
          </p>
          <Link href="/create" className="btn btn-primary">
            Create something new
          </Link>
        </div>
      ) : (
        <>
          {/* Masonry grid with real gutters */}
          <div className="px-4 md:px-7 pb-8">
            <Masonry
              breakpointCols={MASONRY_BREAKPOINTS}
              className="masonry-grid flex w-auto -ml-3"
              columnClassName="pl-3 bg-clip-padding"
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
                    isLoggedIn={loggedIn}
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
      className="group relative mb-3 cursor-pointer overflow-hidden rounded-xl border border-border/60 bg-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-edge hover:shadow-[0_16px_40px_-16px_rgba(0,0,0,0.7)]"
      style={{ transitionTimingFunction: "var(--ease)" }}
      onClick={onSelect}
    >
      {/* Loading placeholder */}
      {!loaded && !isVideo && (
        <div
          className="w-full bg-secondary animate-pulse"
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
      
      {/* Hover overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ transitionTimingFunction: "var(--ease)" }}>
        {/* Top actions */}
        <div className="absolute top-2 right-2 flex gap-1.5 translate-y-1 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
          {/* Favorite star - only for logged in users */}
          {isLoggedIn && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
              className={`rounded-full p-1.5 backdrop-blur-sm transition-colors ${
                isFavorited
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-black/60 text-white/80 hover:bg-black/80 hover:text-white'
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
        
        {/* Bottom metadata */}
        <div className="absolute bottom-0 left-0 right-0 translate-y-1 p-3 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
          <p className="mb-1.5 line-clamp-2 text-sm leading-snug text-white">{item.prompt}</p>
          {item.modelName && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-white/70">
              <span className="h-1 w-1 rounded-full bg-primary" />
              {item.modelName}
            </span>
          )}
        </div>
      </div>

      {/* NSFW badge */}
      {item.isNsfw && (
        <div className="badge badge-mature absolute left-2 top-2">
          Mature
        </div>
      )}
    </div>
  );
}
