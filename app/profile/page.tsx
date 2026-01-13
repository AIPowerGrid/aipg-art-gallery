"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchGalleryByWallet, fetchGalleryMedia, GalleryItem, getFavorites, publishGalleryItem, removeFavorite } from "@/lib/api";
import { JobStatus } from "@/types/models";
import { ImageModal } from "@/components/image-modal";
import { Header } from "@/components/header";
import { MediaCard } from "@/components/media-card";
import { useWalletAddress } from "@/lib/hooks/use-wallet-address";
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
  const { address, isConnected, mounted } = useWalletAddress();

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
      alert("Please sign in with your wallet first");
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
    } catch (err: any) {
      alert(`Failed to publish: ${err.message}`);
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
    } catch (err: any) {
      alert(`Failed to remove favorite: ${err.message}`);
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
          <div className="animate-spin w-8 h-8 border-2 border-white/30 border-t-zinc-400 rounded-full" />
        </div>
      </main>
    );
  }

  if (!isConnected || !isAuthenticated()) {
    return (
      <main className="flex-1 w-full min-h-screen bg-black">
        <Header />

        <div className="max-w-[1200px] mx-auto px-6 md:px-12 py-12">
          {/* Hero Section */}
          <div className="text-center mb-16">
            <div className="inline-block mb-4 px-4 py-1.5 bg-gradient-to-r from-indigo-600/20 via-purple-600/20 to-pink-600/20 border border-indigo-500/30 rounded-full">
              <span className="text-indigo-300 text-sm font-medium">🎨 Free Beta Access</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
              Unlock the Full Power of AI Creation
            </h1>
            <p className="text-white/60 text-lg max-w-2xl mx-auto mb-8">
              Connect your Base wallet to get unlimited access to cutting-edge AI models and save all your creations across devices.
            </p>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <button
                onClick={() => {
                  // Trigger wallet connect
                  document.querySelector<HTMLButtonElement>('[data-wallet-button]')?.click();
                }}
                className="px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-indigo-500/30"
              >
                Connect Wallet - It's Free!
              </button>
              <Link
                href="/create"
                className="px-8 py-3 bg-white/10 hover:bg-white/20 text-white font-medium rounded-xl transition-all border border-white/20"
              >
                Try as Guest (5 Free)
              </Link>
            </div>
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-2 gap-6 mb-12">
            {/* Active Model */}
            <div className="bg-gradient-to-br from-green-600/10 to-emerald-600/10 border border-green-500/30 rounded-2xl p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-semibold text-lg mb-2">Flux 1.1 Pro Image Generation</h3>
                  <p className="text-white/70 text-sm mb-3">
                    State-of-the-art image generation with incredible detail and prompt accuracy
                  </p>
                  <span className="inline-block px-3 py-1 bg-green-500/20 text-green-300 text-xs font-medium rounded-full">
                    ✓ Available Now
                  </span>
                </div>
              </div>
            </div>

            {/* Coming Soon: Batch */}
            <div className="bg-gradient-to-br from-blue-600/10 to-cyan-600/10 border border-blue-500/30 rounded-2xl p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-semibold text-lg mb-2">Batch Image Generation</h3>
                  <p className="text-white/70 text-sm mb-3">
                    Generate multiple variations at once to explore different creative directions
                  </p>
                  <span className="inline-block px-3 py-1 bg-blue-500/20 text-blue-300 text-xs font-medium rounded-full">
                    Coming Soon
                  </span>
                </div>
              </div>
            </div>

            {/* Qwen Image */}
            <div className="bg-gradient-to-br from-purple-600/10 to-pink-600/10 border border-purple-500/30 rounded-2xl p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-semibold text-lg mb-2">Qwen Image Model</h3>
                  <p className="text-white/70 text-sm mb-3">
                    Advanced AI model optimized for photorealistic and artistic image creation
                  </p>
                  <span className="inline-block px-3 py-1 bg-purple-500/20 text-purple-300 text-xs font-medium rounded-full">
                    Coming Soon
                  </span>
                </div>
              </div>
            </div>

            {/* Flux 2.dev */}
            <div className="bg-gradient-to-br from-amber-600/10 to-orange-600/10 border border-amber-500/30 rounded-2xl p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-semibold text-lg mb-2">Flux 2.dev Image Generation</h3>
                  <p className="text-white/70 text-sm mb-3">
                    Next-generation Flux model with enhanced creative capabilities
                  </p>
                  <span className="inline-block px-3 py-1 bg-amber-500/20 text-amber-300 text-xs font-medium rounded-full">
                    Coming Soon
                  </span>
                </div>
              </div>
            </div>

            {/* Wan 2.2 Video */}
            <div className="bg-gradient-to-br from-red-600/10 to-rose-600/10 border border-red-500/30 rounded-2xl p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-semibold text-lg mb-2">Wan 2.2 Video Generation</h3>
                  <p className="text-white/70 text-sm mb-3">
                    Create stunning AI-generated videos from text prompts
                  </p>
                  <span className="inline-block px-3 py-1 bg-red-500/20 text-red-300 text-xs font-medium rounded-full">
                    Coming Soon
                  </span>
                </div>
              </div>
            </div>

            {/* LTX2 Video */}
            <div className="bg-gradient-to-br from-teal-600/10 to-cyan-600/10 border border-teal-500/30 rounded-2xl p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-teal-500/20 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-semibold text-lg mb-2">LTX2 Video Generation</h3>
                  <p className="text-white/70 text-sm mb-3">
                    High-quality video synthesis with advanced motion control
                  </p>
                  <span className="inline-block px-3 py-1 bg-teal-500/20 text-teal-300 text-xs font-medium rounded-full">
                    Coming Soon
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Benefits Section */}
          <div className="bg-gradient-to-br from-zinc-800/50 to-zinc-900/50 border border-zinc-700 rounded-2xl p-8 mb-12">
            <h2 className="text-2xl font-bold text-white mb-6 text-center">Why Connect Your Wallet?</h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="w-12 h-12 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                  </svg>
                </div>
                <h3 className="text-white font-semibold mb-2">Unlimited Generations</h3>
                <p className="text-white/60 text-sm">No more limits - create as much as you want</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                  </svg>
                </div>
                <h3 className="text-white font-semibold mb-2">Save Your Work</h3>
                <p className="text-white/60 text-sm">All creations stored safely in your profile</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-pink-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-white font-semibold mb-2">Video Generation</h3>
                <p className="text-white/60 text-sm">Access to video models (coming soon)</p>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="text-center">
            <p className="text-white/50 text-sm mb-4">
              🚀 Join our beta and be among the first to access new features
            </p>
            <button
              onClick={() => {
                document.querySelector<HTMLButtonElement>('[data-wallet-button]')?.click();
              }}
              className="px-10 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-lg font-semibold rounded-xl transition-all shadow-xl shadow-indigo-500/30"
            >
              Get Free Beta Access Now
            </button>
          </div>
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

