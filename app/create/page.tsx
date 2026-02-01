"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Masonry from "react-masonry-css";
import { Header } from "@/components/header";
import { createJob, fetchGalleryByWallet, addToGallery, GalleryItem, enhancePrompt } from "@/lib/api";
import { useAccount } from "wagmi";
import { 
  saveCreation, 
  getStoredCreations, 
  StoredCreation,
  DisplayCreation,
  generateTagsFromPrompt 
} from "@/lib/storage";
import { CreationCard } from "@/components/creation-card";
import { DimensionSlider } from "@/components/dimension-slider";
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

// Masonry breakpoints - matches main gallery
const MASONRY_BREAKPOINTS = {
  default: 5,
  1400: 4,
  1100: 3,
  768: 2,
};

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

// Sort helper: generating jobs first, then by date descending
function sortCreations(arr: DisplayCreation[]): DisplayCreation[] {
  return [...arr].sort((a, b) => {
    if (a.isGenerating && !b.isGenerating) return -1;
    if (!a.isGenerating && b.isGenerating) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function CreatePageContent() {
  const { address, isConnected } = useAccount();
  const [styles, setStyles] = useState<StylesConfig | null>(null);
  const [prompt, setPrompt] = useState("");
  const [dimensionId, setDimensionId] = useState(3); // Default to square
  const [isGenerating, setIsGenerating] = useState(false);
  const [creations, setCreations] = useState<DisplayCreation[]>([]);
  const [isLoaded, setIsLoaded] = useState(false); // Track if initial load is done
  const [error, setError] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [remainingGens, setRemainingGens] = useState(GENERATION_LIMIT);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [regeneratingJobId, setRegeneratingJobId] = useState<string | null>(null);
  
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

  // SINGLE effect to load creations on mount - runs once
  useEffect(() => {
    let cancelled = false;
    
    async function loadCreations() {
      const authenticated = address && isAuthenticated();
      
      // Build active job placeholders from store
      const activeJobsFromStore = getActiveJobs();
      const activePlaceholders: DisplayCreation[] = activeJobsFromStore
        .filter(job => job.status === 'queued' || job.status === 'processing')
        .map(job => ({
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
          width: job.width,
          height: job.height,
          expectedGenerations: job.expectedGenerations,
        }));
      
      // Also include recently completed jobs that might not be on server yet
      const recentlyCompletedJobs = activeJobsFromStore
        .filter(job => job.status === 'completed' && job.result?.generations?.length);
      const completedCreations: DisplayCreation[] = recentlyCompletedJobs.map(job => ({
        jobId: job.jobId,
        modelId: job.modelId,
        modelName: job.modelName,
        prompt: job.prompt,
        type: job.type,
        createdAt: job.submittedAt,
        generations: job.result!.generations.map(g => ({
          id: g.id,
          seed: g.seed || "",
          kind: (g.kind === "video" ? "video" : job.type) as "video" | "image",
          url: g.url,
          base64: g.base64,
        })),
        tags: generateTagsFromPrompt(job.prompt),
        walletAddress: job.walletAddress,
        width: job.width,
        height: job.height,
        expectedGenerations: job.expectedGenerations,
        isGenerating: false,
        progress: 100,
      }));
      
      let serverCreations: DisplayCreation[] = [];
      
      if (authenticated) {
        // Logged in - fetch from server
        try {
          const serverData = await fetchGalleryByWallet(address, 100);
          if (cancelled) return;
          
          serverCreations = serverData.items
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
              width: item.params?.width,
              height: item.params?.height,
              expectedGenerations: item.mediaUrls?.length,
              params: item.params, // Store full params for display
            }));
        } catch (err) {
          console.error("Failed to load creations from server:", err);
        }
      } else if (!address) {
        // Anonymous - use localStorage
        const stored = getStoredCreations();
        serverCreations = stored.map(c => ({ ...c, isGenerating: false }));
      }
      
      if (cancelled) return;
      
      // Merge all sources, avoiding duplicates
      const allJobIds = new Set<string>();
      const merged: DisplayCreation[] = [];
      
      // Active placeholders first (generating)
      for (const c of activePlaceholders) {
        if (!allJobIds.has(c.jobId)) {
          allJobIds.add(c.jobId);
          merged.push(c);
        }
      }
      
      // Then recently completed from job store (might not be on server yet)
      for (const c of completedCreations) {
        if (!allJobIds.has(c.jobId)) {
          allJobIds.add(c.jobId);
          merged.push(c);
        }
      }
      
      // Then server/localStorage data
      for (const c of serverCreations) {
        if (!allJobIds.has(c.jobId)) {
          allJobIds.add(c.jobId);
          merged.push(c);
        }
      }
      
      setCreations(sortCreations(merged));
      setIsLoaded(true);
    }
    
    loadCreations();
    
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]); // Only run on mount and address change
  
  // Update progress for active jobs (separate from initial load)
  useEffect(() => {
    if (!isLoaded) return; // Don't run until initial load is done
    
    const activeJobsFromStore = getActiveJobs();
    
    setCreations(prev => {
      let updated = [...prev];
      let changed = false;
      
      // Update progress for existing generating jobs
      activeJobsFromStore.forEach(job => {
        const idx = updated.findIndex(c => c.jobId === job.jobId);
        if (idx !== -1 && updated[idx].isGenerating) {
          const newProgress = calculateProgress(job.submittedAt, job.initialWaitTime, job.waitTime, job.status);
          if (updated[idx].progress !== newProgress || updated[idx].status !== job.status) {
            updated[idx] = {
              ...updated[idx],
              progress: newProgress,
              queuePosition: job.queuePosition,
              status: job.status,
            };
            changed = true;
          }
        }
      });
      
      return changed ? updated : prev;
    });
  }, [jobs, isLoaded, getActiveJobs]);
  
  // Handle job completions (separate from initial load)
  useEffect(() => {
    if (!isLoaded) return; // Don't run until initial load is done
    
    const completedJobs = jobs.filter(j => j.status === 'completed' && j.result?.generations?.length);
    const faultedJobs = jobs.filter(j => j.status === 'faulted');
    
    if (completedJobs.length === 0 && faultedJobs.length === 0) return;
    
    setCreations(prev => {
      let updated = [...prev];
      let changed = false;
      
      // Handle completed jobs
      completedJobs.forEach(job => {
        const idx = updated.findIndex(c => c.jobId === job.jobId);
        // Get the seed from the first generation (for display in params)
        const firstSeed = job.result?.generations?.[0]?.seed || "";
        
        if (idx !== -1 && updated[idx].isGenerating) {
          // Update existing placeholder with results
          // Also update params to include the seed from the completed generation
          const existingParams = updated[idx].params || {};
          updated[idx] = {
            ...updated[idx],
            isGenerating: false,
            progress: 100,
            generations: job.result!.generations.map(g => ({
              id: g.id,
              seed: g.seed || "",
              kind: (g.kind === "video" ? "video" : job.type) as "video" | "image",
              url: g.url,
              base64: g.base64,
            })),
            params: {
              ...existingParams,
              seed: firstSeed, // Add the seed from the completed generation
            },
          };
          changed = true;
        } else if (idx === -1) {
          // Job completed but no placeholder - add it
          updated.unshift({
            jobId: job.jobId,
            modelId: job.modelId,
            modelName: job.modelName,
            prompt: job.prompt,
            type: job.type,
            createdAt: job.submittedAt,
            generations: job.result!.generations.map(g => ({
              id: g.id,
              seed: g.seed || "",
              kind: (g.kind === "video" ? "video" : job.type) as "video" | "image",
              url: g.url,
              base64: g.base64,
            })),
            tags: generateTagsFromPrompt(job.prompt),
            walletAddress: job.walletAddress,
            width: job.width,
            height: job.height,
            expectedGenerations: job.expectedGenerations,
            isGenerating: false,
            progress: 100,
            params: {
              width: job.width,
              height: job.height,
              seed: firstSeed, // Include the seed
            },
          });
          changed = true;
        }
      });
      
      // Handle faulted jobs
      const faultedIds = new Set(faultedJobs.map(j => j.jobId));
      const beforeLen = updated.length;
      updated = updated.filter(c => !faultedIds.has(c.jobId));
      if (updated.length !== beforeLen) changed = true;
      
      if (!changed) return prev;
      return sortCreations(updated);
    });
    
    // Reset isGenerating flag if no active jobs remain
    const hasActiveJobs = jobs.some(j => j.status === 'queued' || j.status === 'processing');
    if (!hasActiveJobs && isGenerating) {
      setIsGenerating(false);
    }
  }, [jobs, isLoaded, isGenerating]);

  const selectedDimension = styles?.dimensions.find(d => d.id === dimensionId);
  const selectedModel = styles?.models.find(m => m.default) || styles?.models[0];

  // Generate handler
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || !selectedModel || !selectedDimension) return;
    
    // Check authentication status
    const authenticated = isConnected && isAuthenticated();
    
    // Check if trying to use batch mode without authentication
    if (!authenticated && batchMode) {
      setError("Batch generation is only available for members. Please connect your wallet.");
      setShowAuthModal(true);
      return;
    }
    
    // Check if trying to generate video without authentication
    if (!authenticated && selectedModel.type === "video") {
      setError("Video generation is only available for members. Please connect your wallet.");
      setShowAuthModal(true);
      return;
    }
    
    // Check generation limit for non-authenticated users
    const generationsNeeded = batchMode ? 4 : 1;
    if (!authenticated && getRemainingGenerations() < generationsNeeded) {
      setError(`Not enough free generations remaining.`);
      setShowAuthModal(true);
      return;
    }
    
    setIsGenerating(true);
    setError(null);

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
          n: (authenticated && batchMode) ? 4 : 1, // Only allow batch for authenticated users
        },
      });

      // Record generation for non-authenticated users
      if (!authenticated) {
        recordAnonGeneration(resp.jobId, 1); // Non-authenticated can't use batch mode
        setRemainingGens(getRemainingGenerations());
      }

      // Create placeholder and add to creations array IMMEDIATELY
      const jobPrompt = prompt.trim();
      const jobType = selectedModel.type === "video" ? "video" : "image";
      const batchSize = (authenticated && batchMode) ? 4 : 1;
      
      // Build params object for display (seed will be added when job completes)
      const jobParams = {
        width: selectedDimension.width,
        height: selectedDimension.height,
        steps: selectedModel?.settings?.steps ?? styles?.defaults.steps,
        cfgScale: selectedModel?.settings?.cfgScale ?? styles?.defaults.cfgScale,
        sampler: selectedModel?.settings?.sampler ?? styles?.defaults.sampler,
        scheduler: styles?.defaults.scheduler,
      };
      
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
        width: selectedDimension.width,
        height: selectedDimension.height,
        expectedGenerations: batchSize,
        params: jobParams, // Include full params for display
      };
      
      // Add placeholder and re-sort (generating jobs first)
      setCreations(prev => sortCreations([placeholder, ...prev.filter(c => c.jobId !== placeholder.jobId)]));
      
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
        width: selectedDimension.width,
        height: selectedDimension.height,
        expectedGenerations: batchSize,
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
              sampler: selectedModel?.settings?.sampler ?? styles?.defaults.sampler,
              scheduler: styles?.defaults.scheduler,
            },
            mediaUrls: [], // Empty - will be populated when job completes
          });
          console.log('Saved job to gallery:', resp.jobId);
        } catch (err) {
          console.error('Failed to save job to gallery:', err);
        }
      }

      // Clear prompt immediately - job store handles polling
      setPrompt("");
    } catch (err: any) {
      setError(err.message || "Failed to create job");
      setIsGenerating(false);
    }
  }, [prompt, selectedModel, selectedDimension, styles, address, isConnected, batchMode, addJob]);

  // Regenerate handler - creates new job with same seed and params
  const handleRegenerate = useCallback(async (creation: DisplayCreation) => {
    if (!creation.params?.seed) {
      setError("Cannot regenerate: no seed found");
      return;
    }
    
    const authenticated = isConnected && isAuthenticated();
    if (!authenticated) {
      setError("Please connect your wallet to regenerate");
      setShowAuthModal(true);
      return;
    }
    
    setRegeneratingJobId(creation.jobId);
    setError(null);
    
    // Find the correct model ID from styles config (display name -> API id)
    // The creation stores displayName but API needs the id
    let modelId = creation.modelId;
    if (styles?.models) {
      const matchingModel = styles.models.find(
        m => m.name === creation.modelName || m.name === creation.modelId || m.id === creation.modelId
      );
      if (matchingModel) {
        modelId = matchingModel.id;
      }
    }
    
    try {
      const resp = await createJob({
        modelId,
        prompt: creation.prompt,
        negativePrompt: "",
        nsfw: false,
        public: false, // Private by default
        walletAddress: address,
        mediaType: creation.type,
        sourceProcessing: "txt2img",
        params: {
          width: creation.params?.width || creation.width || 896,
          height: creation.params?.height || creation.height || 1152,
          steps: creation.params?.steps || 5,
          cfgScale: creation.params?.cfgScale || 1.5,
          sampler: creation.params?.sampler || "euler",
          scheduler: creation.params?.scheduler || "normal",
          seed: creation.params.seed, // Use the same seed!
          n: 1, // Single image regeneration
        },
      });

      // Create placeholder for the new regeneration
      const placeholder: DisplayCreation = {
        jobId: resp.jobId,
        modelId: creation.modelId,
        modelName: creation.modelName,
        prompt: creation.prompt,
        type: creation.type,
        createdAt: Date.now(),
        generations: [],
        tags: generateTagsFromPrompt(creation.prompt),
        walletAddress: address,
        isGenerating: true,
        progress: 0,
        status: 'queued',
        width: creation.params?.width || creation.width,
        height: creation.params?.height || creation.height,
        expectedGenerations: 1,
        params: {
          ...creation.params,
          seed: creation.params.seed,
        },
      };
      
      // Add placeholder and re-sort
      setCreations(prev => sortCreations([placeholder, ...prev.filter(c => c.jobId !== placeholder.jobId)]));
      
      // Add to job store for tracking
      addJob({
        jobId: resp.jobId,
        modelId: creation.modelId,
        modelName: creation.modelName,
        prompt: creation.prompt,
        type: creation.type,
        isNsfw: false,
        isPublic: false,
        walletAddress: address,
        width: creation.params?.width || creation.width,
        height: creation.params?.height || creation.height,
        expectedGenerations: 1,
      });
      
      // Save to database immediately
      try {
        await addToGallery({
          jobId: resp.jobId,
          modelId: creation.modelId,
          modelName: creation.modelName,
          prompt: creation.prompt,
          type: creation.type,
          isNsfw: false,
          isPublic: false,
          walletAddress: address,
          params: {
            width: creation.params?.width || creation.width,
            height: creation.params?.height || creation.height,
            steps: creation.params?.steps,
            cfgScale: creation.params?.cfgScale,
            sampler: creation.params?.sampler,
            scheduler: creation.params?.scheduler,
            seed: creation.params.seed,
          },
          mediaUrls: [],
        });
      } catch (err) {
        console.error('Failed to save regenerated job:', err);
      }
      
    } catch (err: any) {
      setError(err.message || "Failed to regenerate");
    } finally {
      setRegeneratingJobId(null);
    }
  }, [address, isConnected, addJob, styles]);

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
        <div className="flex flex-col md:flex-row md:items-stretch gap-6 mb-12">
          {/* Prompt Input */}
          <div className="flex-1 flex flex-col">
            <div className="relative flex-1">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your image..."
                disabled={isGenerating}
                className="w-full h-full min-h-[160px] bg-zinc-800/60 border border-zinc-700 rounded-2xl px-5 py-4 text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 resize-none disabled:opacity-50"
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
                    <span className="md:hidden">{trackedJob?.status === "processing" ? "..." : "..."}</span>
                    <span className="hidden md:inline">{trackedJob?.status === "processing" ? "Creating..." : "Finding worker..."}</span>
                  </span>
                ) : (
                  <>
                    <span className="md:hidden">Generate{batchMode ? ' ×4' : ''}</span>
                    <span className="hidden md:inline">Generate{batchMode ? ' 4 images' : ''} with {selectedModel?.name || 'AI'}</span>
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
            
            {/* Batch Mode */}
            <div className="mt-6 mb-6">
              <div 
                className={`relative ${!authenticated ? 'group' : ''}`}
                title={!authenticated ? "Connect your wallet to unlock batch generation" : ""}
              >
                <label className={`flex items-center gap-3 ${authenticated ? 'cursor-pointer' : 'cursor-not-allowed'} group-batch`}>
                  <div className="relative flex items-center">
                    <input
                      type="checkbox"
                      checked={batchMode}
                      onChange={(e) => authenticated && setBatchMode(e.target.checked)}
                      disabled={!authenticated}
                      className="sr-only peer"
                    />
                    <div className={`w-11 h-6 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${
                      authenticated 
                        ? 'bg-zinc-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-500/50 peer-checked:bg-indigo-600' 
                        : 'bg-zinc-800 opacity-40 cursor-not-allowed'
                    }`}></div>
                  </div>
                  <div className="flex-1">
                    <div className={`flex items-center gap-2 text-sm font-medium ${authenticated ? 'text-white' : 'text-zinc-500'}`}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1v-3z" />
                      </svg>
                      <span>Batch Mode</span>
                      {!authenticated && (
                        <svg className="w-3.5 h-3.5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    <p className={`text-xs mt-0.5 ${authenticated ? 'text-zinc-400' : 'text-zinc-500'}`}>
                      {authenticated ? 'Generate 4 images at once' : 'Connect wallet to unlock'}
                    </p>
                  </div>
                </label>
                
                {/* Hover tooltip for non-authenticated users */}
                {!authenticated && (
                  <div className="absolute inset-0 z-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <div className="absolute top-full left-0 right-0 mt-2 p-3 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl">
                      <p className="text-xs text-zinc-300 mb-2">
                        🚀 Batch Mode is a <span className="text-indigo-400 font-medium">member feature</span>
                      </p>
                      <p className="text-xs text-zinc-400">
                        Connect your wallet to generate 4 images at once!
                      </p>
                    </div>
                  </div>
                )}
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
              <div className="relative">
                <select 
                  className="w-full bg-transparent text-zinc-200 text-sm py-2 px-3 pr-8 rounded-lg hover:bg-zinc-700/50 cursor-pointer focus:outline-none appearance-none"
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
                <svg 
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none"
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Creations Grid - Masonry Style */}
        {creations.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Your Creations</h2>
            <Masonry
              breakpointCols={MASONRY_BREAKPOINTS}
              className="masonry-grid flex w-auto -ml-0.5"
              columnClassName="pl-0.5 bg-clip-padding"
            >
              {creations.map((creation) => (
                <CreationCard 
                  key={creation.jobId} 
                  creation={creation} 
                  onDelete={(jobId) => {
                    // Remove from local state
                    setCreations(prev => prev.filter(c => c.jobId !== jobId));
                    // Also remove from job store so it doesn't get re-added on refresh
                    useJobStore.getState().removeJob(jobId);
                  }}
                  onRegenerate={handleRegenerate}
                  isRegenerating={regeneratingJobId === creation.jobId}
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
