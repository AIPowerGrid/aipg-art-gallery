"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchGalleryByWallet, fetchGalleryMedia, GalleryItem } from "@/lib/api";
import { JobStatus } from "@/types/models";
import { ImageModal } from "@/components/image-modal";
import { Header } from "@/components/header";
import { MediaCard } from "@/components/media-card";
import { useWalletAddress } from "@/lib/hooks/use-wallet-address";
import { downloadMedia, getMediaFilename } from "@/lib/utils/download";

interface ItemWithStatus extends GalleryItem {
  status?: JobStatus;
  loading?: boolean;
  mediaUrls?: string[];
  mediaError?: string;
}

// Disable SSR for this page since it uses wagmi hooks
export const dynamic = 'force-dynamic';

export default function ProfilePage() {
  const [items, setItems] = useState<ItemWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ItemWithStatus | null>(null);
  const { address, isConnected, mounted } = useWalletAddress();

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
    } catch (err: any) {
      setError(err.message || "Failed to load your creations");
      setLoading(false);
    }
  }

  function handleDownload(item: ItemWithStatus) {
    const mediaSrc = item.mediaUrls?.[0] || item.status?.generations?.[0]?.base64 || item.status?.generations?.[0]?.url;
    if (!mediaSrc) return;
    const filename = getMediaFilename(item.jobId, undefined, item.type === "video");
    downloadMedia(mediaSrc, filename);
  }

  if (!mounted) {
    return (
      <main className="flex-1 w-full min-h-screen bg-black">
        <Header />
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-2 border-white/30 border-t-orange-500 rounded-full" />
        </div>
      </main>
    );
  }

  if (!isConnected) {
    return (
      <main className="flex-1 w-full min-h-screen bg-black">
        <Header />

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
      <Header />

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
                <MediaCard
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

