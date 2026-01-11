"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { fetchGallery, fetchGalleryMedia, deleteGalleryItem, GalleryItem } from "@/lib/api";
import { ImageModal } from "@/components/image-modal";
import { Header } from "@/components/header";
import { MediaCard } from "@/components/media-card";
import { useWalletAddress } from "@/lib/hooks/use-wallet-address";
import { downloadMedia, getMediaFilename } from "@/lib/utils/download";

const PAGE_SIZE = 25;

interface GalleryItemWithMedia extends GalleryItem {
  mediaUrls?: string[];
  mediaSource?: string;
  loading?: boolean;
  mediaError?: string;
}

// Disable SSR for this page since it uses wagmi hooks
export const dynamic = 'force-dynamic';

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
    const filename = getMediaFilename(item.jobId, undefined, item.type === "video");
    downloadMedia(mediaSrc, filename);
  }

  return (
    <main className="flex-1 w-full min-h-screen bg-black">
      <Header />

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
                <MediaCard
                  key={item.jobId}
                  item={item}
                  onDelete={() => handleDelete(item.jobId, item.walletAddress)}
                  isDeleting={deleting === item.jobId}
                  canDelete={
                    mounted && isConnected && address
                      ? !item.walletAddress ||
                        item.walletAddress.toLowerCase() === address.toLowerCase()
                      : false
                  }
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

