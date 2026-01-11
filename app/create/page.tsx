"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { createJob, fetchJobStatus, fetchModels, addToGallery, fetchGalleryMedia } from "@/lib/api";
import { Header } from "@/components/header";
import { 
  saveJob, 
  StoredJob, 
  saveCreation, 
  getStoredCreations, 
  removeCreation,
  StoredCreation,
  generateTagsFromPrompt,
  getActiveJobs,
  saveActiveJob,
  updateActiveJob,
  removeActiveJob,
  ActiveJob
} from "@/lib/storage";
import { useAccount } from "wagmi";
import { downloadMedia, getMediaFilename } from "@/lib/utils/download";
import {
  CreateJobRequest,
  GalleryModel,
  GenerationView,
  JobStatus,
} from "@/types/models";

type JobEntry = {
  jobId: string;
  submittedAt: number;
  status: JobStatus | null;
  error?: string;
};

type ModelTypeFilter = "all" | "image" | "video";

// Disable SSR for this page since it uses wagmi hooks
export const dynamic = 'force-dynamic';

// Wrapper component to ensure we only use wagmi after mounting
export default function CreatePage() {
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
  
  return <CreatePageClient />;
}

function CreatePageClient() {
  const { address } = useAccount();
  const [models, setModels] = useState<GalleryModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [chainSource, setChainSource] = useState(false);
  const [modelTypeFilter, setModelTypeFilter] = useState<ModelTypeFilter>("all");
  const [selectedModelId, setSelectedModelId] = useState<string>();
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [nsfw, setNsfw] = useState(false);
  const [sharePublicly, setSharePublicly] = useState(true);
  const [seed, setSeed] = useState("");
  const [params, setParams] = useState<Record<string, number | boolean>>({});
  const [uploadImage, setUploadImage] = useState<string | undefined>(undefined);
  const [uploadMask, setUploadMask] = useState<string | undefined>(undefined);
  const [sourceProcessing, setSourceProcessing] = useState<
    "txt2img" | "img2img" | "inpainting" | "txt2video" | "img2video"
  >("txt2img");
  const [jobs, setJobs] = useState<JobEntry[]>([]);
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [creations, setCreations] = useState<StoredCreation[]>([]);
  
  // Load saved creations on mount
  useEffect(() => {
    setCreations(getStoredCreations());
  }, []);
  
  // Organize models by type
  const imageModels = useMemo(() => models.filter(m => m.type === "image"), [models]);
  const videoModels = useMemo(() => models.filter(m => m.type === "video"), [models]);
  const filteredModels = useMemo(() => {
    if (modelTypeFilter === "image") return imageModels;
    if (modelTypeFilter === "video") return videoModels;
    return models;
  }, [models, imageModels, videoModels, modelTypeFilter]);
  
  // Sort models alphabetically descending (Z-A)
  const sortedFilteredModels = useMemo(() => {
    return [...filteredModels].sort((a, b) => 
      b.displayName.toLowerCase().localeCompare(a.displayName.toLowerCase())
    );
  }, [filteredModels]);

  useEffect(() => {
    const run = async () => {
      try {
        setIsLoadingModels(true);
        const data = await fetchModels();
        setModels(data.models);
        setChainSource(data.chainSource ?? false);
        if (data.models.length > 0) {
          setSelectedModelId(data.models[0].id);
          setParams(fromDefaults(data.models[0]));
        }
      } catch (err: any) {
        setError(err.message ?? "Failed to load models");
      } finally {
        setIsLoadingModels(false);
      }
    };
    run();
  }, []);

  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId),
    [models, selectedModelId]
  );

  const capabilityHint = selectedModel?.capabilities?.includes("txt2video")
    ? "text-to-video"
    : selectedModel?.capabilities?.includes("txt2img")
    ? "text-to-image"
    : "img2img";

  function fromDefaults(model: GalleryModel): Record<string, number | boolean> {
    return {
      width: model.defaults.width ?? 1024,
      height: model.defaults.height ?? 1024,
      steps: model.defaults.steps ?? 20,
      cfgScale: model.defaults.cfgScale ?? 4,
      sampler: 0,
      scheduler: 0,
      denoise: model.defaults.denoise ?? 1,
      length: model.defaults.length ?? 80,
      fps: model.defaults.fps ?? 16,
      tiling: model.defaults.tiling ?? false,
      hiresFix: model.defaults.hiresFix ?? false,
    };
  }

  function handleModelChange(modelId: string) {
    setSelectedModelId(modelId);
    const model = models.find((m) => m.id === modelId);
    if (model) {
      setParams(fromDefaults(model));
      // Reset sourceProcessing based on model type
      if (model.type === "video") {
        setSourceProcessing("txt2video");
      } else {
        setSourceProcessing("txt2img");
      }
    }
  }

  async function handleSubmit() {
    if (!selectedModel) {
      setError("No model selected");
      return;
    }
    if (!prompt.trim()) {
      setError("Prompt is required");
      return;
    }
    

    setError(undefined);
    setIsSubmitting(true);

    // Auto-enable tiling when sharing to gallery
    const enableTiling = sharePublicly || Boolean(params.tiling);

    const payload: CreateJobRequest = {
      modelId: selectedModel.id,
      prompt,
      negativePrompt,
      nsfw,
      public: sharePublicly,
      walletAddress: address, // Include wallet address if connected
      mediaType: selectedModel.type,
      sourceProcessing: sourceProcessing,
      params: {
        width: Number(params.width) || undefined,
        height: Number(params.height) || undefined,
        steps: Number(params.steps) || undefined,
        cfgScale: Number(params.cfgScale) || undefined,
        sampler: selectedModel.defaults.sampler || selectedModel.samplers?.[0],
        scheduler: selectedModel.defaults.scheduler || selectedModel.schedulers?.[0],
        seed: seed || undefined,
        denoise: Number(params.denoise) || undefined,
        length: selectedModel.type === "video" ? (Number(params.length) || undefined) : undefined,
        fps: selectedModel.type === "video" ? (Number(params.fps) || undefined) : undefined,
        tiling: enableTiling,
        hiresFix: Boolean(params.hiresFix),
      },
    };

    // Add source image for img2img/img2video/inpainting modes
    const needsSourceImage = ["img2img", "img2video", "inpainting"].includes(sourceProcessing);
    if (needsSourceImage && uploadImage) {
      payload.sourceImage = uploadImage;
    }
    if (sourceProcessing === "inpainting" && uploadMask) {
      payload.sourceMask = uploadMask;
    }


    try {
      const resp = await createJob(payload);
      const entry: JobEntry = {
        jobId: resp.jobId,
        submittedAt: Date.now(),
        status: null,
      };
      setJobs((prev) => [entry, ...prev]);
      pollStatus(resp.jobId);
    } catch (err: any) {
      console.error("Job creation failed:", err);
      const errorMessage = err.message ?? "Failed to create job";
      // Provide helpful error messages
      if (errorMessage.includes("fetch") || errorMessage.includes("network")) {
        setError("Cannot connect to the gallery server. Make sure the server is running on port 4000.");
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function pollStatus(jobId: string) {
    let attempts = 0;
    let rateLimitBackoff = 0;
    const BASE_INTERVAL = 7000; // 7 seconds to stay under 10/min rate limit
    
    const poll = async () => {
      attempts += 1;
      try {
        const status = await fetchJobStatus(jobId);
        rateLimitBackoff = 0; // Reset backoff on success
        
        setJobs((prev) =>
          prev.map((job) =>
            job.jobId === jobId
              ? {
                  ...job,
                  status,
                  error: undefined, // Clear any previous rate limit error
                }
              : job
          )
        );
        
        // Update active job status in localStorage
        updateActiveJob(jobId, {
          status: status.status,
          error: undefined,
        });
        
        // Save completed job to local history and creations
        if (status.status === "completed" && status.generations.length > 0) {
          saveJobToHistory(jobId, selectedModel!, status);
          // Remove from active jobs once completed
          removeActiveJob(jobId);
        }
        
        if (
          status.status === "completed" ||
          status.status === "faulted" ||
          attempts > 60
        ) {
          // Remove from active jobs if faulted or max attempts reached
          if (status.status === "faulted" || attempts > 60) {
            removeActiveJob(jobId);
          }
          return;
        }
        setTimeout(poll, BASE_INTERVAL);
      } catch (err: any) {
        const isRateLimit = err.message?.includes("429") || err.message?.includes("per 1 minute");
        
        if (isRateLimit) {
          // Exponential backoff for rate limits: 15s, 30s, 60s max
          rateLimitBackoff = Math.min(rateLimitBackoff + 1, 3);
          const waitTime = 15000 * rateLimitBackoff;
          
          setJobs((prev) =>
            prev.map((job) =>
              job.jobId === jobId
                ? {
                    ...job,
                    error: `Rate limited, retrying in ${waitTime / 1000}s...`,
                  }
                : job
            )
          );
          
          // Continue polling after backoff
          if (attempts < 60) {
            setTimeout(poll, waitTime);
          }
        } else {
          // Non-rate-limit error - stop polling
          setJobs((prev) =>
            prev.map((job) =>
              job.jobId === jobId
                ? {
                    ...job,
                    error: err.message,
                  }
                : job
            )
          );
          
          // Update active job error in localStorage
          updateActiveJob(jobId, {
            error: err.message,
          });
        }
      }
    };
    poll();
  }

  // Load active jobs on mount and resume polling
  useEffect(() => {
    const activeJobs = getActiveJobs();
    if (activeJobs.length > 0) {
      // Convert ActiveJob[] to JobEntry[] and resume polling
      const jobEntries: JobEntry[] = activeJobs.map(aj => ({
        jobId: aj.jobId,
        submittedAt: aj.submittedAt,
        status: aj.status ? {
          jobId: aj.jobId,
          status: aj.status,
          faulted: aj.status === 'faulted',
          waitTime: 0,
          queuePosition: 0,
          processing: aj.status === 'processing' ? 1 : 0,
          finished: aj.status === 'completed' ? 1 : 0,
          waiting: aj.status === 'queued' ? 1 : 0,
          generations: [],
        } : null,
        error: aj.error,
      }));
      setJobs(jobEntries);
      
      // Resume polling for incomplete jobs
      activeJobs.forEach(aj => {
        if (aj.status !== 'completed' && aj.status !== 'faulted') {
          pollStatus(aj.jobId);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  async function saveJobToHistory(
    jobId: string,
    model: GalleryModel,
    status: JobStatus
  ) {
    // Save job metadata to localStorage for "My Creations" (local backup)
    const storedJob: StoredJob = {
      jobId,
      modelId: model.id,
      modelName: model.displayName,
      prompt,
      negativePrompt: negativePrompt || undefined,
      isPublic: sharePublicly,
      isNsfw: nsfw,
      createdAt: Date.now(),
      type: model.type,
      walletAddress: address,
    };
    
    saveJob(storedJob);
    
    // Save creation with media for persistent display
    const tags = generateTagsFromPrompt(prompt);
    const creation: StoredCreation = {
      jobId,
      modelId: model.id,
      modelName: model.displayName,
      prompt,
      type: model.type,
      createdAt: Date.now(),
      generations: status.generations.map(gen => ({
        id: gen.id,
        seed: gen.seed,
        kind: gen.kind,
        url: gen.url,
        base64: gen.base64,
        workerName: gen.workerName,
      })),
      tags,
      walletAddress: address,
    };
    
    saveCreation(creation);
    setCreations(prev => [creation, ...prev.filter(c => c.jobId !== jobId)]);
    console.log("Creation saved with tags:", tags);
    
    // If wallet is connected, save to server gallery (with public/private flag)
    // This enables cross-device access via wallet address
    if (address) {
      try {
        await addToGallery({
          jobId,
          modelId: model.id,
          modelName: model.displayName,
          prompt,
          negativePrompt: negativePrompt || undefined,
          type: model.type,
          isNsfw: nsfw,
          isPublic: sharePublicly,
          walletAddress: address,
          params: {
            width: typeof params.width === 'number' ? params.width : undefined,
            height: typeof params.height === 'number' ? params.height : undefined,
            steps: typeof params.steps === 'number' ? params.steps : undefined,
            cfgScale: typeof params.cfgScale === 'number' ? params.cfgScale : undefined,
            sampler: typeof params.sampler === 'number' ? (model.samplers[params.sampler] || undefined) : undefined,
            scheduler: typeof params.scheduler === 'number' ? (model.schedulers[params.scheduler] || undefined) : undefined,
            seed: params.seed && typeof params.seed === 'number' ? String(params.seed) : undefined,
            denoise: typeof params.denoise === 'number' ? params.denoise : undefined,
            length: typeof params.length === 'number' ? params.length : undefined,
            fps: typeof params.fps === 'number' ? params.fps : undefined,
            tiling: typeof params.tiling === 'boolean' ? params.tiling : undefined,
            hiresFix: typeof params.hiresFix === 'boolean' ? params.hiresFix : undefined,
          },
        });
      } catch (err) {
        // Silently fail - gallery save is optional
      }
    }
  }

  function updateParam(key: string, value: number | boolean) {
    setParams((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function handleFileUpload(
    event: React.ChangeEvent<HTMLInputElement>,
    setter: (value: string | undefined) => void
  ) {
    const file = event.target.files?.[0];
    if (!file) {
      setter(undefined);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setter(reader.result?.toString());
    };
    reader.readAsDataURL(file);
  }

  return (
    <main className="flex-1 w-full min-h-screen bg-black">
      <Header />

      <div className="max-w-[1920px] mx-auto px-6 md:px-12 py-8 space-y-8">
        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
            AIPG Art Gallery
          </h1>
          <p className="text-white/50 text-sm">
            Create
          </p>
        </div>

        {error && (
          <div className="panel border border-red-500/40 text-red-200">
            {error}
          </div>
        )}

        {/* Quick Start Guide */}
        <div className="panel bg-gradient-to-r from-orange-500/10 to-yellow-500/10 border-orange-500/20">
        <div className="flex items-start gap-4">
          <span className="text-2xl">💡</span>
          <div className="space-y-2 text-sm">
            <p className="font-medium text-white">How to create</p>
            <ol className="list-decimal list-inside space-y-1 text-white/70">
              <li><strong>Choose a model</strong> — Image models (🖼️) create still images, Video models (🎬) create short clips</li>
              <li><strong>Describe what you want</strong> — Be specific: "a cyberpunk city at night with neon lights" works better than "city"</li>
              <li><strong>Click Generate</strong> — Your job joins the queue and workers will process it</li>
            </ol>
            <p className="text-white/50 text-xs mt-2">
              Tip: Models with more workers ({selectedModel?.onlineWorkers || 0} for current selection) process faster. Check the model description for best results.
            </p>
          </div>
        </div>
      </div>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div className="panel space-y-6">
            {/* Step 1: Model Selection */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 text-xs font-bold">1</span>
                <span className="text-sm font-medium text-white/80">Choose a Model</span>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                {/* Model Type Filter */}
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-[0.3em] text-white/50">
                    Type
                  </label>
                  <select
                    value={modelTypeFilter}
                    onChange={(e) => setModelTypeFilter(e.target.value as ModelTypeFilter)}
                    className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2.5"
                  >
                    <option value="all">All Models ({models.length})</option>
                    <option value="image">🖼️ Image Models ({imageModels.length})</option>
                    <option value="video">🎬 Video Models ({videoModels.length})</option>
                  </select>
                </div>

                {/* Model Dropdown */}
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-[0.3em] text-white/50">
                    Model
                  </label>
                  {isLoadingModels ? (
                    <div className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2.5 text-white/50">
                      Loading models…
                    </div>
                  ) : filteredModels.length === 0 ? (
                    <div className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2.5 text-white/50">
                      {models.length === 0 
                        ? "No models available"
                        : `No ${modelTypeFilter} models`
                      }
                    </div>
                  ) : (
                    <select
                      value={selectedModelId ?? ""}
                      onChange={(e) => handleModelChange(e.target.value)}
                      className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2.5"
                    >
                      {sortedFilteredModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.type === "video" ? "🎬 " : "🖼️ "}
                          {model.displayName}
                          {model.onChain ? " ✓" : ""}
                          {` (${model.onlineWorkers} workers)`}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </div>

            {selectedModel && (
              <>
                <div className="rounded-2xl border border-white/10 p-4 bg-white/5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs uppercase tracking-[0.5em] text-white/50">
                      {capabilityHint}
                    </p>
                    {selectedModel.onChain && (
                      <span className="flex items-center gap-1 text-xs text-green-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
                        On-Chain Verified
                      </span>
                    )}
                  </div>
                  <p className="text-white/90">{selectedModel.description}</p>
                  <div className="flex flex-wrap gap-2 mt-3 text-xs text-white/60">
                    {selectedModel.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-3 py-1 rounded-full border border-white/10"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  {selectedModel.constraints && (
                    <div className="mt-3 pt-3 border-t border-white/10 text-xs text-white/50">
                      <span className="uppercase tracking-[0.2em]">Chain Limits: </span>
                      {selectedModel.constraints.stepsMax && (
                        <span className="mr-3">Steps: {selectedModel.constraints.stepsMin}-{selectedModel.constraints.stepsMax}</span>
                      )}
                      {selectedModel.constraints.cfgMax && (
                        <span>CFG: {selectedModel.constraints.cfgMin}-{selectedModel.constraints.cfgMax}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Step 2: Prompt */}
                <div className="flex items-center gap-2 mt-4">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 text-xs font-bold">2</span>
                  <span className="text-sm font-medium text-white/80">Describe What You Want</span>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs uppercase tracking-[0.3em] text-white/50">Positive Prompt</label>
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Example: A majestic mountain landscape at golden hour, with snow-capped peaks reflecting in a crystal clear lake..."
                      className="min-h-[140px] w-full rounded-2xl bg-black/30 border border-white/10 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                    />
                    <p className="text-xs text-white/40">Be descriptive — include style, lighting, colors, and mood</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs uppercase tracking-[0.3em] text-white/50">Negative Prompt</label>
                    <textarea
                      value={negativePrompt}
                      onChange={(e) => setNegativePrompt(e.target.value)}
                      placeholder="Things to avoid: blurry, low quality, distorted..."
                      className="min-h-[140px] w-full rounded-2xl bg-black/30 border border-white/10 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-white/30"
                    />
                    <p className="text-xs text-white/40">Optional — exclude unwanted elements</p>
                  </div>
                </div>

                {/* Advanced Options Collapsible */}
                <AdvancedOptions
                  model={selectedModel}
                  params={params}
                  onParamChange={updateParam}
                  seed={seed}
                  setSeed={setSeed}
                  sourceProcessing={sourceProcessing}
                  setSourceProcessing={setSourceProcessing}
                  uploadImage={uploadImage}
                  setUploadImage={setUploadImage}
                  uploadMask={uploadMask}
                  setUploadMask={setUploadMask}
                  nsfw={nsfw}
                  setNsfw={setNsfw}
                  sharePublicly={sharePublicly}
                  setSharePublicly={setSharePublicly}
                  handleFileUpload={handleFileUpload}
                />

                {/* Step 3: Generate */}
                <div className="flex items-center gap-2 mt-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 text-xs font-bold">3</span>
                  <span className="text-sm font-medium text-white/80">Generate</span>
                </div>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || !selectedModel || !prompt.trim()}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-orange-500 to-yellow-400 text-black font-semibold shadow-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {isSubmitting ? "Submitting…" : prompt.trim() ? "Generate" : "Enter a prompt to generate"}
                </button>
              </>
            )}
          </div>
        </div>

        <aside className="space-y-6">
          <div className="panel space-y-4">
            <h3 className="text-sm uppercase tracking-[0.3em] text-white/50">
              Your Jobs
            </h3>
            <div className="space-y-4 max-h-[320px] overflow-auto pr-2">
              {jobs.length === 0 ? (
                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-3 text-white/60">
                    <span className="text-lg">📋</span>
                    <span>Your generations will appear here</span>
                  </div>
                  <div className="space-y-2 text-xs text-white/40 border-t border-white/10 pt-3">
                    <p className="font-medium text-white/50">What to expect:</p>
                    <ul className="space-y-1">
                      <li className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-yellow-500/50" />
                        <span><strong className="text-yellow-400/70">Queued</strong> — Waiting for a worker</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500/50 animate-pulse" />
                        <span><strong className="text-blue-400/70">Processing</strong> — Being generated</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500/50" />
                        <span><strong className="text-green-400/70">Completed</strong> — Ready to view</span>
                      </li>
                    </ul>
                  </div>
                </div>
              ) : (
                jobs.map((job) => (
                  <JobCard job={job} key={job.jobId} />
                ))
              )}
            </div>
          </div>
          
          {/* Your Created Content - persisted thumbnails */}
          <CreatedContentCard 
            creations={creations} 
            onRemove={(jobId) => {
              removeCreation(jobId);
              setCreations(prev => prev.filter(c => c.jobId !== jobId));
            }}
          />
        </aside>
      </section>
      </div>
    </main>
  );
}


type ParamGridProps = {
  model: GalleryModel;
  params: Record<string, number | boolean>;
  onParamChange: (key: string, value: number | boolean) => void;
};

function AdvancedOptions({
  model,
  params,
  onParamChange,
  seed,
  setSeed,
  sourceProcessing,
  setSourceProcessing,
  uploadImage,
  setUploadImage,
  uploadMask,
  setUploadMask,
  nsfw,
  setNsfw,
  sharePublicly,
  setSharePublicly,
  handleFileUpload,
}: {
  model: GalleryModel;
  params: Record<string, number | boolean>;
  onParamChange: (key: string, value: number | boolean) => void;
  seed: string;
  setSeed: (value: string) => void;
  sourceProcessing: "txt2img" | "img2img" | "inpainting" | "txt2video" | "img2video";
  setSourceProcessing: (value: "txt2img" | "img2img" | "inpainting" | "txt2video" | "img2video") => void;
  uploadImage: string | undefined;
  setUploadImage: (value: string | undefined) => void;
  uploadMask: string | undefined;
  setUploadMask: (value: string | undefined) => void;
  nsfw: boolean;
  setNsfw: (value: boolean) => void;
  sharePublicly: boolean;
  setSharePublicly: (value: boolean) => void;
  handleFileUpload: (event: React.ChangeEvent<HTMLInputElement>, setter: (value: string | undefined) => void) => void;
}) {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  const slider = (
    key: string,
    label: string,
    range?: { min: number; max: number; step: number },
    suffix?: string
  ) => {
    if (!range) return null;
    return (
      <div key={key} className="space-y-2">
        <div className="flex justify-between text-xs text-white/60">
          <span className="uppercase tracking-[0.3em]">{label}</span>
          <span>{params[key] ?? range.min}</span>
        </div>
        <input
          type="range"
          min={range.min}
          max={range.max}
          step={range.step}
          value={Number(params[key]) ?? range.min}
          onChange={(e) => onParamChange(key, Number(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-[11px] text-white/40">
          <span>
            {range.min}
            {suffix}
          </span>
          <span>
            {range.max}
            {suffix}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="border border-white/10 rounded-2xl overflow-hidden bg-black/20 mt-4">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-orange-500/30 rounded-t-2xl"
        aria-expanded={isOpen}
        aria-controls="advanced-options-content"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white/80">Advanced Options</span>
          <span className="text-xs text-yellow-400/70 bg-yellow-400/10 px-2 py-0.5 rounded">May cause longer loading times</span>
        </div>
        <svg
          className={`w-5 h-5 text-white/60 transition-transform duration-200 flex-shrink-0 ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {isOpen ? (
        <div id="advanced-options-content" className="px-4 pb-4 pt-4 space-y-6 border-t border-white/10">
          <ParamGrid model={model} params={params} onParamChange={onParamChange} />
          
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs text-white/60 uppercase tracking-[0.3em]">
                Seed
              </label>
              <input
                type="text"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                placeholder="Random"
                className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-white/60 uppercase tracking-[0.3em]">
                Mode
              </label>
              <select
                value={sourceProcessing}
                onChange={(e) =>
                  setSourceProcessing(e.target.value as any)
                }
                className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
              >
                {model?.type === "video" ? (
                  <>
                    <option value="txt2video">Text to Video</option>
                    {model.capabilities?.includes("img2video") && (
                      <option value="img2video">Image to Video</option>
                    )}
                  </>
                ) : (
                  <>
                    <option value="txt2img">Text to Image</option>
                    <option value="img2img">Image to Image</option>
                    <option value="inpainting">Inpainting</option>
                  </>
                )}
              </select>
            </div>
          </div>

          {["img2img", "img2video", "inpainting"].includes(sourceProcessing) && (
            <div className="grid md:grid-cols-2 gap-4">
              <FileInput
                label="Reference image"
                onChange={(e) => handleFileUpload(e, setUploadImage)}
              />
              {sourceProcessing === "inpainting" && (
                <FileInput
                  label="Mask"
                  onChange={(e) => handleFileUpload(e, setUploadMask)}
                />
              )}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4 text-white/80">
            <Toggle
              label="Allow NSFW"
              enabled={nsfw}
              onChange={setNsfw}
            />
            <Toggle
              label="Share to gallery"
              enabled={sharePublicly}
              onChange={setSharePublicly}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ParamGrid({ model, params, onParamChange }: ParamGridProps) {
  const slider = (
    key: string,
    label: string,
    range?: { min: number; max: number; step: number },
    suffix?: string
  ) => {
    if (!range) return null;
    return (
      <div key={key} className="space-y-2">
        <div className="flex justify-between text-xs text-white/60">
          <span className="uppercase tracking-[0.3em]">{label}</span>
          <span>{params[key] ?? range.min}</span>
        </div>
        <input
          type="range"
          min={range.min}
          max={range.max}
          step={range.step}
          value={Number(params[key]) ?? range.min}
          onChange={(e) => onParamChange(key, Number(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-[11px] text-white/40">
          <span>
            {range.min}
            {suffix}
          </span>
          <span>
            {range.max}
            {suffix}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {slider("width", "WIDTH", model.limits.width, "px")}
      {slider("height", "HEIGHT", model.limits.height, "px")}
      {slider("steps", "STEPS", model.limits.steps)}
      {slider("cfgScale", "CFG", model.limits.cfgScale)}
      {slider("length", "FRAMES", model.limits.length)}
      {slider("fps", "FPS", model.limits.fps)}
    </div>
  );
}

function Toggle({
  enabled,
  onChange,
  label,
}: {
  enabled: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={`p-4 rounded-2xl border text-left transition ${
        enabled
          ? "border-white/40 bg-white/10 text-white"
          : "border-white/10 text-white/60 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

function FileInput({
  label,
  onChange,
}: {
  label: string;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs uppercase tracking-[0.3em] text-white/60">
        {label}
      </span>
      <input
        type="file"
        accept="image/*"
        onChange={onChange}
        className="w-full rounded-xl bg-black/30 border border-dashed border-white/20 px-3 py-6 text-center"
      />
    </label>
  );
}

function JobCard({ job }: { job: JobEntry }) {
  const status = job.status;
  const outputs = status?.generations ?? [];
  
  // Calculate progress info
  const isQueued = status?.status === "queued" || (!status?.status && !status?.processing);
  const isProcessing = status?.status === "processing" || (status?.processing ?? 0) > 0;
  const queuePosition = status?.queuePosition ?? 0;
  const waitTime = status?.waitTime ?? 0;
  
  // Get worker name from any generation that has it (check all generations, not just first)
  // Worker info may be available during processing even before generation completes
  const workerName = outputs.find(gen => gen.workerName)?.workerName;
  const workerId = outputs.find(gen => gen.workerId)?.workerId;
  
  // For now, VRAM is not available in the API response
  // This can be populated later if the API provides worker details
  const workerVram = undefined; // TODO: Fetch from worker details API if available

  return (
    <div className="border border-white/10 rounded-2xl p-4 bg-black/40 space-y-3">
      {/* Status badge */}
      <span
        className={`inline-block px-3 py-1 rounded-full text-xs ${
          status?.status === "completed"
            ? "bg-green-500/20 text-green-200"
            : status?.status === "faulted"
            ? "bg-red-500/20 text-red-200"
            : isProcessing
            ? "bg-blue-500/20 text-blue-200 animate-pulse"
            : "bg-yellow-500/20 text-yellow-200"
        }`}
      >
        {status?.status === "completed" ? "✓ Completed" 
          : status?.status === "faulted" ? "✗ Failed"
          : isProcessing ? "⚡ Processing"
          : "⏳ Queued"}
      </span>
      
      {/* Job ID - always show full */}
      <div className="space-y-1">
        <p className="text-xs text-white/40">Job ID</p>
        <p 
          className="font-mono text-xs text-white/70 break-all bg-black/30 rounded px-2 py-1 select-all cursor-pointer hover:bg-black/50 transition-colors"
          onClick={() => {
            navigator.clipboard.writeText(job.jobId);
          }}
          title="Click to copy"
        >
          {job.jobId}
        </p>
      </div>
      
      {/* Worker - show prominently, especially during processing */}
      {workerName ? (
        <div className="space-y-1">
          <p className="text-xs text-white/40">Worker</p>
          <p 
            className="font-mono text-xs text-white/70 break-all bg-black/30 rounded px-2 py-1 select-all cursor-pointer hover:bg-black/50 transition-colors"
            onClick={() => {
              navigator.clipboard.writeText(workerName);
            }}
            title="Click to copy"
          >
            {workerName}
          </p>
        </div>
      ) : isProcessing ? (
        <div className="space-y-1">
          <p className="text-xs text-white/40">Worker</p>
          <p className="text-xs text-white/50 italic">Assigning worker...</p>
        </div>
      ) : null}
      
      {/* Progress info for queued/processing jobs */}
      {!status?.status || (status?.status !== "completed" && status?.status !== "faulted") ? (
        <div className="space-y-2">
          {isQueued && queuePosition > 0 && (
            <div className="flex items-center justify-between text-xs text-white/50">
              <span>Queue Position</span>
              <span className="text-white/70">#{queuePosition}</span>
            </div>
          )}
          {waitTime > 0 && (
            <div className="flex items-center justify-between text-xs text-white/50">
              <span>Est. Wait</span>
              <span className="text-white/70">{Math.ceil(waitTime)}s</span>
            </div>
          )}
          {isProcessing && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-white/50">
                <span>Processing</span>
                <span className="text-blue-300">{status?.processing ?? 1} active</span>
              </div>
              {/* Show worker info prominently during processing */}
              {workerName && (
                <div className="flex items-center justify-between text-xs text-white/60 bg-blue-500/10 rounded px-2 py-1 mt-1">
                  <span className="text-cyan-400">Worker:</span>
                  <span className="font-mono text-cyan-300">{workerName}</span>
                  {workerVram && (
                    <span className="text-white/50 ml-2">({workerVram}GB VRAM)</span>
                  )}
                </div>
              )}
              <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 rounded-full animate-pulse" 
                  style={{ width: '60%' }}
                />
              </div>
            </div>
          )}
        </div>
      ) : null}
      
      {job.error && (
        <p className="text-xs text-red-300">Error: {job.error}</p>
      )}
      {outputs.length > 0 && (
        <div className="grid gap-2">
          {outputs.map((generation) => (
            <GenerationPreview key={generation.id} generation={generation} jobId={job.jobId} />
          ))}
        </div>
      )}
    </div>
  );
}

function GenerationPreview({ generation, jobId }: { generation: GenerationView; jobId: string }) {
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  // Determine the best source for the media
  const imageSrc = generation.base64 || generation.url;
  const isVideo = generation.kind === "video";
  
  
  const handleDownload = () => {
    const downloadUrl = generation.url || generation.base64;
    if (!downloadUrl) return;
    const filename = getMediaFilename(jobId, generation.id, isVideo);
    downloadMedia(downloadUrl, filename);
  };

  // Only render video if explicitly marked as video AND has video URL
  if (isVideo && generation.url) {
    return (
      <div className="relative rounded-xl border border-white/10 overflow-hidden bg-black/40 group">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="animate-spin w-6 h-6 border-2 border-white/30 border-t-white rounded-full" />
          </div>
        )}
        {error ? (
          <div className="p-4 text-center text-white/50">
            <p className="text-sm">Video failed to load</p>
            {generation.url && (
              <a
                href={generation.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:underline mt-1 block"
              >
                Open video URL
              </a>
            )}
          </div>
        ) : (
          <>
            <video
              src={generation.url}
              controls
              className={`w-full ${loading ? "opacity-0" : "opacity-100"} transition-opacity`}
              onLoadedData={() => setLoading(false)}
              onError={() => {
                setError(true);
                setLoading(false);
              }}
            />
            {/* Download button overlay */}
            {!loading && (
              <button
                onClick={handleDownload}
                className="absolute top-2 right-2 p-2 bg-black/60 hover:bg-black/80 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                title="Download video"
              >
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
            )}
          </>
        )}
        {/* Worker info */}
        {generation.workerName && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <p className="text-xs text-cyan-400 font-mono truncate">
              Worker: {generation.workerName}
            </p>
          </div>
        )}
      </div>
    );
  }

  // Image rendering
  // Ensure we have a valid image source
  const validImageSrc = imageSrc && !isVideo ? imageSrc : null;
  
  return (
    <div className="relative rounded-xl border border-white/10 overflow-hidden bg-black/40 min-h-[100px] group">
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="animate-spin w-6 h-6 border-2 border-white/30 border-t-white rounded-full" />
        </div>
      )}
      {error ? (
        <div className="p-4 text-center text-white/50">
          <p className="text-sm">Image failed to load</p>
          {generation.url && (
            <a
              href={generation.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:underline mt-1 block"
            >
              Open image URL
            </a>
          )}
        </div>
      ) : validImageSrc ? (
        <>
          <img
            src={validImageSrc}
            alt="Generated content"
            className={`w-full h-auto ${loading ? "opacity-0" : "opacity-100"} transition-opacity`}
            onLoad={() => setLoading(false)}
            onError={() => {
              setError(true);
              setLoading(false);
            }}
          />
          {/* Download button overlay */}
          {!loading && (
            <button
              onClick={handleDownload}
              className="absolute top-2 right-2 p-2 bg-black/60 hover:bg-black/80 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
              title="Download image"
            >
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
          )}
        </>
      ) : (
        <div className="p-4 text-center text-white/50">
          <p className="text-sm">No image data available</p>
        </div>
      )}
      {/* Worker info */}
      {generation.workerName && !loading && !error && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <p className="text-xs text-cyan-400 font-mono truncate">
            Worker: {generation.workerName}
          </p>
        </div>
      )}
    </div>
  );
}

// ========== Your Created Content Card ==========

interface CreatedContentCardProps {
  creations: StoredCreation[];
  onRemove: (jobId: string) => void;
}

function CreatedContentCard({ creations, onRemove }: CreatedContentCardProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [mediaUrls, setMediaUrls] = useState<Record<string, string[]>>({});
  
  // Fetch media URLs for video creations
  useEffect(() => {
    const fetchMediaForVideos = async () => {
      for (const creation of creations) {
        if (creation.type === "video" && !mediaUrls[creation.jobId]) {
          try {
            const media = await fetchGalleryMedia(creation.jobId);
            if (media.mediaUrls?.length > 0) {
              setMediaUrls(prev => ({
                ...prev,
                [creation.jobId]: media.mediaUrls
              }));
              // Update the creation's URL if we got a better one
              if (creation.generations[0]) {
                creation.generations[0].url = media.mediaUrls[0];
              }
            }
          } catch (err) {
            // Ignore errors - use existing URLs
          }
        }
      }
    };
    fetchMediaForVideos();
  }, [creations]);
  
  // Filter creations by search
  const filteredCreations = useMemo(() => {
    if (!searchQuery.trim()) return creations;
    const query = searchQuery.toLowerCase();
    return creations.filter(c => 
      c.prompt.toLowerCase().includes(query) ||
      c.tags.some(tag => tag.toLowerCase().includes(query)) ||
      c.modelName.toLowerCase().includes(query)
    );
  }, [creations, searchQuery]);
  
  if (creations.length === 0) {
    return (
      <div className="panel space-y-4">
        <h3 className="text-sm uppercase tracking-[0.3em] text-white/50">
          Your Created Content
        </h3>
        <div className="text-sm text-white/40 flex items-center gap-2">
          <span className="text-lg">🖼️</span>
          <span>Completed creations will be saved here</span>
        </div>
      </div>
    );
  }
  
  return (
    <div className="panel space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm uppercase tracking-[0.3em] text-white/50">
          Your Created Content
        </h3>
        <span className="text-xs text-white/40">{creations.length} items</span>
      </div>
      
      {/* Search bar */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by prompt, tag, or model..."
          className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm pr-8"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
          >
            ×
          </button>
        )}
      </div>
      
      {/* Thumbnail grid */}
      <div className="grid grid-cols-3 gap-2 max-h-[300px] overflow-auto pr-1">
        {filteredCreations.map((creation) => {
          // Use fetched media URL for videos if available
          const enhancedCreation = {...creation};
          if (mediaUrls[creation.jobId]?.length > 0 && creation.generations[0]) {
            enhancedCreation.generations = [{
              ...creation.generations[0],
              url: mediaUrls[creation.jobId][0]
            }, ...creation.generations.slice(1)];
          }
          return (
            <CreationThumbnail
              key={creation.jobId}
              creation={enhancedCreation}
              isExpanded={expandedId === creation.jobId}
              onToggle={() => setExpandedId(expandedId === creation.jobId ? null : creation.jobId)}
              onRemove={() => onRemove(creation.jobId)}
            />
          );
        })}
      </div>
      
      {/* Expanded view modal */}
      {expandedId && (
        <ExpandedCreationModal
          creation={creations.find(c => c.jobId === expandedId)!}
          onClose={() => setExpandedId(null)}
          onRemove={() => {
            onRemove(expandedId);
            setExpandedId(null);
          }}
        />
      )}
    </div>
  );
}

interface CreationThumbnailProps {
  creation: StoredCreation;
  isExpanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
}

function CreationThumbnail({ creation, onToggle }: CreationThumbnailProps) {
  const [mediaError, setMediaError] = useState(false);
  const firstGen = creation.generations[0];
  const imageSrc = firstGen?.base64 || firstGen?.url;
  const isVideo = creation.type === "video";
  
  return (
    <button
      onClick={onToggle}
      className="relative aspect-square rounded-lg overflow-hidden border border-white/10 hover:border-white/30 transition-colors group"
    >
      {imageSrc && !mediaError ? (
        isVideo ? (
          <video
            src={imageSrc}
            className="w-full h-full object-cover"
            muted
            playsInline
            loop
            onError={() => setMediaError(true)}
            onLoadedData={(e) => {
              // Try to play on load for preview
              e.currentTarget.play().catch(() => {});
            }}
          />
        ) : (
          <img
            src={imageSrc}
            alt={creation.prompt.slice(0, 50)}
            className="w-full h-full object-cover"
            onError={() => setMediaError(true)}
          />
        )
      ) : (
        <div className="w-full h-full bg-white/5 flex items-center justify-center">
          <span className="text-2xl">{isVideo ? "🎬" : "🖼️"}</span>
        </div>
      )}
      
      {/* Type badge */}
      <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[10px] bg-black/60">
        {isVideo ? "🎬" : "🖼️"}
      </div>
      
      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <span className="text-xs text-white">Click to expand</span>
      </div>
    </button>
  );
}

interface ExpandedCreationModalProps {
  creation: StoredCreation;
  onClose: () => void;
  onRemove: () => void;
}

function ExpandedCreationModal({ creation, onClose, onRemove }: ExpandedCreationModalProps) {
  const firstGen = creation.generations[0];
  const imageSrc = firstGen?.base64 || firstGen?.url;
  const isVideo = creation.type === "video";
  
  const handleDownload = () => {
    const downloadUrl = firstGen?.url || firstGen?.base64;
    if (!downloadUrl) return;
    const filename = getMediaFilename(creation.jobId, undefined, isVideo);
    downloadMedia(downloadUrl, filename);
  };
  
  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div 
        className="bg-zinc-900 rounded-2xl border border-white/10 max-w-2xl w-full max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-lg">{isVideo ? "🎬" : "🖼️"}</span>
            <span className="font-medium">{creation.modelName}</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Media */}
          <div className="rounded-xl overflow-hidden border border-white/10">
            {imageSrc ? (
              isVideo ? (
                <video
                  src={imageSrc}
                  controls
                  autoPlay
                  loop
                  muted
                  className="w-full"
                />
              ) : (
                <img
                  src={imageSrc}
                  alt={creation.prompt}
                  className="w-full"
                />
              )
            ) : (
              <div className="aspect-video bg-white/5 flex items-center justify-center">
                <span className="text-white/40">No preview available</span>
              </div>
            )}
          </div>
          
          {/* Prompt */}
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-white/40">Prompt</p>
            <p className="text-sm text-white/80 bg-black/30 rounded-lg p-3">
              {creation.prompt}
            </p>
          </div>
          
          {/* Tags */}
          {creation.tags.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.2em] text-white/40">Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {creation.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 rounded-full bg-white/10 text-xs text-white/70"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <p className="text-white/40">Job ID</p>
              <p className="font-mono text-white/70 break-all">{creation.jobId}</p>
            </div>
            <div>
              <p className="text-white/40">Created</p>
              <p className="text-white/70">{new Date(creation.createdAt).toLocaleString()}</p>
            </div>
            {firstGen?.seed && (
              <div>
                <p className="text-white/40">Seed</p>
                <p className="font-mono text-white/70">{firstGen.seed}</p>
              </div>
            )}
            {firstGen?.workerName && (
              <div>
                <p className="text-white/40">Worker</p>
                <p className="font-mono text-cyan-400 truncate">{firstGen.workerName}</p>
              </div>
            )}
          </div>
        </div>
        
        {/* Actions */}
        <div className="flex gap-3 p-4 border-t border-white/10">
          <button
            onClick={handleDownload}
            className="flex-1 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-yellow-400 text-black font-semibold hover:opacity-90 transition-opacity"
          >
            Download
          </button>
          <button
            onClick={() => {
              if (confirm("Remove this creation from your local history?")) {
                onRemove();
              }
            }}
            className="px-4 py-2 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

