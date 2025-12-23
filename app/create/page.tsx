"use client";

import { useEffect, useMemo, useState } from "react";
import { createJob, fetchJobStatus, fetchModels, addToGallery } from "@/lib/api";
import { saveJob, StoredJob } from "@/lib/storage";
import { useAccount } from "wagmi";
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
    if (!selectedModel) return;
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

    console.log("Submitting job:", payload);

    try {
      const resp = await createJob(payload);
      console.log("Job created:", resp);
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
        
        // Save completed job to local history
        if (status.status === "completed" && status.generations.length > 0) {
          saveJobToHistory(jobId, selectedModel!);
        }
        
        if (
          status.status === "completed" ||
          status.status === "faulted" ||
          attempts > 60
        ) {
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
        }
      }
    };
    poll();
  }

  async function saveJobToHistory(
    jobId: string,
    model: GalleryModel
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
    console.log("Job saved to local history:", jobId);
    
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
        });
        console.log("Job saved to gallery:", jobId, sharePublicly ? "(public)" : "(private)");
      } catch (err) {
        console.error("Failed to save to gallery:", err);
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
    <main className="flex-1 w-full px-4 md:px-10 py-8 space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-gradient">
            Create
          </h1>
          <p className="text-white/50 text-sm mt-1">
            Generate AI images and videos
          </p>
        </div>
        {/* Chain connection indicator */}
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs ${
          chainSource 
            ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
            : 'bg-white/5 text-white/40 border border-white/10'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${chainSource ? 'bg-green-400' : 'bg-white/30'}`} />
          {chainSource ? 'Chain Connected' : 'Chain Offline'}
        </div>
      </header>

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
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Example: A majestic mountain landscape at golden hour, with snow-capped peaks reflecting in a crystal clear lake..."
                      className="min-h-[140px] w-full rounded-2xl bg-black/30 border border-white/10 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                    />
                    <p className="text-xs text-white/40">Be descriptive — include style, lighting, colors, and mood</p>
                  </div>
                  <div className="space-y-2">
                    <textarea
                      value={negativePrompt}
                      onChange={(e) => setNegativePrompt(e.target.value)}
                      placeholder="Things to avoid: blurry, low quality, distorted..."
                      className="min-h-[140px] w-full rounded-2xl bg-black/30 border border-white/10 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-white/30"
                    />
                    <p className="text-xs text-white/40">Optional — exclude unwanted elements</p>
                  </div>
                </div>

                <ParamGrid
                  model={selectedModel}
                  params={params}
                  onParamChange={updateParam}
                />

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
                      {selectedModel?.type === "video" ? (
                        <>
                          <option value="txt2video">Text to Video</option>
                          {selectedModel.capabilities?.includes("img2video") && (
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
            <div className="space-y-4 max-h-[520px] overflow-auto pr-2">
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
        </aside>
      </section>
    </main>
  );
}


type ParamGridProps = {
  model: GalleryModel;
  params: Record<string, number | boolean>;
  onParamChange: (key: string, value: number | boolean) => void;
};

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

  return (
    <div className="border border-white/10 rounded-2xl p-4 bg-black/40 space-y-3">
      <div className="flex items-center justify-between text-sm">
        <div>
          <p className="text-xs text-white/40">Job ID</p>
          <p className="font-mono text-xs text-white/70">{job.jobId}</p>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-xs ${
            status?.status === "completed"
              ? "bg-green-500/20 text-green-200"
              : status?.status === "faulted"
              ? "bg-red-500/20 text-red-200"
              : "bg-yellow-500/20 text-yellow-200 animate-pulse"
          }`}
        >
          {status?.status ?? "queued"}
        </span>
      </div>
      {job.error && (
        <p className="text-xs text-red-300">Error: {job.error}</p>
      )}
      {outputs.length > 0 && (
        <div className="grid gap-2">
          {outputs.map((generation) => (
            <GenerationPreview key={generation.id} generation={generation} />
          ))}
        </div>
      )}
    </div>
  );
}

function GenerationPreview({ generation }: { generation: GenerationView }) {
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  // Determine the best source for the media
  const imageSrc = generation.base64 || generation.url;
  const isVideo = generation.kind === "video";

  if (isVideo) {
    return (
      <div className="relative rounded-xl border border-white/10 overflow-hidden bg-black/40">
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
        )}
      </div>
    );
  }

  // Image rendering
  return (
    <div className="relative rounded-xl border border-white/10 overflow-hidden bg-black/40 min-h-[100px]">
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
      ) : imageSrc ? (
        <img
          src={imageSrc}
          alt="Generated content"
          className={`w-full h-auto ${loading ? "opacity-0" : "opacity-100"} transition-opacity`}
          onLoad={() => setLoading(false)}
          onError={() => {
            setError(true);
            setLoading(false);
          }}
        />
      ) : (
        <div className="p-4 text-center text-white/50">
          <p className="text-sm">No image data available</p>
        </div>
      )}
    </div>
  );
}

