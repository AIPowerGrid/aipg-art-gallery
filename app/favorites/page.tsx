"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { getFavorites, removeFavorite, GalleryItem } from "@/lib/api";
import { ImageModal } from "@/components/image-modal";
import { Header } from "@/components/header";
import { MediaCard } from "@/components/media-card";
import { downloadMedia, getMediaFilename } from "@/lib/utils/download";
import { isAuthenticated } from "@/lib/auth";

interface FavoriteItem extends GalleryItem {
  loading?: boolean;
}

export const dynamic = 'force-dynamic';

export default function FavoritesPage() {
  const router = useRouter();
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<FavoriteItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [mounted, setMounted] = useState(false);
  const { address, isConnected } = useAccount();
  
  useEffect(() => {
    setMounted(true);
  }, []);

  const filteredFavorites = favorites.filter(item => 
    !searchQuery || item.prompt?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    if (isConnected && address && isAuthenticated()) {
      loadFavorites(address);
    } else {
      setFavorites([]);
      setLoading(false);
    }
  }, [address, isConnected]);

  async function loadFavorites(walletAddress: string) {
    setLoading(true);
    try {
      const response = await getFavorites(walletAddress, 100);
      setFavorites(response.items.map(item => ({ ...item, loading: false })));
    } catch (err) {
      console.error("Failed to load favorites:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleRemoveFavorite(jobId: string) {
    if (!address || !isAuthenticated()) return;
    if (!confirm('Remove from favorites?')) return;
    
    try {
      await removeFavorite(jobId);
      setFavorites(prev => prev.filter(item => item.jobId !== jobId));
    } catch (err: any) {
      alert(`Failed to remove favorite: ${err.message}`);
    }
  }

  function handleDownload(item: FavoriteItem) {
    const mediaSrc = item.mediaUrls?.[0];
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

  if (!mounted || !isConnected || !isAuthenticated()) {
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

      {/* Search bar */}
      <div className="w-full px-4 md:px-7 pt-2 sm:pt-4 pb-2">
        <div className="max-w-xl mx-auto">
          <div className="relative">
            <div className="flex items-center bg-[#1a1a1a] border border-[#333] rounded-full overflow-hidden focus-within:border-[#555] transition-colors">
              <svg className="w-5 h-5 ml-4 text-[#666]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search favorites"
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
            Loading your favorites...
          </div>
        ) : favorites.length === 0 ? (
          <div className="text-center py-40">
            <div className="max-w-md mx-auto space-y-4">
              <svg className="w-16 h-16 text-yellow-500/50 mx-auto" fill="currentColor" viewBox="0 0 24 24">
                <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
              <h2 className="text-xl font-semibold text-white">No favorites yet</h2>
              <p className="text-white/70">
                Browse the gallery and click the star icon to save images you love.
              </p>
              <Link
                href="/"
                className="inline-block px-6 py-2 rounded-xl bg-gradient-to-r from-zinc-600 to-zinc-500 text-white font-semibold hover:opacity-90 transition"
              >
                Explore Gallery
              </Link>
            </div>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
              Your Favorites ({favorites.length})
            </h2>
            
            <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-0">
              {filteredFavorites.map((item) => (
                <MediaCard
                  key={item.jobId}
                  item={item}
                  onSelect={() => setSelectedItem(item)}
                  onDownload={() => handleDownload(item)}
                  onToggleFavorite={() => handleRemoveFavorite(item.jobId)}
                  isFavorited={true}
                  isLoggedIn={true}
                />
              ))}
            </div>

            {/* No search results */}
            {searchQuery && filteredFavorites.length === 0 && (
              <div className="text-center py-20">
                <p className="text-white/50">No favorites found matching "{searchQuery}"</p>
              </div>
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
          </>
        )}
      </div>
    </main>
  );
}
