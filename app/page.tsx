"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchGallery, fetchJobStatus, GalleryItem } from "@/lib/api";
import { JobStatus } from "@/types/models";

interface GalleryItemWithStatus extends GalleryItem {
  status?: JobStatus;
  loading?: boolean;
}

export default function GalleryPage() {
  const [items, setItems] = useState<GalleryItemWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "image" | "video">("all");

  useEffect(() => {
    loadGallery();
  }, [filter]);

  async function loadGallery() {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetchGallery(filter, 50);
      
      // Initialize with loading state for media
      const itemsWithLoading: GalleryItemWithStatus[] = response.items.map(item => ({
        ...item,
        loading: true,
      }));
      
      setItems(itemsWithLoading);
      setLoading(false);
      
      // Fetch status for each item (limited to avoid rate limits)
      const itemsToFetch = response.items.slice(0, 20);
      
      for (const item of itemsToFetch) {
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
      console.error("Error loading gallery:", err);
      setError(err.message || "Failed to load gallery");
      setLoading(false);
    }
  }

  return (
    <main className="flex-1 w-full px-4 md:px-10 py-8 space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-gradient">
            Gallery
          </h1>
          <p className="text-white/50 text-sm mt-1">
            Browse community creations
          </p>
        </div>
        <Link
          href="/create"
          className="px-6 py-2 rounded-full bg-gradient-to-r from-orange-500 to-yellow-400 text-black font-semibold hover:opacity-90 transition"
        >
          Create
        </Link>
      </header>

      {/* Filters */}
      <div className="flex gap-2">
        {(["all", "image", "video"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-full border transition text-sm ${
              filter === f
                ? "border-white text-white bg-white/10"
                : "border-white/20 text-white/70 hover:text-white"
            }`}
          >
            {f === "all" ? "All" : f === "image" ? "🖼️ Images" : "🎬 Videos"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center text-white/50 py-20">
          <div className="animate-spin w-8 h-8 border-2 border-white/30 border-t-white rounded-full mx-auto mb-4" />
          Loading gallery...
        </div>
      ) : error ? (
        <div className="text-center py-20">
          <div className="panel max-w-md mx-auto space-y-4">
            <div className="text-4xl">⚠️</div>
            <h2 className="text-xl font-semibold text-white">Could not load gallery</h2>
            <p className="text-white/70">{error}</p>
            <button
              onClick={loadGallery}
              className="inline-block px-6 py-2 rounded-full bg-white/10 border border-white/20 text-white hover:bg-white/20 transition"
            >
              Try Again
            </button>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20">
          <div className="panel max-w-md mx-auto space-y-4">
            <div className="text-4xl">🖼️</div>
            <h2 className="text-xl font-semibold text-white">No shared creations yet</h2>
            <p className="text-white/70">
              Be the first! Create something and enable "Share to gallery" to have it appear here.
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
            <GalleryCard key={item.jobId} item={item} />
          ))}
        </div>
      )}
    </main>
  );
}

function GalleryCard({ item }: { item: GalleryItemWithStatus }) {
  const [imageError, setImageError] = useState(false);
  
  const generation = item.status?.generations?.[0];
  const isCompleted = item.status?.status === "completed";
  const mediaSrc = generation?.base64 || generation?.url;
  const isVideo = generation?.kind === "video" || item.type === "video";

  return (
    <div className="panel group hover:scale-[1.02] transition-transform">
      <div className="relative aspect-square rounded-xl overflow-hidden bg-black/40">
        {item.loading ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="animate-spin w-6 h-6 border-2 border-white/30 border-t-white rounded-full" />
          </div>
        ) : !isCompleted || !mediaSrc ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-white/30 p-4">
            <span className="text-3xl mb-2">{isVideo ? "🎬" : "🖼️"}</span>
            <span className="text-xs">Preview loading...</span>
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
          <div className="w-full h-full flex flex-col items-center justify-center text-white/50 p-4">
            <span className="text-2xl mb-2">🖼️</span>
            <span className="text-xs">Image unavailable</span>
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
          {item.type === "video" ? "🎬" : "🖼️"}
        </div>
        
        {item.isNsfw && (
          <div className="absolute top-2 right-2 px-2 py-0.5 bg-red-500/80 text-white text-xs rounded">
            NSFW
          </div>
        )}
      </div>
      <div className="p-4 space-y-2">
        <p className="text-sm text-white/90 line-clamp-2">{item.prompt}</p>
        <div className="flex items-center justify-between text-xs text-white/50">
          <span>{item.modelName}</span>
          <span>{new Date(item.createdAt).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}
