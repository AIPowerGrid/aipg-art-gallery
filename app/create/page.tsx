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

function CreatePageContent() {
  const { address, isConnected } = useAccount();
  const [styles, setStyles] = useState<StylesConfig | null>(null);
  const [prompt, setPrompt] = useState("");
  const [dimensionId, setDimensionId] = useState(3); // Default to square
  const [isGenerating, setIsGenerating] = useState(false);
  const [creations, setCreations] = useState<DisplayCreation[]>([]);
  const creationsRef = useRef<DisplayCreation[]>([]);
  // Keep ref in sync for use in effects
  useEffect(() => { creationsRef.current = creations; }, [creations]);
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
  
  // Watch for completed/faulted jobs in the store and update UI
  useEffect(() => {
    const completedJobs = jobs.filter(j => j.status === 'completed' && j.result?.generations?.length);
    const faultedJobs = jobs.filter(j => j.status === 'faulted');
    
    // Handle completed jobs
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
    
    // Handle faulted jobs
    faultedJobs.forEach(job => {
      setCreations(prev => prev.filter(c => c.jobId !== job.jobId));
    });
    
    // Reset isGenerating if no active jobs remain
    const hasActiveJobs = jobs.some(j => j.status === 'queued' || j.status === 'processing');
    if (!hasActiveJobs && isGenerating) {
      setIsGenerating(false);
    }
  }, [jobs, isGenerating]);

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
        width: job.width,
        height: job.height,
      }));
      
      if (address) {
        // Logged in - fetch from database
        try {
          const serverData = await fetchGalleryByWallet(address, 100);
          
          // Get current creations to preserve width/height (not stored in DB)
          const currentCreations = creationsRef.current;
          
          const serverCreations: DisplayCreation[] = serverData.items
            // Filter out items with no media (incomplete jobs)
            .filter((item: GalleryItem) => item.mediaUrls && item.mediaUrls.length > 0 && item.mediaUrls[0])
            .map((item: GalleryItem) => {
              // Preserve width/height from existing creation if available
              const existing = currentCreations.find(c => c.jobId === item.jobId);
              const jobFromStore = jobs.find(j => j.jobId === item.jobId);
              return {
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
              // Preserve dimensions from existing creation or job store (DB doesn't store these)
              width: existing?.width || jobFromStore?.width || item.params?.width,
              height: existing?.height || jobFromStore?.height || item.params?.height,
            }});
          
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
        width: selectedDimension.width,
        height: selectedDimension.height,
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
        width: selectedDimension.width,
        height: selectedDimension.height,
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

      // Clear prompt immediately - job store handles polling
      setPrompt("");
    } catch (err: any) {
      setError(err.message || "Failed to create job");
      setIsGenerating(false);
    }
  }, [prompt, selectedModel, selectedDimension, styles, address, isConnected]);

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
                    <span className="md:hidden">{trackedJob?.status === "processing" ? "..." : "..."}</span>
                    <span className="hidden md:inline">{trackedJob?.status === "processing" ? "Creating..." : "Finding worker..."}</span>
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
              className="masonry-grid flex w-auto -ml-0.5"
              columnClassName="pl-0.5 bg-clip-padding"
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
