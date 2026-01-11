"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import Link from "next/link";
import { fetchGalleryByWallet, fetchJobStatus, fetchGalleryMedia, GalleryItem } from "@/lib/api";
import { JobStatus } from "@/types/models";
import { ImageModal } from "@/components/image-modal";

interface ItemWithStatus extends GalleryItem {
  status?: JobStatus;
  loading?: boolean;
  mediaUrls?: string[];
  mediaError?: string;
}

// Wrapper component to ensure we only use wagmi after mounting
export default function ProfilePage() {
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);
  
  if (!mounted) {
    return (
      <main className="flex-1 w-full px-4 md:px-10 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-2 border-white/30 border-t-orange-500 rounded-full" />
        </div>
      </main>
    );
  }
  
  return <ProfilePageClient />;
}

function ProfilePageClient() {
  const [items, setItems] = useState<ItemWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ItemWithStatus | null>(null);
  const { address, isConnected } = useAccount();

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
      
      // Fetch status and media for each item
      for (const item of response.items.slice(0, 20)) {
        try {
          // Fetch job status
          const status = await fetchJobStatus(item.jobId);
          
          // Fetch media URLs
          const media = await fetchGalleryMedia(item.jobId);
          
          setItems(prev => prev.map(i => 
            i.jobId === item.jobId 
              ? { ...i, status, mediaUrls: media.mediaUrls, mediaError: media.error, loading: false }
              : i
          ));
        } catch {
          setItems(prev => prev.map(i => 
            i.jobId === item.jobId 
              ? { ...i, loading: false }
              : i
          ));
        }
      }
    } catch (err: any) {
      console.error("Error loading creations:", err);
      setError(err.message || "Failed to load your creations");
      setLoading(false);
    }
  }

  function handleDownload(item: ItemWithStatus) {
    const generation = item.status?.generations?.[0];
    const mediaSrc = generation?.base64 || generation?.url;
    if (!mediaSrc) return;
    
    const isVideo = generation?.kind === "video" || item.type === "video";
    const filename = `${item.jobId}.${isVideo ? "mp4" : "png"}`;
    
    try {
      // For base64 data, create a blob directly
      if (mediaSrc.startsWith("data:")) {
        const link = document.createElement("a");
        link.href = mediaSrc;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }
      
      // For URLs, fetch and download
      fetch(mediaSrc)
        .then(response => response.blob())
        .then(blob => {
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
        })
        .catch(err => {
          console.error("Download failed:", err);
          // Fallback: open in new tab
          window.open(mediaSrc, "_blank");
        });
    } catch (err) {
      console.error("Download failed:", err);
      window.open(mediaSrc, "_blank");
    }
  }

  // Not connected
  if (!isConnected) {
    return (
      <main className="flex-1 w-full px-4 md:px-10 py-8 space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-gradient">
              My Creations
            </h1>
            <p className="text-white/50 text-sm mt-1">
              Connect your wallet to view your creations
            </p>
          </div>
        </header>

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
              className="inline-block px-6 py-2 rounded-full bg-gradient-to-r from-orange-500 to-yellow-400 text-black font-semibold hover:opacity-90 transition"
            >
              Start Creating
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 w-full px-4 md:px-10 py-8 space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-gradient">
            My Creations
          </h1>
          <p className="text-white/50 text-sm mt-1 font-mono">
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </p>
        </div>
      </header>

      {/* Info panel */}
      <div className="panel bg-white/5 border-white/10">
        <div className="flex items-start gap-4 text-sm">
          <span className="text-xl">💡</span>
          <div className="space-y-1 text-white/70">
            <p>These are creations linked to your wallet address. They're accessible from any device when you connect the same wallet.</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-white/50 py-20">
          <div className="animate-spin w-8 h-8 border-2 border-white/30 border-t-white rounded-full mx-auto mb-4" />
          Loading your creations...
        </div>
      ) : error ? (
        <div className="text-center py-20">
          <div className="panel max-w-md mx-auto space-y-4">
            <div className="text-4xl">⚠️</div>
            <h2 className="text-xl font-semibold text-white">Error</h2>
            <p className="text-white/70">{error}</p>
            <button
              onClick={() => address && loadCreations(address)}
              className="inline-block px-6 py-2 rounded-full bg-white/10 border border-white/20 text-white hover:bg-white/20 transition"
            >
              Try Again
            </button>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20">
          <div className="panel max-w-md mx-auto space-y-4">
            <div className="text-4xl">🎨</div>
            <h2 className="text-xl font-semibold text-white">No creations yet</h2>
            <p className="text-white/70">
              When you generate images or videos with your wallet connected, they'll appear here.
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {items.map((item) => (
              <CreationCard 
                key={item.jobId} 
                item={item}
                onSelect={() => setSelectedItem(item)}
                onDownload={() => handleDownload(item)}
              />
            ))}
          </div>

          {/* Image Modal */}
          {selectedItem && (() => {
            const generation = selectedItem.status?.generations?.[0];
            const mediaSrc = generation?.base64 || generation?.url;
            const isVideo = generation?.kind === "video" || selectedItem.type === "video";
            
            if (!mediaSrc) return null;
            
            return (
              <ImageModal
                isOpen={!!selectedItem}
                onClose={() => setSelectedItem(null)}
                mediaSrc={mediaSrc}
                prompt={selectedItem.prompt}
                isVideo={isVideo}
                onDownload={() => handleDownload(selectedItem)}
              />
            );
          })()}
        </>
      )}
    </main>
  );
}

interface CreationCardProps {
  item: ItemWithStatus;
  onSelect: () => void;
  onDownload: () => void;
}

function CreationCard({ item, onSelect, onDownload }: CreationCardProps) {
  const [imageError, setImageError] = useState(false);
  const [showControls, setShowControls] = useState(false);
  
  const generation = item.status?.generations?.[0];
  const isCompleted = item.status?.status === "completed";
  const isFaulted = item.status?.status === "faulted";
  // Use mediaUrls if available, otherwise fall back to generation data
  const mediaSrc = item.mediaUrls?.[0] || generation?.base64 || generation?.url;
  const isVideo = item.type === "video";
  const hasMedia = !!mediaSrc && (isCompleted || (item.mediaUrls?.length ?? 0) > 0) && !isFaulted;

  return (
    <div 
      className="panel group cursor-pointer"
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
      onClick={hasMedia ? onSelect : undefined}
    >
      <div className="relative aspect-square rounded-xl overflow-hidden bg-black/40">
        {item.loading ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="animate-spin w-6 h-6 border-2 border-white/30 border-t-white rounded-full" />
          </div>
        ) : isFaulted ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-red-400/70 p-4 text-center">
            <span className="text-2xl mb-2">❌</span>
            <span className="text-xs">Generation failed</span>
          </div>
        ) : !isCompleted ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-yellow-400/70 p-4 text-center">
            <div className="animate-spin w-6 h-6 border-2 border-yellow-400/30 border-t-yellow-400 rounded-full mb-2" />
            <span className="text-xs">Processing...</span>
          </div>
        ) : !mediaSrc ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-white/30 p-4 text-center">
            <span className="text-2xl mb-2">{isVideo ? "🎬" : "🖼️"}</span>
            <span className="text-xs">Preview unavailable</span>
          </div>
        ) : isVideo ? (
          <video
            src={mediaSrc}
            className="w-full h-full object-cover"
            controls
            muted
            onError={() => setImageError(true)}
          />
        ) : imageError ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-white/50 p-4 text-center">
            <span className="text-2xl mb-2">🖼️</span>
            <span className="text-xs">Image unavailable</span>
            {generation?.url && (
              <a 
                href={generation.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-400 text-xs mt-1 hover:underline"
              >
                Open link
              </a>
            )}
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
          {item.type === "video" ? "🎬 Video" : "🖼️ Image"}
        </div>
        
        {item.isNsfw && (
          <div className="absolute top-2 right-2 px-2 py-0.5 bg-red-500/80 text-white text-xs rounded">
            NSFW
          </div>
        )}

        {/* Download button - visible on hover */}
        {showControls && hasMedia && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDownload();
            }}
            className="absolute bottom-2 right-2 p-2 bg-green-500/80 hover:bg-green-600 text-white rounded-full transition-all opacity-0 group-hover:opacity-100 z-10"
            title="Download"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
        )}
      </div>
      
      <div className="p-4 space-y-3">
        <p className="text-sm text-white/90 line-clamp-2">{item.prompt}</p>
        <div className="flex items-center justify-between text-xs text-white/50">
          <span>{item.modelName}</span>
          <span>{new Date(item.createdAt).toLocaleDateString()}</span>
        </div>
        {item.walletAddress && (
          <div className="text-xs text-white/40 font-mono truncate" title={item.walletAddress}>
            {item.walletAddress.slice(0, 6)}...{item.walletAddress.slice(-4)}
          </div>
        )}
      </div>
    </div>
  );
}
