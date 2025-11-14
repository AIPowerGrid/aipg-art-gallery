 "use client";

import { useEffect, useMemo, useState } from "react";
import { createJob, fetchJobStatus, fetchModels } from "@/lib/api";
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

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

export default function HomePage() {
  const [models, setModels] = useState<GalleryModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [selectedModelId, setSelectedModelId] = useState<string>();
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [nsfw, setNsfw] = useState(false);
  const [sharePublicly, setSharePublicly] = useState(true);
  const [seed, setSeed] = useState("");
  const [params, setParams] = useState<Record<string, number | boolean>>({});
  const [uploadImage, setUploadImage] = useState<string | undefined>(undefined);
  const [uploadMask, setUploadMask] = useState<string | undefined>(undefined);
  const [sourceProcessing, setSourceProcessing] = useState<
    "txt2img" | "img2img" | "inpainting"
  >("txt2img");
  const [jobs, setJobs] = useState<JobEntry[]>([]);
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const run = async () => {
      try {
        setIsLoadingModels(true);
        const data = await fetchModels();
        setModels(data.models);
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

    const payload: CreateJobRequest = {
      modelId: selectedModel.id,
      prompt,
      negativePrompt,
      apiKey: apiKey.trim() || undefined,
      nsfw,
      public: sharePublicly,
      params: {
        width: Number(params.width) || undefined,
        height: Number(params.height) || undefined,
        steps: Number(params.steps) || undefined,
        cfgScale: Number(params.cfgScale) || undefined,
        sampler: selectedModel.samplers[Number(params.sampler) || 0],
        scheduler: selectedModel.schedulers[Number(params.scheduler) || 0],
        seed: seed || undefined,
        denoise: Number(params.denoise) || undefined,
        length: Number(params.length) || undefined,
        fps: Number(params.fps) || undefined,
        tiling: Boolean(params.tiling),
        hiresFix: Boolean(params.hiresFix),
      },
    };

    if (sourceProcessing !== "txt2img" && uploadImage) {
      payload.sourceImage = uploadImage;
      payload.sourceProcessing = sourceProcessing;
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
      setError(err.message ?? "Failed to create job");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function pollStatus(jobId: string) {
    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      try {
        const status = await fetchJobStatus(jobId);
        setJobs((prev) =>
          prev.map((job) =>
            job.jobId === jobId
              ? {
                  ...job,
                  status,
                }
              : job
          )
        );
        if (
          status.status === "completed" ||
          status.status === "faulted" ||
          attempts > 30
        ) {
          return;
        }
        setTimeout(poll, 3000);
      } catch (err: any) {
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
    };
    poll();
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
    <main className="flex-1 w-full px-4 md:px-10 py-8 space-y-12">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="uppercase tracking-[0.6em] text-xs text-white/50">
            AIPG COMFY BRIDGE
          </p>
          <h1 className="text-3xl md:text-5xl font-semibold text-gradient">
            Art Gallery
          </h1>
          <p className="text-white/70 mt-2 max-w-3xl">
            Same experience as the Comfy Bridge management UI with model-aware
            controls for Flux image pipelines and WAN video workflows.
          </p>
        </div>
        <div className="panel w-full md:w-auto flex flex-col md:flex-row gap-6">
          <Stat label="Models Online" value={models.length} />
          <Stat
            label="Queue"
            value={models.reduce((sum, m) => sum + m.queueLength, 0)}
          />
          <Stat
            label="Workers"
            value={models.reduce((sum, m) => sum + m.onlineWorkers, 0)}
          />
        </div>
      </header>

      {error && (
        <div className="panel border border-red-500/40 text-red-200">
          {error}
        </div>
      )}

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div className="panel space-y-6">
            <div className="flex flex-col gap-3">
              <label className="text-sm uppercase tracking-[0.3em] text-white/50">
                Model
              </label>
              <div className="flex flex-wrap gap-3">
                {isLoadingModels && (
                  <div className="text-white/50">Loading models…</div>
                )}
                {!isLoadingModels && models.length === 0 && (
                  <div className="text-white/50">
                    No models advertised by the bridge.
                  </div>
                )}
                {models.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => handleModelChange(model.id)}
                    className={`px-4 py-2 rounded-full border transition ${
                      selectedModel?.id === model.id
                        ? "border-white text-white bg-white/10"
                        : "border-white/20 text-white/70 hover:text-white"
                    }`}
                  >
                    {model.displayName}
                  </button>
                ))}
              </div>
            </div>

            {selectedModel && (
              <>
                <div className="rounded-2xl border border-white/10 p-4 bg-white/5">
                  <p className="text-xs uppercase tracking-[0.5em] text-white/50 mb-2">
                    {capabilityHint}
                  </p>
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
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe the image or video to render..."
                    className="min-h-[160px] w-full rounded-2xl bg-black/30 border border-white/10 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-white/30"
                  />
                  <textarea
                    value={negativePrompt}
                    onChange={(e) => setNegativePrompt(e.target.value)}
                    placeholder="Negative prompt (optional)"
                    className="min-h-[160px] w-full rounded-2xl bg-black/30 border border-white/10 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-white/30"
                  />
                </div>

                <ParamGrid
                  model={selectedModel}
                  params={params}
                  onParamChange={updateParam}
                />

                <div className="grid md:grid-cols-3 gap-4">
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
                      API Key
                    </label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Override worker key"
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
                      <option value="txt2img">Text to Image</option>
                      <option value="img2img">Image to Image</option>
                      <option value="inpainting">Inpainting</option>
                    </select>
                  </div>
                </div>

                {sourceProcessing !== "txt2img" && (
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

                <div className="grid md:grid-cols-3 gap-4 text-white/80">
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
                  <Toggle
                    label="Tile output"
                    enabled={Boolean(params.tiling)}
                    onChange={(val) => updateParam("tiling", val)}
                  />
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || !selectedModel}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-orange-500 to-yellow-400 text-black font-semibold shadow-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {isSubmitting ? "Submitting to bridge…" : "Generate"}
                </button>
              </>
            )}
          </div>
        </div>

        <aside className="space-y-6">
          <div className="panel space-y-4">
            <h3 className="text-sm uppercase tracking-[0.3em] text-white/50">
              Active jobs
            </h3>
            <div className="space-y-4 max-h-[520px] overflow-auto pr-2">
              {jobs.length === 0 && (
                <p className="text-white/50 text-sm">
                  Jobs you submit will appear here with live status and outputs.
                </p>
              )}
              {jobs.map((job) => (
                <JobCard job={job} key={job.jobId} />
              ))}
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.5em] text-white/50">{label}</p>
      <p className="text-2xl font-semibold">{numberFormatter.format(value)}</p>
    </div>
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

      <div className="space-y-2">
        <label className="text-xs uppercase tracking-[0.3em] text-white/60">
          Sampler
        </label>
        <select
          value={Number(params.sampler ?? 0)}
          onChange={(e) => onParamChange("sampler", Number(e.target.value))}
          className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
        >
          {model.samplers.map((sampler, index) => (
            <option value={index} key={sampler}>
              {sampler}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-xs uppercase tracking-[0.3em] text-white/60">
          Scheduler
        </label>
        <select
          value={Number(params.scheduler ?? 0)}
          onChange={(e) => onParamChange("scheduler", Number(e.target.value))}
          className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
        >
          {model.schedulers.map((scheduler, index) => (
            <option value={index} key={scheduler}>
              {scheduler}
            </option>
          ))}
        </select>
      </div>
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
  if (generation.kind === "video") {
    return (
      <video
        src={generation.url}
        controls
        className="rounded-xl border border-white/10"
      />
    );
  }

  return (
    <div className="rounded-xl border border-white/10 overflow-hidden">
      {generation.base64 ? (
        <img
          src={generation.base64}
          alt={generation.id}
          className="w-full h-auto"
        />
      ) : (
        generation.url && (
          <img src={generation.url} alt={generation.id} className="w-full" />
        )
      )}
    </div>
  );
}

