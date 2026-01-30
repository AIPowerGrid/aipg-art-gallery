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
  const creationsRef = useRef<DisplayCreation[]>([]);
  // Keep ref in sync for use in effects
  useEffect(() => { creationsRef.current = creations; }, [creations]);
  const [error, setError] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [remainingGens, setRemainingGens] = useState(GENERATION_LIMIT);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  
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
  
  // Sync active jobs to creations - add placeholders for new jobs
  useEffect(() => {
    const activeJobsFromStore = getActiveJobs();
    
    setCreations(prev => {
      // Find jobs that don't have creations yet
      const existingJobIds = new Set(prev.map(c => c.jobId));
      const newJobs = activeJobsFromStore.filter(job => !existingJobIds.has(job.jobId));
      
      if (newJobs.length === 0) return prev;
      
      // Add placeholders for new jobs
      const newPlaceholders: DisplayCreation[] = newJobs.map(job => ({
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
        progress: 0,
        status: job.status,
        width: job.width,
        height: job.height,
        expectedGenerations: job.expectedGenerations,
      }));
      
      return sortCreations([...newPlaceholders, ...prev]);
    });
  }, [jobs, getActiveJobs]);
  
  // Sync tracked job progress to the creation card
  useEffect(() => {
    if (trackedJob) {
      setCreations(prev => prev.map(c => {
        if (c.jobId === trackedJob.jobId && c.isGenerating) {
          return { 
            ...c, 
            progress: jobProgress, 
            queuePosition: trackedJob.queuePosition, 
            status: trackedJob.status,
          };
        }
        return c;
      }));
    }
  }, [trackedJob, jobProgress]);
  
  // Watch for completed/faulted jobs in the store and update UI
  useEffect(() => {
    const completedJobs = jobs.filter(j => j.status === 'completed' && j.result?.generations?.length);
    const faultedJobs = jobs.filter(j => j.status === 'faulted');
    
    // Handle completed jobs - update their creations with media
    completedJobs.forEach(job => {
      setCreations(prev => {
        // Check if this job already has a creation that needs updating
        const hasCreation = prev.some(c => c.jobId === job.jobId);
        let updated: DisplayCreation[];
        
        if (!hasCreation) {
          // Job completed but no placeholder exists - add it directly
          const newCreation: DisplayCreation = {
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
          };
          updated = [newCreation, ...prev];
        } else {
          // Update existing creation
          updated = prev.map(c => {
            if (c.jobId === job.jobId) {
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
          });
        }
        
        // Always re-sort after completion changes
        return sortCreations(updated);
      });
    });
    
    // Handle faulted jobs - remove them
    faultedJobs.forEach(job => {
      setCreations(prev => prev.filter(c => c.jobId !== job.jobId));
    });
    
    // Reset isGenerating flag if no active jobs remain
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

  // Load creations on mount and when address changes
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
        expectedGenerations: job.expectedGenerations,
      }));
      
      const authenticated = address && isAuthenticated();
      
      if (authenticated) {
        // Logged in - fetch ONLY from server, no localStorage
        try {
          const serverData = await fetchGalleryByWallet(address, 100);
          
          const serverCreations: DisplayCreation[] = serverData.items
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
            }));
          
          // Merge: active placeholders + server data
          const activeJobIds = new Set(activePlaceholders.map(p => p.jobId));
          const filteredServer = serverCreations.filter(c => !activeJobIds.has(c.jobId));
          const merged = [...activePlaceholders, ...filteredServer];
          
          setCreations(sortCreations(merged));
        } catch (err) {
          console.error("Failed to load creations from server:", err);
          setCreations(activePlaceholders);
        }
      } else if (!address) {
        // Anonymous - use localStorage
        const stored = getStoredCreations();
        const activeJobIds = new Set(activePlaceholders.map(p => p.jobId));
        const filteredStored: DisplayCreation[] = stored
          .filter(c => !activeJobIds.has(c.jobId))
          .map(c => ({ ...c, isGenerating: false }));
        const merged = [...activePlaceholders, ...filteredStored];
        
        setCreations(sortCreations(merged));
      }
    }
    loadCreations();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]); // Only run on mount and address change

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
