"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  Download,
  Music2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Header } from "@/components/header";
import { AuthModal } from "@/components/auth-modal";
import {
  createAudioJob,
  fetchCredits,
  fetchJobStatus,
  type GridCredits,
} from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth-store";
import type { JobStatus } from "@/types/models";

const HISTORY_KEY = "aipg_audio_history_v1";
const ACTIVE_JOB_KEY = "aipg_audio_active_job_v1";
const MAX_SEED = 2 ** 53 - 1;

type AudioMode = "instrumental" | "lyrics";

interface AudioSubmission {
  jobId: string;
  prompt: string;
  seconds: number;
  inferenceSteps: number;
  createdAt: number;
}

interface AudioTrack {
  id: string;
  url: string;
  prompt: string;
  seconds: number;
  seed?: string;
  worker?: string;
  genTime?: number;
  createdAt: number;
}

const QUALITY = [
  { label: "Fast", steps: 8 },
  { label: "Balanced", steps: 12 },
  { label: "Detailed", steps: 20 },
] as const;

function playableAudioURL(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "media.aipg.art" ||
        url.hostname.endsWith(".r2.cloudflarestorage.com"))
    );
  } catch {
    return false;
  }
}

function loadTrackHistory(): AudioTrack[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): AudioTrack[] => {
      if (
        !item ||
        typeof item.id !== "string" ||
        typeof item.prompt !== "string" ||
        !Number.isFinite(item.seconds) ||
        !Number.isFinite(item.createdAt) ||
        !playableAudioURL(item.url)
      ) {
        return [];
      }
      return [{
        id: item.id,
        url: item.url,
        prompt: item.prompt,
        seconds: item.seconds,
        seed: typeof item.seed === "string" ? item.seed : undefined,
        worker: typeof item.worker === "string" ? item.worker : undefined,
        genTime: Number.isFinite(item.genTime) ? item.genTime : undefined,
        createdAt: item.createdAt,
      }];
    }).slice(0, 12);
  } catch {
    return [];
  }
}

function loadActiveJob(): AudioSubmission | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(ACTIVE_JOB_KEY) ?? "null");
    if (
      !parsed ||
      typeof parsed.jobId !== "string" ||
      typeof parsed.prompt !== "string" ||
      !Number.isFinite(parsed.seconds) ||
      !Number.isInteger(parsed.inferenceSteps) ||
      !Number.isFinite(parsed.createdAt) ||
      Date.now() - Number(parsed.createdAt) > 40 * 60 * 1000
    ) {
      localStorage.removeItem(ACTIVE_JOB_KEY);
      return null;
    }
    return parsed as AudioSubmission;
  } catch {
    localStorage.removeItem(ACTIVE_JOB_KEY);
    return null;
  }
}

function downloadURL(track: AudioTrack) {
  const query = new URLSearchParams({ url: track.url });
  return `/api/download?${query.toString()}`;
}

export function AudioStudio() {
  const { isAuthenticated } = useAuthStore();
  const [mode, setMode] = useState<AudioMode>("instrumental");
  const [prompt, setPrompt] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [seconds, setSeconds] = useState(30);
  const [inferenceSteps, setInferenceSteps] = useState(8);
  const [seed, setSeed] = useState("");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [credits, setCredits] = useState<GridCredits | null>(null);
  const [activeJob, setActiveJob] = useState<AudioSubmission | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollFailures = useRef(0);

  useEffect(() => {
    setTracks(loadTrackHistory());
    setActiveJob(loadActiveJob());
    setHistoryReady(true);
  }, []);

  useEffect(() => {
    if (historyReady) {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(tracks.slice(0, 12)));
    }
  }, [historyReady, tracks]);

  useEffect(() => {
    if (!isAuthenticated) {
      setCredits(null);
      return;
    }
    void fetchCredits()
      .then(setCredits)
      .catch(() => setCredits(null));
  }, [isAuthenticated]);

  useEffect(() => {
    if (!activeJob) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = () => {
      localStorage.removeItem(ACTIVE_JOB_KEY);
      setActiveJob(null);
    };

    const poll = async () => {
      try {
        const status = await fetchJobStatus(activeJob.jobId);
        if (cancelled) return;
        pollFailures.current = 0;
        setJobStatus(status);

        if (status.status === "completed") {
          const output = status.generations.find(
            (item) => item.kind === "audio" && playableAudioURL(item.url),
          );
          if (!output?.url) {
            setError("The job completed without a playable audio file.");
            finish();
            return;
          }
          const track: AudioTrack = {
            id: activeJob.jobId,
            url: output.url,
            prompt: activeJob.prompt,
            seconds: activeJob.seconds,
            seed: output.seed || undefined,
            worker: status.worker,
            genTime: status.genTime,
            createdAt: Date.now(),
          };
          setTracks((current) => [
            track,
            ...current.filter((item) => item.id !== track.id),
          ].slice(0, 12));
          finish();
          return;
        }
        if (status.status === "faulted" || status.faulted) {
          setError(status.error || "Audio generation failed.");
          finish();
          return;
        }
        timer = setTimeout(poll, 2000);
      } catch (pollError) {
        if (cancelled) return;
        pollFailures.current += 1;
        const message =
          pollError instanceof Error ? pollError.message : "Could not check the audio job.";
        if (message.startsWith("401:") || message.startsWith("404:")) {
          setError(message);
          finish();
          return;
        }
        if (pollFailures.current >= 6) {
          setError("Connection interrupted. The job is retained and polling will continue.");
        }
        timer = setTimeout(poll, pollFailures.current >= 6 ? 10000 : 3000);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [activeJob]);

  const progress = useMemo(() => {
    if (!activeJob) return 0;
    if (jobStatus?.progress != null) return jobStatus.progress;
    return jobStatus?.status === "processing" ? 12 : 4;
  }, [activeJob, jobStatus]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }
    const cleanPrompt = prompt.trim();
    const cleanLyrics = mode === "lyrics" ? lyrics.trim() : "";
    if (!cleanPrompt) {
      setError("Describe the track you want to create.");
      return;
    }
    if (mode === "lyrics" && !cleanLyrics) {
      setError("Add lyrics or switch to Instrumental.");
      return;
    }
    let numericSeed: number | undefined;
    if (seed.trim()) {
      numericSeed = Number(seed);
      if (
        !Number.isSafeInteger(numericSeed) ||
        numericSeed < 0 ||
        numericSeed > MAX_SEED
      ) {
        setError(`Seed must be a whole number between 0 and ${MAX_SEED}.`);
        return;
      }
    }

    setSubmitting(true);
    setError(null);
    setJobStatus(null);
    try {
      const response = await createAudioJob({
        prompt: cleanPrompt,
        lyrics: cleanLyrics || undefined,
        seconds,
        inferenceSteps,
        ...(numericSeed == null ? {} : { seed: numericSeed }),
      });
      const submission: AudioSubmission = {
        jobId: response.jobId,
        prompt: cleanPrompt,
        seconds,
        inferenceSteps,
        createdAt: Date.now(),
      };
      localStorage.setItem(ACTIVE_JOB_KEY, JSON.stringify(submission));
      setActiveJob(submission);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not start audio generation.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const busy = submitting || Boolean(activeJob);

  return (
    <main className="min-h-screen bg-black text-white">
      <Header />
      <div className="mx-auto w-full max-w-6xl px-4 py-7 md:px-8 md:py-10">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-7 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-orange-400">
              <Music2 className="h-4 w-4" aria-hidden="true" />
              ACE-Step on the Grid
            </div>
            <h1 className="text-3xl font-bold md:text-4xl">Music Studio</h1>
          </div>
          {isAuthenticated && credits && (
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-400">
              <span>Promo ${credits.promotional.remaining_usd.toFixed(2)}</span>
              <span>Daily ${credits.free.remaining_usd.toFixed(2)}</span>
              <span>Purchased ${credits.paid.balance_usd.toFixed(2)}</span>
              {!credits.charging_enabled && <span>Metering preview</span>}
            </div>
          )}
        </header>

        <form onSubmit={submit} className="grid gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-6">
            <div>
              <label htmlFor="audio-prompt" className="mb-2 block text-sm font-semibold">
                Describe the track
              </label>
              <textarea
                id="audio-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                maxLength={2000}
                rows={6}
                disabled={busy}
                placeholder="Warm analog synths, restrained breakbeat, late-night city atmosphere..."
                className="w-full resize-y border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm leading-6 outline-none transition focus:border-orange-400 disabled:opacity-60"
              />
              <div className="mt-1 text-right text-xs text-zinc-600">{prompt.length}/2000</div>
            </div>

            {mode === "lyrics" && (
              <div>
                <label htmlFor="audio-lyrics" className="mb-2 block text-sm font-semibold">
                  Lyrics
                </label>
                <textarea
                  id="audio-lyrics"
                  value={lyrics}
                  onChange={(event) => setLyrics(event.target.value)}
                  maxLength={20000}
                  rows={10}
                  disabled={busy}
                  placeholder={"[Verse]\n...\n\n[Chorus]\n..."}
                  className="w-full resize-y border border-zinc-700 bg-zinc-900 px-4 py-3 font-mono text-sm leading-6 outline-none transition focus:border-orange-400 disabled:opacity-60"
                />
                <div className="mt-1 text-right text-xs text-zinc-600">{lyrics.length}/20000</div>
              </div>
            )}

            {activeJob && (
              <section className="border border-cyan-500/30 bg-cyan-500/5 p-5" aria-live="polite">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold">
                      {jobStatus?.status === "processing" ? "Generating audio" : "Finding an audio worker"}
                    </p>
                    <p className="mt-1 line-clamp-1 text-xs text-zinc-400">{activeJob.prompt}</p>
                  </div>
                  <span className="font-mono text-xs text-cyan-300">{Math.round(progress)}%</span>
                </div>
                <div className="mt-4 h-1.5 overflow-hidden bg-zinc-800">
                  <div
                    className="h-full bg-cyan-400 transition-[width] duration-500"
                    style={{ width: `${Math.max(3, progress)}%` }}
                  />
                </div>
              </section>
            )}

            {error && (
              <div className="border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}
          </div>

          <aside className="space-y-7 border-t border-white/10 pt-7 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            <fieldset disabled={busy}>
              <legend className="mb-2 text-sm font-semibold">Composition</legend>
              <div className="grid grid-cols-2 border border-zinc-700 bg-zinc-900 p-1">
                {(["instrumental", "lyrics"] as AudioMode[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMode(value)}
                    aria-pressed={mode === value}
                    className={`min-h-10 px-3 text-sm font-medium transition ${
                      mode === value ? "bg-white text-black" : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    {value === "instrumental" ? "Instrumental" : "With lyrics"}
                  </button>
                ))}
              </div>
            </fieldset>

            <div>
              <div className="mb-2 flex items-center justify-between gap-4">
                <label htmlFor="audio-duration" className="text-sm font-semibold">Duration</label>
                <output className="font-mono text-xs text-zinc-400">{seconds}s</output>
              </div>
              <input
                id="audio-duration"
                type="range"
                min={10}
                max={300}
                step={5}
                value={seconds}
                onChange={(event) => setSeconds(Number(event.target.value))}
                disabled={busy}
                className="h-2 w-full cursor-pointer accent-orange-500 disabled:cursor-default"
              />
            </div>

            <fieldset disabled={busy}>
              <legend className="mb-2 text-sm font-semibold">Quality</legend>
              <div className="grid grid-cols-3 gap-px overflow-hidden border border-zinc-700 bg-zinc-700">
                {QUALITY.map((item) => (
                  <button
                    key={item.steps}
                    type="button"
                    onClick={() => setInferenceSteps(item.steps)}
                    aria-pressed={inferenceSteps === item.steps}
                    className={`min-h-10 bg-zinc-900 px-2 text-xs font-medium transition ${
                      inferenceSteps === item.steps
                        ? "text-orange-300"
                        : "text-zinc-500 hover:text-white"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <div>
              <label htmlFor="audio-seed" className="mb-2 block text-sm font-semibold">Seed</label>
              <div className="flex gap-2">
                <input
                  id="audio-seed"
                  inputMode="numeric"
                  value={seed}
                  onChange={(event) => setSeed(event.target.value.replace(/\D/g, ""))}
                  disabled={busy}
                  placeholder="Random"
                  className="min-w-0 flex-1 border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm outline-none focus:border-orange-400 disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setSeed("")}
                  disabled={busy || !seed}
                  aria-label="Use a random seed"
                  title="Use a random seed"
                  className="flex h-10 w-10 shrink-0 items-center justify-center border border-zinc-700 text-zinc-400 transition hover:text-white disabled:opacity-30"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={busy || !prompt.trim()}
              className="flex min-h-12 w-full items-center justify-center gap-2 bg-orange-500 px-5 font-semibold text-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
            >
              {busy ? <AudioLines className="h-4 w-4 animate-pulse" /> : <Sparkles className="h-4 w-4" />}
              {busy ? "Generation in progress" : "Generate music"}
            </button>
          </aside>
        </form>

        <section className="border-t border-white/10 py-8">
          <div className="mb-6 flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold">Recent tracks</h2>
            <span className="text-xs text-zinc-500">Stored on this device</span>
          </div>
          {tracks.length === 0 ? (
            <div className="border border-dashed border-zinc-800 px-5 py-12 text-center text-sm text-zinc-500">
              Your generated tracks will appear here.
            </div>
          ) : (
            <div className="divide-y divide-zinc-800 border-y border-zinc-800">
              {tracks.map((track) => (
                <article key={track.id} className="grid gap-4 py-5 md:grid-cols-[minmax(0,1fr)_minmax(280px,420px)_auto] md:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{track.prompt}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {track.seconds}s
                      {track.seed ? ` / seed ${track.seed}` : ""}
                      {track.worker ? ` / ${track.worker}` : ""}
                      {track.genTime != null ? ` / ${track.genTime.toFixed(1)}s render` : ""}
                    </p>
                  </div>
                  <audio controls preload="metadata" src={track.url} className="h-10 w-full" />
                  <a
                    href={downloadURL(track)}
                    aria-label="Download WAV"
                    title="Download WAV"
                    className="flex h-10 w-10 items-center justify-center border border-zinc-700 text-zinc-300 transition hover:border-zinc-500 hover:text-white"
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                  </a>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        title="Sign in to generate music"
        message="Continue with Google or verify a Base wallet. Your linked Grid account owns the credit balance and generation history."
      />
    </main>
  );
}
