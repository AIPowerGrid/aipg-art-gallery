"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import Link from "next/link";
import { fetchGalleryByWallet, fetchJobStatus, GalleryItem } from "@/lib/api";
import { JobStatus } from "@/types/models";

interface ItemWithStatus extends GalleryItem {
  status?: JobStatus;
  loading?: boolean;
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
      
      // Fetch status for each item
      for (const item of response.items.slice(0, 20)) {
        try {
          const status = await fetchJobStatus(item.jobId);
          setItems(prev => prev.map(i => 
            i.jobId === item.jobId 
              ? { ...i, status, loading: false }
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
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {items.map((item) => (
            <CreationCard key={item.jobId} item={item} />
          ))}
        </div>
      )}
    </main>
  );
}

function CreationCard({ item }: { item: ItemWithStatus }) {
  const [imageError, setImageError] = useState(false);
  
  const generation = item.status?.generations?.[0];
  const isCompleted = item.status?.status === "completed";
  const isFaulted = item.status?.status === "faulted";
  const mediaSrc = generation?.base64 || generation?.url;
  const isVideo = generation?.kind === "video" || item.type === "video";

  return (
    <div className="panel group">
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
      </div>
      
      <div className="p-4 space-y-3">
        <p className="text-sm text-white/90 line-clamp-2">{item.prompt}</p>
        <div className="flex items-center justify-between text-xs text-white/50">
          <span>{item.modelName}</span>
          <span>{new Date(item.createdAt).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}
