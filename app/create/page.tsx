"use client";

import { useEffect, useState, useCallback } from "react";
import Masonry from "react-masonry-css";
import { Header } from "@/components/header";
import { createJob, fetchJobStatus, fetchGalleryByWallet, GalleryItem } from "@/lib/api";
import { useAccount } from "wagmi";
import { downloadMedia, getMediaFilename } from "@/lib/utils/download";
import { 
  saveCreation, 
  getStoredCreations, 
  StoredCreation,
  generateTagsFromPrompt 
} from "@/lib/storage";

const MASONRY_BREAKPOINTS = {
  default: 5,
  1536: 4,
  1280: 4,
  1024: 3,
  768: 2,
  640: 2,
};

// Types
interface StylesConfig {
  models: { id: string; name: string; description: string; type: string; enabled: boolean; default: boolean }[];
  dimensions: { id: number; width: number; height: number; label: string; aspectRatio: string }[];
  defaultDimensionId: number;
  defaults: { steps: number; cfgScale: number; sampler: string; scheduler: string };
}

interface JobStatus {
  jobId: string;
  status: string;
  generations: { id: string; url?: string; base64?: string; seed?: string; kind?: string }[];
  queuePosition?: number;
  waitTime?: number;
}

// Cloudflare Image Resizing
function getThumbnailUrl(url: string, width = 300): string {
  if (!url?.includes('images.aipg.art')) return url;
  try {
    const path = new URL(url).pathname;
    return `https://images.aipg.art/cdn-cgi/image/width=${width},quality=80,format=auto${path}`;
  } catch { return url; }
}

export default function CreatePage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  
  if (!mounted) {
    return (
      <main className="min-h-screen bg-zinc-900">
        <Header />
        <div className="flex items-center justify-center h-[60vh]">
          <div className="animate-spin w-8 h-8 border-2 border-white/20 border-t-white rounded-full" />
        </div>
      </main>
    );
  }
  
  return <CreatePageContent />;
}

function CreatePageContent() {
  const { address } = useAccount();
  const [styles, setStyles] = useState<StylesConfig | null>(null);
  const [prompt, setPrompt] = useState("");
  const [dimensionId, setDimensionId] = useState(3); // Default to square
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentJob, setCurrentJob] = useState<{ jobId: string; status: string } | null>(null);
  const [creations, setCreations] = useState<StoredCreation[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Fetch styles config
  useEffect(() => {
    fetch('/api/styles')
      .then(res => res.json())
      .then(data => {
        setStyles(data);
        setDimensionId(data.defaultDimensionId ?? 3);
      })
      .catch(() => setError('Failed to load configuration'));
  }, []);

  // Load creations from server (if wallet) + localStorage
  useEffect(() => {
    async function loadCreations() {
      const localCreations = getStoredCreations();
      
      if (address) {
        try {
          const serverData = await fetchGalleryByWallet(address, 50);
          const serverCreations: StoredCreation[] = serverData.items.map((item: GalleryItem) => ({
            jobId: item.jobId,
            modelId: item.modelId,
            modelName: item.modelName,
            prompt: item.prompt,
            type: item.type as "image" | "video",
            createdAt: item.createdAt,
            generations: item.mediaUrls?.map((url, idx) => ({
              id: `${item.jobId}-${idx}`,
              seed: item.params?.seed || '',
              kind: item.type as "image" | "video",
              url: url,
            })) || [],
            tags: generateTagsFromPrompt(item.prompt),
            walletAddress: item.walletAddress,
          }));
          
          // Merge: server + unique local
          const serverJobIds = new Set(serverCreations.map(c => c.jobId));
          const uniqueLocal = localCreations.filter(c => !serverJobIds.has(c.jobId));
          setCreations([...serverCreations, ...uniqueLocal]);
        } catch {
          setCreations(localCreations);
        }
      } else {
        setCreations(localCreations);
      }
    }
    loadCreations();
  }, [address]);

  const selectedDimension = styles?.dimensions.find(d => d.id === dimensionId);
  const selectedModel = styles?.models.find(m => m.default) || styles?.models[0];

  // Generate handler
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || !selectedModel || !selectedDimension) return;
    
    setIsGenerating(true);
    setError(null);
    setCurrentJob(null);

    try {
      const resp = await createJob({
        modelId: selectedModel.id,
        prompt: prompt.trim(),
        negativePrompt: "",
        nsfw: false,
        public: true,
        walletAddress: address,
        mediaType: "image",
        sourceProcessing: "txt2img",
        params: {
          width: selectedDimension.width,
          height: selectedDimension.height,
          steps: styles?.defaults.steps ?? 28,
          cfgScale: styles?.defaults.cfgScale ?? 3.5,
          sampler: styles?.defaults.sampler ?? "euler",
          scheduler: styles?.defaults.scheduler ?? "normal",
        },
      });

      setCurrentJob({ jobId: resp.jobId, status: "queued" });
      pollJob(resp.jobId);
    } catch (err: any) {
      setError(err.message || "Failed to create job");
      setIsGenerating(false);
    }
  }, [prompt, selectedModel, selectedDimension, styles, address]);

  // Poll job status
  const pollJob = useCallback(async (jobId: string) => {
    let attempts = 0;
    const poll = async () => {
      attempts++;
      try {
        const status: JobStatus = await fetchJobStatus(jobId);
        setCurrentJob({ jobId, status: status.status });

        if (status.status === "completed" && status.generations.length > 0) {
          // Save creation
          const creation: StoredCreation = {
            jobId,
            modelId: selectedModel?.id || "",
            modelName: selectedModel?.name || "",
            prompt,
            type: "image",
            createdAt: Date.now(),
            generations: status.generations.map(g => ({
              id: g.id,
              seed: g.seed || "",
              kind: (g.kind === "video" ? "video" : "image") as "video" | "image",
              url: g.url,
              base64: g.base64,
            })),
            tags: generateTagsFromPrompt(prompt),
            walletAddress: address,
          };
          saveCreation(creation);
          setCreations(prev => [creation, ...prev]);
          setIsGenerating(false);
          setCurrentJob(null);
          setPrompt("");
          return;
        }

        if (status.status === "faulted") {
          setError("Generation failed");
          setIsGenerating(false);
          return;
        }

        if (attempts < 120) {
          setTimeout(poll, 5000);
        } else {
          setError("Generation timed out");
          setIsGenerating(false);
        }
      } catch (err) {
        if (attempts < 120) {
          setTimeout(poll, 10000);
        } else {
          setError("Failed to check status");
          setIsGenerating(false);
        }
      }
    };
    poll();
  }, [selectedModel, prompt, address]);

  return (
    <main className="min-h-screen bg-zinc-900">
      <Header />
      
      <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8">
        {/* Generate Section */}
        <div className="flex flex-col md:flex-row gap-6 mb-12">
          {/* Prompt Input */}
          <div className="flex-1">
            <div className="relative">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your image..."
                disabled={isGenerating}
                className="w-full min-h-[120px] bg-zinc-800/60 border border-zinc-700 rounded-2xl px-5 py-4 text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 resize-none disabled:opacity-50"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && prompt.trim()) {
                    e.preventDefault();
                    handleGenerate();
                  }
                }}
              />
            </div>
            
            {/* Generate Button */}
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim()}
                className="px-10 py-3 bg-gradient-to-t from-slate-50 via-slate-50 to-slate-100 text-zinc-900 font-semibold rounded-xl shadow-lg disabled:opacity-40 disabled:cursor-default hover:brightness-110 transition-all"
              >
                {isGenerating ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin w-4 h-4 border-2 border-zinc-400 border-t-zinc-700 rounded-full" />
                    {currentJob?.status === "processing" ? "Creating..." : "Queued..."}
                  </span>
                ) : (
                  `Generate with ${selectedModel?.name || 'AI'}`
                )}
              </button>
            </div>

            {error && (
              <p className="mt-3 text-red-400 text-sm">{error}</p>
            )}
          </div>

          {/* Settings Panel */}
          <div className="w-full md:w-[280px] border border-zinc-700 rounded-2xl p-5 bg-zinc-800/30">
            {/* Dimensions */}
            <div className="mb-6">
              <div className="flex items-center gap-2 text-xs text-zinc-400 mb-3">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
                <span>Dimensions</span>
              </div>
              
              {/* Slider */}
              <input
                type="range"
                min={0}
                max={(styles?.dimensions.length || 7) - 1}
                value={dimensionId}
                onChange={(e) => setDimensionId(Number(e.target.value))}
                className="w-full h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-indigo-500"
              />
              
              {/* Aspect Preview */}
              <div className="flex items-center justify-between mt-3">
                <svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="2" y="6" width="20" height="12" rx="2" />
                </svg>
                <div className="text-sm text-zinc-200 font-medium">
                  {selectedDimension ? `${selectedDimension.width} × ${selectedDimension.height}` : '1024 × 1024'}
                </div>
                <svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="2" width="12" height="20" rx="2" />
                </svg>
              </div>
              
            </div>

            {/* Model */}
            <div>
              <div className="flex items-center gap-2 text-xs text-zinc-400 mb-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                <span>Model</span>
              </div>
              <select 
                className="w-full bg-transparent text-zinc-200 text-sm py-2 px-3 rounded-lg hover:bg-zinc-700/50 cursor-pointer focus:outline-none"
                value={selectedModel?.id || ""}
                onChange={(e) => {
                  // For now just one model, but ready for more
                }}
              >
                {styles?.models.filter(m => m.enabled).map(model => (
                  <option key={model.id} value={model.id} className="bg-zinc-800">
                    {model.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Creations Grid - Masonry Style */}
        {creations.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Your Creations</h2>
            <Masonry
              breakpointCols={MASONRY_BREAKPOINTS}
              className="masonry-grid flex w-auto -ml-1"
              columnClassName="pl-1 bg-clip-padding"
            >
              {creations.map((creation) => (
                <CreationCard key={creation.jobId} creation={creation} />
              ))}
            </Masonry>
          </div>
        )}

        {creations.length === 0 && !isGenerating && (
          <div className="text-center py-20 text-zinc-500">
            <p className="text-lg mb-2">No creations yet</p>
            <p className="text-sm">Describe something and click Generate to start creating</p>
          </div>
        )}
      </div>
    </main>
  );
}

// Creation Card Component
function CreationCard({ creation }: { creation: StoredCreation }) {
  const [showModal, setShowModal] = useState(false);
  const [imgError, setImgError] = useState(false);
  const firstGen = creation.generations[0];
  const imageUrl = firstGen?.url || firstGen?.base64;
  // Use thumbnail for grid, full URL for modal
  const thumbnailUrl = imageUrl && !imageUrl.startsWith('data:') 
    ? getThumbnailUrl(imageUrl, 400) 
    : imageUrl;

  const handleDownload = () => {
    if (!imageUrl) return;
    const filename = getMediaFilename(creation.jobId, firstGen?.id, creation.type === "video");
    downloadMedia(imageUrl, filename);
  };

  return (
    <>
      <div 
        className="mb-1 group cursor-pointer"
        onClick={() => setShowModal(true)}
      >
        <div className="relative rounded-xl overflow-hidden bg-zinc-800 border border-zinc-700/50 hover:border-zinc-600 transition-colors">
          {thumbnailUrl && !imgError ? (
            <img
              src={thumbnailUrl}
              alt={creation.prompt.slice(0, 50)}
              className="w-full h-auto block"
              loading="lazy"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="aspect-square flex items-center justify-center bg-zinc-800/50">
              <span className="text-4xl opacity-50">🖼️</span>
            </div>
          )}
          
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="absolute bottom-0 left-0 right-0 p-3">
              <p className="text-white text-xs line-clamp-2">{creation.prompt}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setShowModal(false)}
        >
          <div 
            className="max-w-3xl w-full max-h-[90vh] overflow-auto bg-zinc-900 rounded-2xl border border-zinc-700"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Image */}
            <div className="relative">
              {imageUrl && (
                <img
                  src={imageUrl}
                  alt={creation.prompt}
                  className="w-full h-auto"
                />
              )}
              <button
                onClick={() => setShowModal(false)}
                className="absolute top-3 right-3 p-2 bg-black/60 hover:bg-black/80 rounded-full transition-colors"
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Info */}
            <div className="p-5 space-y-4">
              <p className="text-white text-sm leading-relaxed">{creation.prompt}</p>
              
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>{creation.modelName}</span>
                <span>{new Date(creation.createdAt).toLocaleDateString()}</span>
              </div>
              
              <button
                onClick={handleDownload}
                className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium rounded-xl transition-colors"
              >
                Download
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
