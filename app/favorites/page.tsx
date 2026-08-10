"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import Masonry from "react-masonry-css";
import { getFavorites, removeFavorite, GalleryItem } from "@/lib/api";
import { ImageModal } from "@/components/image-modal";
import { Header } from "@/components/header";
import { MediaCard } from "@/components/media-card";
import { downloadMedia, getMediaFilename } from "@/lib/utils/download";
import { useAuthStore } from "@/lib/stores/auth-store";

// Masonry breakpoints - matches main gallery
const MASONRY_BREAKPOINTS = {
  default: 5,
  1400: 4,
  1100: 3,
  768: 2,
};

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
  // Session is the source of truth for any login type (wallet or Google).
  const { isAuthenticated, sessionChecked } = useAuthStore();

  useEffect(() => {
    setMounted(true);
  }, []);

  const filteredFavorites = favorites.filter(item =>
    !searchQuery || item.prompt?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    if (!sessionChecked) return;
    if (isAuthenticated) {
      loadFavorites();
    } else {
      setFavorites([]);
      setLoading(false);
    }
  }, [sessionChecked, isAuthenticated]);

  async function loadFavorites() {
    setLoading(true);
    try {
      const response = await getFavorites(100);
      setFavorites(response.items.map(item => ({ ...item, loading: false })));
    } catch (err) {
      console.error("Failed to load favorites:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleRemoveFavorite(jobId: string) {
    if (!isAuthenticated) return;
    const ok = await confirmDialog({
      title: 'Remove from favorites?',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    
    try {
      await removeFavorite(jobId);
      setFavorites(prev => prev.filter(item => item.jobId !== jobId));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to remove favorite: ${message}`);
    }
  }

  function handleDownload(item: FavoriteItem) {
    const mediaSrc = item.mediaUrls?.[0];
    if (!mediaSrc) return;
    const filename = getMediaFilename(item.jobId, undefined, item.type === "video");
    downloadMedia(mediaSrc, filename);
  }

  // Redirect unauthenticated users to join page (only after the session check).
  useEffect(() => {
    if (mounted && sessionChecked && !isAuthenticated) {
      router.push('/join');
    }
  }, [mounted, sessionChecked, isAuthenticated, router]);

  if (!mounted || !sessionChecked || !isAuthenticated) {
    return (
      <main className="flex-1 w-full min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-2 border-border border-t-primary rounded-full" />
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 w-full min-h-screen bg-background">
      <Header />

      {/* Search bar */}
      <div className="w-full px-4 md:px-7 pt-2 sm:pt-4 pb-2">
        <div className="max-w-xl mx-auto">
          <div className="relative">
            <div className="flex items-center bg-card border border-border rounded-full overflow-hidden focus-within:border-[#555] transition-colors">
              <svg className="w-5 h-5 ml-4 text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                  className="mr-1 p-1.5 rounded-full hover:bg-[#333] text-tertiary hover:text-white transition-colors"
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
          <div className="text-center text-tertiary py-20">
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
              <p className="text-muted-foreground">
                Browse the gallery and click the star icon to save images you love.
              </p>
              <Link
                href="/"
                className="btn btn-primary"
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
            
            <Masonry
              breakpointCols={MASONRY_BREAKPOINTS}
              className="masonry-grid flex w-auto -ml-0.5"
              columnClassName="pl-0.5 bg-clip-padding"
            >
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
            </Masonry>

            {/* No search results */}
            {searchQuery && filteredFavorites.length === 0 && (
              <div className="text-center py-20">
                <p className="text-tertiary">No favorites found matching "{searchQuery}"</p>
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
