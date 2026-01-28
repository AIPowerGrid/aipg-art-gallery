"use client";

import { useEffect, useState, useCallback } from "react";
import Masonry from "react-masonry-css";
import { Header } from "@/components/header";
import { createJob, fetchJobStatus, fetchGalleryByWallet, addToGallery, updateGalleryItem, deleteGalleryItem, publishGalleryItem, unpublishGalleryItem, GalleryItem, enhancePrompt } from "@/lib/api";
import { useRouter } from "next/navigation";
import { JobStatus } from "@/types/models";
import { useAccount } from "wagmi";
import { downloadMedia, getMediaFilename } from "@/lib/utils/download";
import { 
  saveCreation, 
  getStoredCreations, 
  StoredCreation,
  generateTagsFromPrompt 
} from "@/lib/storage";
import { useJobStore } from "@/lib/stores/job-store";
import { useFaviconProgress, calculateProgress } from "@/lib/hooks/use-favicon-progress";
import { 
  canGenerateAnon, 
  getRemainingGenerations, 
  recordAnonGeneration,
  GENERATION_LIMIT 
} from "@/lib/generation-limits";
import { isAuthenticated } from "@/lib/auth";
import { AuthModal } from "@/components/auth-modal";

// Extended creation type with generating state
interface DisplayCreation extends StoredCreation {
  isGenerating?: boolean;
  progress?: number;
  queuePosition?: number;
  status?: string;
  isPublic?: boolean;
}

const MASONRY_BREAKPOINTS = {
  default: 5,
  1536: 4,
  1280: 4,
  1024: 3,
  768: 2,
  640: 2,
};

// Dimension Slider with popup aspect ratio preview
function DimensionSlider({ 
  dimensions, 
  selectedId, 
  onChange 
}: { 
  dimensions: { id: number; width: number; height: number; label: string }[];
  selectedId: number;
  onChange: (id: number) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const selected = dimensions.find(d => d.id === selectedId) || dimensions[3];
  
  // Calculate aspect ratio box size (max 60px, maintain ratio)
  const maxSize = 60;
  const aspectW = selected ? selected.width / Math.max(selected.width, selected.height) * maxSize : maxSize;
  const aspectH = selected ? selected.height / Math.max(selected.width, selected.height) * maxSize : maxSize;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 text-xs text-zinc-400 mb-3">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
        </svg>
        <span>Dimensions</span>
      </div>
      
      {/* Slider with popup */}
      <div className="relative">
        <input
          type="range"
          min={0}
          max={dimensions.length - 1 || 6}
          value={selectedId}
          onChange={(e) => onChange(Number(e.target.value))}
          onMouseDown={() => setIsDragging(true)}
          onMouseUp={() => setIsDragging(false)}
          onMouseLeave={() => setIsDragging(false)}
          onTouchStart={() => setIsDragging(true)}
          onTouchEnd={() => setIsDragging(false)}
          className="w-full h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-indigo-500"
        />
        
        {/* Popup tooltip with aspect ratio box - below slider */}
        {isDragging && (
          <div 
            className="absolute top-6 left-1/2 -translate-x-1/2 bg-zinc-800 border border-zinc-600 rounded-xl p-3 shadow-xl z-50"
            style={{ minWidth: '100px' }}
          >
            {/* Arrow pointing up */}
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-b-8 border-l-transparent border-r-transparent border-b-zinc-600" />
            <div className="flex flex-col items-center gap-2">
              {/* Aspect ratio box */}
              <div 
                className="border-2 border-indigo-500 rounded bg-indigo-500/20 transition-all duration-150"
                style={{ width: aspectW, height: aspectH }}
              />
              {/* Dimensions text */}
              <div className="text-xs text-white font-medium whitespace-nowrap">
                {selected ? `${selected.width} × ${selected.height}` : '1024 × 1024'}
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Static display below slider */}
      <div className="flex items-center justify-between mt-3">
        <svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="currentColor">
          <rect x="2" y="6" width="20" height="12" rx="2" />
        </svg>
        <div className="text-sm text-zinc-200 font-medium">
          {selected ? `${selected.width} × ${selected.height}` : '1024 × 1024'}
        </div>
        <svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="2" width="12" height="20" rx="2" />
        </svg>
      </div>
    </div>
  );
}

// Types
interface ModelSettings {
  steps?: number;
  cfgScale?: number;
  sampler?: string;
  scheduler?: string;
}

interface Model {
  id: string;
  name: string;
  description: string;
  type: string;
  enabled: boolean;
  default: boolean;
  settings?: ModelSettings;
}

interface StylesConfig {
  models: Model[];
  dimensions: { id: number; width: number; height: number; label: string; aspectRatio: string }[];
  defaultDimensionId: number;
  defaults: { steps: number; cfgScale: number; sampler: string; scheduler: string };
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
      <main className="min-h-screen bg-black">
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
  const { address, isConnected } = useAccount();
  const [styles, setStyles] = useState<StylesConfig | null>(null);
  const [prompt, setPrompt] = useState("");
  const [dimensionId, setDimensionId] = useState(3); // Default to square
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentJob, setCurrentJob] = useState<JobStatus | null>(null);
  const [creations, setCreations] = useState<DisplayCreation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [remainingGens, setRemainingGens] = useState(GENERATION_LIMIT);
  const [isEnhancing, setIsEnhancing] = useState(false);
  
  // Global job store for tracking across navigation
  const { jobs, addJob, getActiveJobs } = useJobStore();
  const activeJobs = getActiveJobs();
  const trackedJob = activeJobs.length > 0 ? activeJobs[0] : null;
  
  // Calculate progress from tracked job
  const jobProgress = trackedJob 
    ? calculateProgress(
        trackedJob.submittedAt,
        trackedJob.initialWaitTime,
        trackedJob.waitTime,
        trackedJob.status
      )
    : 0;
  
  // Update favicon with progress
  useFaviconProgress(jobProgress, !!trackedJob);
  
  // Sync tracked job progress to the creation card
  useEffect(() => {
    if (trackedJob) {
      setCreations(prev => prev.map(c => 
        c.jobId === trackedJob.jobId && c.isGenerating
          ? { 
              ...c, 
              progress: jobProgress, 
              queuePosition: trackedJob.queuePosition, 
              status: trackedJob.status 
            }
          : c
      ));
    }
  }, [trackedJob, jobProgress]);
  
  // Watch for completed jobs in the store and update creations with media
  useEffect(() => {
    const completedJobs = jobs.filter(j => j.status === 'completed' && j.result?.generations?.length);
    
    completedJobs.forEach(job => {
      setCreations(prev => prev.map(c => {
        if (c.jobId === job.jobId && c.isGenerating) {
          // Job completed - update with actual media
          return {
            ...c,
            isGenerating: false,
            progress: 100,
            generations: job.result!.generations.map(g => ({
              id: g.id,
              seed: g.seed || "",
              kind: (g.kind === "video" ? "video" : c.type) as "video" | "image",
              url: g.url,
              base64: g.base64,
            })),
          };
        }
        return c;
      }));
    });
  }, [jobs]);

  // Update remaining generations count
  useEffect(() => {
    if (!isConnected || !isAuthenticated()) {
      setRemainingGens(getRemainingGenerations());
    }
  }, [isConnected, creations]);

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

  // Load creations: DB for logged-in users, localStorage for anonymous
  // Also merge in any active jobs from the job store
  useEffect(() => {
    async function loadCreations() {
      // Get active jobs from store to show as generating placeholders
      const activeJobsFromStore = getActiveJobs();
      const activePlaceholders: DisplayCreation[] = activeJobsFromStore.map(job => ({
        jobId: job.jobId,
        modelId: job.modelId,
        modelName: job.modelName,
        prompt: job.prompt,
        type: job.type,
        createdAt: job.submittedAt,
        generations: [],
        tags: generateTagsFromPrompt(job.prompt),
        walletAddress: job.walletAddress,
        isGenerating: true,
        progress: calculateProgress(job.submittedAt, job.initialWaitTime, job.waitTime, job.status),
        status: job.status,
      }));
      
      if (address) {
        // Logged in - fetch from database
        try {
          const serverData = await fetchGalleryByWallet(address, 100);
          const serverCreations: DisplayCreation[] = serverData.items
            // Filter out items with no media (incomplete jobs)
            .filter((item: GalleryItem) => item.mediaUrls && item.mediaUrls.length > 0 && item.mediaUrls[0])
            .map((item: GalleryItem) => ({
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
              isPublic: item.isPublic,
            }));
          
          // Merge: active placeholders first, then completed (excluding duplicates)
          const completedJobIds = new Set(activePlaceholders.map(p => p.jobId));
          const filteredServer = serverCreations.filter(c => !completedJobIds.has(c.jobId));
          setCreations([...activePlaceholders, ...filteredServer]);
        } catch (err) {
          console.error("Failed to load creations from server:", err);
          setCreations(activePlaceholders);
        }
      } else {
        // Anonymous - use localStorage + active jobs
        const stored = getStoredCreations();
        const storedJobIds = new Set(activePlaceholders.map(p => p.jobId));
        const filteredStored = stored.filter(c => !storedJobIds.has(c.jobId));
        setCreations([...activePlaceholders, ...filteredStored]);
      }
    }
    loadCreations();
  }, [address, jobs]); // Re-run when jobs change

  const selectedDimension = styles?.dimensions.find(d => d.id === dimensionId);
  const selectedModel = styles?.models.find(m => m.default) || styles?.models[0];

  // Generate handler
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || !selectedModel || !selectedDimension) return;
    
    // Check authentication status
    const authenticated = isConnected && isAuthenticated();
    
    // Check if trying to generate video without authentication
    if (!authenticated && selectedModel.type === "video") {
      setError("Video generation is only available for members. Please connect your wallet.");
      setShowAuthModal(true);
      return;
    }
    
    // Check generation limit for non-authenticated users
    if (!authenticated && !canGenerateAnon()) {
      setShowAuthModal(true);
      return;
    }
    
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
          steps: selectedModel?.settings?.steps ?? styles?.defaults.steps ?? 28,
          cfgScale: selectedModel?.settings?.cfgScale ?? styles?.defaults.cfgScale ?? 3.5,
          sampler: selectedModel?.settings?.sampler ?? styles?.defaults.sampler ?? "euler",
          scheduler: styles?.defaults.scheduler ?? "normal",
        },
      });

      // Record generation for non-authenticated users
      if (!authenticated) {
        recordAnonGeneration(resp.jobId);
        setRemainingGens(getRemainingGenerations());
      }

      // Create placeholder and add to creations array IMMEDIATELY
      const jobPrompt = prompt.trim();
      const jobType = selectedModel.type === "video" ? "video" : "image";
      const placeholder: DisplayCreation = {
        jobId: resp.jobId,
        modelId: selectedModel.id,
        modelName: selectedModel.name,
        prompt: jobPrompt,
        type: jobType,
        createdAt: Date.now(),
        generations: [], // Empty - no image yet
        tags: generateTagsFromPrompt(jobPrompt),
        walletAddress: address,
        isGenerating: true,
        progress: 0,
        status: 'queued',
      };
      
      // Add placeholder to front of creations
      setCreations(prev => [placeholder, ...prev.filter(c => c.jobId !== placeholder.jobId)]);
      
      // Add to global job store for tracking across navigation
      addJob({
        jobId: resp.jobId,
        modelId: selectedModel.id,
        modelName: selectedModel.name,
        prompt: jobPrompt,
        type: jobType,
        isNsfw: false,
        isPublic: false,
        walletAddress: address,
      });
      
      // Save to database IMMEDIATELY so it persists even if user navigates away
      // Media URLs will be empty initially - we'll update them when job completes
      if (authenticated) {
        try {
          await addToGallery({
            jobId: resp.jobId,
            modelId: selectedModel.id,
            modelName: selectedModel.name,
            prompt: jobPrompt,
            type: jobType,
            isNsfw: false,
            isPublic: false,
            walletAddress: address,
            params: {
              width: selectedDimension.width,
              height: selectedDimension.height,
              steps: selectedModel?.settings?.steps ?? styles?.defaults.steps,
              cfgScale: selectedModel?.settings?.cfgScale ?? styles?.defaults.cfgScale,
            },
            mediaUrls: [], // Empty - will be populated when job completes
          });
          console.log('Saved job to gallery:', resp.jobId);
        } catch (err) {
          console.error('Failed to save job to gallery:', err);
        }
      }

      setCurrentJob({ 
        jobId: resp.jobId, 
        status: "queued",
        faulted: false,
        waitTime: 0,
        queuePosition: 0,
        processing: 0,
        finished: 0,
        waiting: 0,
        generations: []
      } as JobStatus);
      
      // Clear prompt immediately
      setPrompt("");
      
      pollJob(resp.jobId);
    } catch (err: any) {
      setError(err.message || "Failed to create job");
      setIsGenerating(false);
    }
  }, [prompt, selectedModel, selectedDimension, styles, address, isConnected]);

  // Poll job status
  const pollJob = useCallback(async (jobId: string) => {
    let attempts = 0;
    let initialWaitTime: number | undefined;
    
    const poll = async () => {
      attempts++;
      try {
        const status: JobStatus = await fetchJobStatus(jobId);
        setCurrentJob(status);
        
        // Track initial wait time for progress calculation
        if (!initialWaitTime && status.waitTime && status.waitTime > 0) {
          initialWaitTime = status.waitTime;
        }
        
        // Calculate progress percentage
        let progress = 0;
        if (status.status === "processing") {
          progress = 75 + Math.min(25, attempts * 2); // 75-100% while processing
        } else if (status.status === "queued" && initialWaitTime) {
          const elapsed = initialWaitTime - (status.waitTime || 0);
          progress = Math.min(70, (elapsed / initialWaitTime) * 70); // 0-70% while queued
        } else if (status.status === "queued") {
          progress = Math.min(30, attempts * 3); // Slowly increment if no wait time
        }
        
        // Update the placeholder in creations array with progress
        setCreations(prev => prev.map(c => 
          c.jobId === jobId && c.isGenerating
            ? { ...c, progress, queuePosition: status.queuePosition, status: status.status }
            : c
        ));

        if (status.status === "completed" && status.generations.length > 0) {
          // Get the placeholder to preserve its prompt (since we cleared the input)
          const placeholder = creations.find(c => c.jobId === jobId);
          const jobPrompt = placeholder?.prompt || "";
          const jobModelId = placeholder?.modelId || selectedModel?.id || "";
          const jobModelName = placeholder?.modelName || selectedModel?.name || "";
          const jobType = placeholder?.type || "image";
          
          // UPDATE THE CREATION IN PLACE - no adding/removing
          setCreations(prev => prev.map(c => 
            c.jobId === jobId
              ? {
                  ...c,
                  isGenerating: false,
                  progress: 100,
                  generations: status.generations.map(g => ({
                    id: g.id,
                    seed: g.seed || "",
                    kind: (g.kind === "video" ? "video" : jobType) as "video" | "image",
                    url: g.url,
                    base64: g.base64,
                  })),
                }
              : c
          ));
          
          // Update database with media URLs if authenticated, otherwise localStorage
          const authenticated = address && isAuthenticated();
          if (authenticated) {
            const mediaUrls = status.generations
              .map(g => g.url)
              .filter((url): url is string => !!url);
            
            try {
              // Update the existing gallery record with media URLs
              // (we saved the job on creation, now we add the generated media)
              await updateGalleryItem(jobId, mediaUrls);
              console.log('Updated gallery item with media:', jobId);
            } catch (err) {
              console.error("Failed to update gallery item:", err);
            }
          } else {
            const creation: StoredCreation = {
              jobId,
              modelId: jobModelId,
              modelName: jobModelName,
              prompt: jobPrompt,
              type: jobType,
              createdAt: Date.now(),
              generations: status.generations.map(g => ({
                id: g.id,
                seed: g.seed || "",
                kind: (g.kind === "video" ? "video" : jobType) as "video" | "image",
                url: g.url,
                base64: g.base64,
              })),
              tags: generateTagsFromPrompt(jobPrompt),
              walletAddress: address,
            };
            saveCreation(creation);
          }
          
          setIsGenerating(false);
          setTimeout(() => setCurrentJob(null), 3000);
          return;
        }

        if (status.status === "faulted") {
          // Remove the placeholder on fault
          setCreations(prev => prev.filter(c => c.jobId !== jobId));
          setError("Generation failed");
          setIsGenerating(false);
          return;
        }

        if (attempts < 120) {
          setTimeout(poll, 5000);
        } else {
          // Remove the placeholder on timeout
          setCreations(prev => prev.filter(c => c.jobId !== jobId));
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
  }, [selectedModel, selectedDimension, styles, prompt, address]);

  const authenticated = isConnected && isAuthenticated();

  return (
    <main className="min-h-screen bg-black">
      <Header />
      
      <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8">
        {/* Anonymous User Warning */}
        {!authenticated && (
          <div className="mb-6 bg-[#1a1a1a] border border-[#333] rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-white/80 text-sm">
                  <span className="font-medium">{remainingGens} of {GENERATION_LIMIT} free generations remaining.</span>
                  {' '}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      const walletBtn = document.querySelector<HTMLButtonElement>('button[data-wallet-button]');
                      if (walletBtn) {
                        walletBtn.click();
                      }
                    }}
                    className="text-white hover:underline"
                  >
                    Connect wallet
                  </button>
                  {' '}for unlimited access.
                </p>
              </div>
            </div>
          </div>
        )}

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
                className="w-full min-h-[160px] bg-zinc-800/60 border border-zinc-700 rounded-2xl px-5 py-4 text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 resize-none disabled:opacity-50"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && prompt.trim()) {
                    e.preventDefault();
                    handleGenerate();
                  }
                }}
              />
            </div>
            
            {/* AI Enhance and Generate buttons */}
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={async () => {
                  if (!prompt.trim()) return;
                  setIsEnhancing(true);
                  setError(null);
                  try {
                    const result = await enhancePrompt({
                      prompt: prompt.trim(),
                      type: selectedModel?.type === "video" ? "video" : "image",
                    });
                    setPrompt(result.enhancedPrompt);
                  } catch (err: any) {
                    setError(err.message || "Failed to enhance prompt");
                  } finally {
                    setIsEnhancing(false);
                  }
                }}
                disabled={isGenerating || isEnhancing || !prompt.trim()}
                className="px-5 py-3 bg-zinc-700 hover:bg-zinc-600 text-white font-medium rounded-xl shadow-lg disabled:opacity-40 disabled:cursor-default transition-all flex items-center gap-2"
                title="AI Enhance Prompt"
              >
                {isEnhancing ? (
                  <>
                    <span className="animate-spin w-4 h-4 border-2 border-zinc-400 border-t-white rounded-full" />
                    <span className="md:hidden">...</span>
                    <span className="hidden md:inline">Enhancing...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span className="md:hidden">Enhance</span>
                    <span className="hidden md:inline">Enhance my Prompt with AI</span>
                  </>
                )}
              </button>
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim()}
                className="px-6 md:px-10 py-3 bg-gradient-to-t from-slate-50 via-slate-50 to-slate-100 text-zinc-900 font-semibold rounded-xl shadow-lg disabled:opacity-40 disabled:cursor-default hover:brightness-110 transition-all"
              >
                {isGenerating ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin w-4 h-4 border-2 border-zinc-400 border-t-zinc-700 rounded-full" />
                    <span className="md:hidden">{currentJob?.status === "processing" ? "..." : "..."}</span>
                    <span className="hidden md:inline">{currentJob?.status === "processing" ? "Creating..." : "Queued..."}</span>
                  </span>
                ) : (
                  <>
                    <span className="md:hidden">Generate</span>
                    <span className="hidden md:inline">Generate with {selectedModel?.name || 'AI'}</span>
                  </>
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
            <DimensionSlider 
              dimensions={styles?.dimensions || []}
              selectedId={dimensionId}
              onChange={setDimensionId}
            />
            

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
                <CreationCard 
                  key={creation.jobId} 
                  creation={creation} 
                  onDelete={(jobId) => setCreations(prev => prev.filter(c => c.jobId !== jobId))}
                />
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

      {/* Auth Modal for Generation Limit */}
      <AuthModal 
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        title="Generation Limit Reached"
        message={`You've used all ${GENERATION_LIMIT} free generations. Connect your Base wallet to unlock unlimited image generations, access to video creation, and the ability to save and manage your creations across all your devices!`}
      />
    </main>
  );
}

// Creation Card Component
// Unified Creation Card - handles both generating and completed states
function CreationCard({ creation, onDelete }: { creation: DisplayCreation; onDelete?: (jobId: string) => void }) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const firstGen = creation.generations[0];
  const mediaUrl = firstGen?.url || firstGen?.base64;
  const isVideo = creation.type === "video" || firstGen?.kind === "video";
  
  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this image?')) return;
    setIsDeleting(true);
    try {
      await deleteGalleryItem(creation.jobId);
      onDelete?.(creation.jobId);
    } catch (err) {
      console.error('Failed to delete:', err);
      alert('Failed to delete image');
    } finally {
      setIsDeleting(false);
    }
  };
  
  const handleTogglePublish = async () => {
    setIsPublishing(true);
    try {
      if (creation.isPublic) {
        // Unpublish
        await unpublishGalleryItem(creation.jobId);
        creation.isPublic = false;
      } else {
        // Publish
        await publishGalleryItem(creation.jobId);
        creation.isPublic = true;
        // Show confetti on card
        setShowConfetti(true);
        setShowModal(false);
        setTimeout(() => {
          setShowConfetti(false);
        }, 2000);
      }
    } catch (err) {
      console.error('Failed to toggle publish:', err);
      alert(creation.isPublic ? 'Failed to unpublish' : 'Failed to publish');
    } finally {
      setIsPublishing(false);
    }
  };
  
  // Reset imageLoaded when the URL changes
  const [prevUrl, setPrevUrl] = useState<string | undefined>(undefined);
  if (mediaUrl !== prevUrl) {
    setPrevUrl(mediaUrl);
    setImageLoaded(false);
  }
  
  // Show spinner overlay until image has loaded
  const showSpinner = creation.isGenerating || !mediaUrl || (!imageLoaded && !isVideo && !mediaError);
  
  const thumbnailUrl = mediaUrl && !mediaUrl.startsWith('data:') && !isVideo
    ? getThumbnailUrl(mediaUrl, 400) 
    : mediaUrl;

  const handleDownload = () => {
    if (!mediaUrl) return;
    const filename = getMediaFilename(creation.jobId, firstGen?.id, isVideo);
    downloadMedia(mediaUrl, filename);
  };

  return (
    <>
      <div 
        className="mb-1 group cursor-pointer"
        onClick={() => !showSpinner && setShowModal(true)}
      >
        <div className={`relative rounded-xl overflow-hidden bg-zinc-800 border transition-colors ${
          showSpinner ? 'border-indigo-500/50' : 'border-zinc-700/50 hover:border-zinc-600'
        }`}>
          {/* Confetti celebration on card - explodes from center */}
          {showConfetti && (
            <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden">
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <span className="text-3xl">🎉</span>
              </div>
              {[...Array(40)].map((_, i) => {
                const angle = (i / 40) * Math.PI * 2;
                const distance = 60 + Math.random() * 50;
                const tx = Math.cos(angle) * distance;
                const ty = Math.sin(angle) * distance;
                return (
                  <div
                    key={i}
                    className="absolute w-2 h-2 animate-confetti-explode"
                    style={{
                      left: '50%',
                      top: '50%',
                      backgroundColor: ['#ff6b6b', '#4ecdc4', '#ffe66d', '#95e1d3', '#f38181', '#aa96da', '#fcbad3', '#74b9ff'][i % 8],
                      borderRadius: Math.random() > 0.5 ? '50%' : '0',
                      '--tx': `${tx}px`,
                      '--ty': `${ty}px`,
                      animationDelay: `${Math.random() * 0.15}s`,
                    } as React.CSSProperties}
                  />
                );
              })}
            </div>
          )}
          
          {/* Always render media if we have a URL - it loads in background */}
          {thumbnailUrl && !mediaError && (
            <div className={showSpinner ? 'invisible absolute' : 'visible'}>
              {isVideo ? (
                <video src={thumbnailUrl} className="w-full h-auto block animate-fadeIn" autoPlay loop muted playsInline onError={() => setMediaError(true)} />
              ) : (
                <img 
                  src={thumbnailUrl} 
                  alt={creation.prompt.slice(0, 50)} 
                  className="w-full h-auto block animate-fadeIn" 
                  loading="eager" 
                  onLoad={() => setImageLoaded(true)}
                  onError={() => setMediaError(true)} 
                />
              )}
            </div>
          )}
          
          {/* Show spinner overlay while loading */}
          {showSpinner && (
            <div className="aspect-square relative overflow-hidden bg-zinc-900">
              {/* Subtle animated border glow */}
              <div 
                className="absolute inset-0 opacity-30"
                style={{
                  background: 'radial-gradient(circle at 50% 50%, rgba(99, 102, 241, 0.15) 0%, transparent 70%)',
                  animation: 'pulse 3s ease-in-out infinite'
                }}
              />
              
              <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
                {/* Simple spinning ring */}
                <div className="relative w-12 h-12 mb-3">
                  <div 
                    className="w-12 h-12 rounded-full border-2 border-zinc-700"
                  />
                  <div 
                    className="absolute inset-0 w-12 h-12 rounded-full border-2 border-transparent border-t-indigo-500"
                    style={{ animation: 'spin 1s linear infinite' }}
                  />
                </div>
                
                <p className="text-zinc-400 text-xs text-center">
                  {creation.status === 'queued' 
                    ? (creation.queuePosition && creation.queuePosition > 0 
                        ? `Queue #${creation.queuePosition}` 
                        : 'Finding worker...')
                    : isVideo ? 'Creating video...' : 'Creating image...'
                  }
                </p>
                
                {/* Progress percentage - small and subtle */}
                <p className="text-zinc-500 text-[10px] mt-1">
                  {Math.round(creation.progress || 0)}%
                </p>
              </div>
              
              {/* Type badge */}
              <div className="absolute top-2 left-2 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-[10px] text-zinc-400 flex items-center gap-1">
                {isVideo ? (
                  <><svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>Video</>
                ) : (
                  <><svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>Image</>
                )}
              </div>
            </div>
          )}
          
          {/* Error state */}
          {!showSpinner && (!thumbnailUrl || mediaError) && (
            <div className="aspect-square flex items-center justify-center bg-zinc-800/50">
              <span className="text-4xl opacity-50">{isVideo ? '🎬' : '🖼️'}</span>
            </div>
          )}
          
          {/* Video badge for completed videos */}
          {!showSpinner && isVideo && thumbnailUrl && !mediaError && (
            <div className="absolute top-2 left-2 px-2 py-1 bg-black/70 rounded-md text-xs text-white flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              Video
            </div>
          )}
          
          {/* Action buttons - top right */}
          {!showSpinner && (
            <div className="absolute top-2 right-2 flex gap-1.5 z-10">
              {/* Publish toggle button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleTogglePublish();
                }}
                disabled={isPublishing}
                className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold transition-all ${
                  creation.isPublic 
                    ? 'bg-purple-600 text-white hover:bg-purple-700' 
                    : 'bg-black/50 hover:bg-purple-600 text-white opacity-0 group-hover:opacity-100'
                }`}
                title={creation.isPublic ? "Click to unpublish" : "Publish to Gallery"}
              >
                {isPublishing ? (
                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  "P"
                )}
              </button>
              {/* Delete button */}
              {onDelete && (
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="p-1.5 bg-black/60 hover:bg-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-all"
                  title="Delete"
                >
                  {isDeleting ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  )}
                </button>
              )}
            </div>
          )}
          
          {/* Hover overlay */}
          {!showSpinner && (
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <p className="text-white text-xs line-clamp-2">{creation.prompt}</p>
              </div>
            </div>
          )}
          
          {/* Prompt for generating */}
          {showSpinner && (
            <div className="p-3 border-t border-zinc-700/50">
              <p className="text-white text-xs line-clamp-2">{creation.prompt}</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && !showSpinner && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4"
          onClick={() => setShowModal(false)}
        >
          <div 
            className="flex flex-col max-w-[95vw] max-h-[95vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Media container - fits in viewport */}
            <div className="relative flex-1 min-h-0 flex items-center justify-center">
              {mediaUrl && (
                isVideo ? (
                  <video 
                    id={`modal-media-${creation.jobId}`}
                    src={mediaUrl} 
                    className="max-w-full max-h-[75vh] object-contain rounded-lg" 
                    controls 
                    autoPlay 
                    loop 
                    playsInline 
                  />
                ) : (
                  <img 
                    id={`modal-media-${creation.jobId}`}
                    src={mediaUrl} 
                    alt={creation.prompt} 
                    className="max-w-full max-h-[75vh] object-contain rounded-lg" 
                  />
                )
              )}
              
              {/* Control buttons */}
              <div className="absolute top-3 right-3 flex gap-2">
                {/* Fullscreen button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const el = document.getElementById(`modal-media-${creation.jobId}`);
                    if (el) {
                      if (el.requestFullscreen) {
                        el.requestFullscreen();
                      } else if ((el as any).webkitRequestFullscreen) {
                        (el as any).webkitRequestFullscreen();
                      }
                    }
                  }}
                  className="p-2 bg-black/60 hover:bg-black/80 rounded-full transition-colors"
                  title="Fullscreen"
                >
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                </button>
                {/* Close button */}
                <button
                  onClick={() => setShowModal(false)}
                  className="p-2 bg-black/60 hover:bg-black/80 rounded-full transition-colors"
                >
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Info bar below image */}
            <div className="mt-3 px-4 py-3 bg-zinc-900/90 rounded-xl backdrop-blur-sm max-w-2xl mx-auto">
              <p className="text-white text-sm leading-relaxed line-clamp-2 mb-2">{creation.prompt}</p>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 text-xs text-zinc-400">
                  <span>{creation.modelName}</span>
                  <span>•</span>
                  <span>{new Date(creation.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleTogglePublish}
                    disabled={isPublishing}
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    {isPublishing ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        {creation.isPublic ? 'Unpublishing...' : 'Publishing...'}
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        {creation.isPublic ? 'Unpublish' : 'Publish to Gallery'}
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleDownload}
                    className="px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
    </>
  );
}
