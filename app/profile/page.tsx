"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { toast } from "sonner";
import { fetchGalleryByWallet, fetchGalleryMedia, GalleryItem, getFavorites, publishGalleryItem, removeFavorite } from "@/lib/api";
import { JobStatus } from "@/types/models";
import { ImageModal } from "@/components/image-modal";
import { Header } from "@/components/header";
import { MediaCard } from "@/components/media-card";
import { downloadMedia, getMediaFilename } from "@/lib/utils/download";
import { isAuthenticated } from "@/lib/auth";

interface ItemWithStatus extends GalleryItem {
  status?: JobStatus;
  loading?: boolean;
  mediaUrls?: string[];
  mediaError?: string;
}

// Disable SSR for this page since it uses wagmi hooks
export const dynamic = 'force-dynamic';

export default function ProfilePage() {
  const router = useRouter();
  const [items, setItems] = useState<ItemWithStatus[]>([]);
  const [favorites, setFavorites] = useState<ItemWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingFavorites, setLoadingFavorites] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ItemWithStatus | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [showPublishConfirm, setShowPublishConfirm] = useState<string | null>(null);
  const [showUnfavoriteConfirm, setShowUnfavoriteConfirm] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [mounted, setMounted] = useState(false);
  const { address, isConnected } = useAccount();
  
  useEffect(() => {
    setMounted(true);
  }, []);

  // Filter items based on search query
  const filteredItems = items.filter(item => 
    !searchQuery || item.prompt?.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredFavorites = favorites.filter(item => 
    !searchQuery || item.prompt?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    if (isConnected && address && isAuthenticated()) {
      loadCreations(address);
      loadFavorites(address);
    } else {
      // Clear items when not authenticated
      setItems([]);
      setFavorites([]);
      setLoading(false);
      setLoadingFavorites(false);
    }
  }, [address, isConnected]);

  async function loadFavorites(walletAddress: string) {
    setLoadingFavorites(true);
    try {
      const response = await getFavorites(walletAddress, 50);
      setFavorites(response.items.map(item => ({ ...item, loading: false })));
    } catch (err) {
      console.error("Failed to load favorites:", err);
    } finally {
      setLoadingFavorites(false);
    }
  }

  async function handlePublish(jobId: string) {
    if (!address || !isAuthenticated()) {
      toast.warning("Please sign in with your wallet first");
      return;
    }
    setPublishingId(jobId);
    setShowPublishConfirm(null);
    
    try {
      await publishGalleryItem(jobId);
      // Update item in state
      setItems(prev => prev.map(item => 
        item.jobId === jobId ? { ...item, isPublic: true } : item
      ));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to publish: ${message}`);
    } finally {
      setPublishingId(null);
    }
  }

  function showRemoveFavoriteConfirm(jobId: string) {
    setShowUnfavoriteConfirm(jobId);
  }

  async function handleRemoveFavorite(jobId: string) {
    if (!address || !isAuthenticated()) return;
    setShowUnfavoriteConfirm(null);
    
    try {
      await removeFavorite(jobId);
      // Remove from favorites list
      setFavorites(prev => prev.filter(item => item.jobId !== jobId));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to remove favorite: ${message}`);
    }
  }

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
              const media = await fetchGalleryMedia(item.jobId).catch(() => {
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load your creations";
      setError(message);
      setLoading(false);
    }
  }

  function handleDownload(item: ItemWithStatus) {
    const mediaSrc = item.mediaUrls?.[0] || item.status?.generations?.[0]?.base64 || item.status?.generations?.[0]?.url;
    if (!mediaSrc) return;
    const filename = getMediaFilename(item.jobId, undefined, item.type === "video");
    downloadMedia(mediaSrc, filename);
  }

  // Redirect unauthenticated users to join page
  useEffect(() => {
    if (mounted && (!isConnected || !isAuthenticated())) {
      router.push('/join');
    }
  }, [mounted, isConnected, router]);

  if (!mounted) {
    return (
      <main className="flex-1 w-full min-h-screen bg-black">
        <Header />
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-2 border-white/30 border-t-zinc-400 rounded-full" />
        </div>
      </main>
    );
  }

  if (!isConnected || !isAuthenticated()) {
    return (
      <main className="flex-1 w-full min-h-screen bg-black">
        <Header />
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-2 border-white/30 border-t-zinc-400 rounded-full" />
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 w-full min-h-screen bg-black">
      <Header />

      {/* Search bar - matches main gallery */}
      <div className="w-full px-4 md:px-7 pt-2 sm:pt-4 pb-2">
        <div className="max-w-xl mx-auto">
          <div className="relative">
            <div className="flex items-center bg-[#1a1a1a] border border-[#333] rounded-full overflow-hidden focus-within:border-[#555] transition-colors">
              <svg className="w-5 h-5 ml-4 text-[#666]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search my images"
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
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1920px] mx-auto px-6 md:px-12 py-4">
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
                className="inline-block px-6 py-2 rounded-xl bg-white/10 border border-white/20 text-white hover:bg-white/20 transition"
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
                className="inline-block px-6 py-2 rounded-xl bg-gradient-to-r from-zinc-600 to-zinc-500 text-white font-semibold hover:opacity-90 transition"
              >
                Start Creating
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Gallery grid - lexica style masonry layout */}
            {filteredItems.length > 0 && (
            <div className="max-w-[1920px] mx-auto px-6 md:px-12 pb-12">
                <h2 className="text-xl font-semibold text-white mb-4">My Creations</h2>
              <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-0">
                  {filteredItems.map((item) => (
                <MediaCard
                  key={item.jobId}
                  item={item}
                  onSelect={() => setSelectedItem(item)}
                  onDownload={() => handleDownload(item)}
                      onPublish={() => handlePublish(item.jobId)}
                      showPublishButton={true}
                      isPublishing={publishingId === item.jobId}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Favorites section */}
            {!loadingFavorites && filteredFavorites.length > 0 && (
              <div className="max-w-[1920px] mx-auto px-6 md:px-12 pb-12">
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                  Favorites
                </h2>
                <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-0">
                  {filteredFavorites.map((item) => (
                    <MediaCard
                      key={`fav-${item.jobId}`}
                      item={item}
                      onSelect={() => setSelectedItem(item)}
                      onDownload={() => handleDownload(item)}
                      onToggleFavorite={() => showRemoveFavoriteConfirm(item.jobId)}
                      isFavorited={true}
                      isLoggedIn={true}
                />
              ))}
            </div>
          </div>
            )}

            {/* No results message */}
            {searchQuery && filteredItems.length === 0 && filteredFavorites.length === 0 && (
              <div className="text-center py-20">
                <p className="text-white/50">No images found matching "{searchQuery}"</p>
              </div>
            )}

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

      {/* Unfavorite confirmation modal */}
      {showUnfavoriteConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 rounded-xl p-6 max-w-sm w-full border border-zinc-700">
            <h3 className="text-white text-lg font-semibold mb-3">Remove from Favorites?</h3>
            <p className="text-white/70 text-sm mb-6">
              This image will be removed from your favorites.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowUnfavoriteConfirm(null)}
                className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white text-sm rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRemoveFavorite(showUnfavoriteConfirm)}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm rounded-lg transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

