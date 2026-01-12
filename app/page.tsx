"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import Masonry from "react-masonry-css";
import { fetchGallery, deleteGalleryItem, GalleryItem } from "@/lib/api";
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
  
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const loadGallery = useCallback(async () => {
    setLoading(true);
    setError(null);
    setItems([]);
    setNextOffset(0);
    setHasMore(true);
    
    try {
      const response = await fetchGallery(filter, INITIAL_PAGE_SIZE, 0);
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
  }, [filter]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    
    try {
      const response = await fetchGallery(filter, PAGE_SIZE, nextOffset);
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
  }, [filter, nextOffset, hasMore, loadingMore]);

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

  const canDelete = (item: GalleryItem) => 
    mounted && isConnected && address && 
    (!item.walletAddress || item.walletAddress.toLowerCase() === address.toLowerCase());

  return (
    <main className="min-h-screen bg-[#0a0a0a]">
      <Header />

      {/* Search header - Lexica style */}
      <div className="w-full px-4 md:px-7 pt-6 sm:pt-10 pb-4 sm:pb-6">
        <div className="max-w-xl mx-auto">
          {/* Search box */}
          <div className="relative mb-4">
            <div className="flex items-center bg-[#1a1a1a] border border-[#333] rounded-2xl overflow-hidden focus-within:border-[#555] transition-colors">
              <svg className="w-5 h-5 ml-4 text-[#666]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search for an image"
                className="w-full px-4 py-3 bg-transparent text-white placeholder-[#666] focus:outline-none"
                disabled
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 justify-center">
            <button className="px-8 py-2 rounded-full bg-[#1a1a1a] border border-[#333] text-white/70 text-sm font-medium hover:bg-[#222] hover:text-white transition-colors" disabled>
              Search
            </button>
            <Link href="/create" className="px-8 py-2 rounded-full bg-[#2a2a2a] border border-[#444] text-white/80 text-sm font-medium hover:bg-[#333] hover:text-white transition-colors">
              Generate
            </Link>
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
                    canDelete={!!canDelete(item)}
                    isDeleting={deleting === item.jobId}
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
  canDelete,
  isDeleting,
}: {
  item: GalleryItem;
  index: number;
  thumbnailUrl: string;
  onSelect: () => void;
  onDelete: () => void;
  onDownload: () => void;
  canDelete: boolean;
  isDeleting: boolean;
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
      )}      {/* Hover overlay - Lexica style */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        {/* Top actions */}
        <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onDownload(); }}
            className="p-1.5 bg-black/60 hover:bg-black/80 rounded-full text-white/80 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
          {canDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              disabled={isDeleting}
              className="p-1.5 bg-red-600/80 hover:bg-red-600 rounded-full text-white transition-colors disabled:opacity-50"
            >
              {isDeleting ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              )}
            </button>
          )}
        </div>        {/* Bottom prompt */}
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <p className="text-white text-sm leading-snug line-clamp-2">{item.prompt}</p>
        </div>
      </div>      {/* NSFW badge */}
      {item.isNsfw && (
        <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-red-600 text-white text-xs font-medium rounded">
          NSFW
        </div>
      )}
    </div>
  );
}
