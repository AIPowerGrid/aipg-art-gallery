/**
 * Global job tracking store using Zustand
 * Persists active jobs to localStorage and polls for status updates
 * Jobs survive page navigation and browser refresh
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  ApiError, createJob, fetchJobByRequest, fetchJobStatus,
  updateGalleryItem, addToGallery,
} from "@/lib/api";
import { CreateJobRequest, JobStatus } from "@/types/models";

export interface TrackedJob {
  jobId: string;
  requestId?: string;
  retryAt?: number;
  modelId: string;
  modelName: string;
  prompt: string;
  negativePrompt?: string;
  type: "image" | "video";
  isNsfw: boolean;
  isPublic: boolean;
  walletAddress?: string;
  submittedAt: number;
  status: "queued" | "processing" | "completed" | "faulted" | "cancelled";
  waitTime?: number;
  initialWaitTime?: number; // First wait time estimate (for progress calculation)
  queuePosition?: number;
  error?: string;
  result?: JobStatus; // Full result when completed
  pollFailures?: number; // Count consecutive poll failures
  width?: number;
  height?: number;
  expectedGenerations?: number; // For batch mode - how many images to expect
}

export interface PendingSubmission {
  requestId: string;
  owner: string;
  job: Omit<TrackedJob, "jobId" | "status">;
  retryAt?: number;
}

const submitting = new Set<string>();
const recovering = new Set<string>();
const UNKNOWN_SUBMISSION = "Generation outcome is unknown. Checking the original request; do not submit it again.";

interface JobStore {
  // State
  jobs: TrackedJob[];
  requests: PendingSubmission[];
  activeOwner: string | null;
  isPolling: boolean;
  pollIntervalId: NodeJS.Timeout | null;

  // Actions
  submitJob: (
    payload: CreateJobRequest,
    owner: string | undefined,
    prepared?: (requestId: string) => void,
  ) => Promise<{ jobId: string; status: string }>;
  resolveRequest: (request: PendingSubmission, jobId: string) => void;
  addJob: (
    job: Omit<TrackedJob, "status" | "submittedAt"> & {
      status?: TrackedJob["status"];
    },
  ) => void;
  updateJob: (jobId: string, updates: Partial<TrackedJob>) => void;
  removeJob: (jobId: string) => void;
  clearCompletedJobs: () => void;
  setActiveOwner: (owner: string | null, legacyOwners?: string[]) => void;

  // Polling
  startPolling: () => void;
  stopPolling: () => void;
  pollOnce: () => Promise<void>;

  // Getters
  getActiveJobs: () => TrackedJob[];
  getCompletedJobs: () => TrackedJob[];
  getJob: (jobId: string) => TrackedJob | undefined;
}

const POLL_INTERVAL = 3000; // 3 seconds

export const useJobStore = create<JobStore>()(
  persist(
    (set, get) => ({
      jobs: [],
      requests: [],
      activeOwner: null,
      isPolling: false,
      pollIntervalId: null,

      submitJob: async (payload, owner, prepared) => {
        const normalized = owner?.trim().toLowerCase();
        if (!normalized || get().activeOwner !== normalized) {
          throw new Error("Your account session changed. Sign in again before generating.");
        }
        if (get().requests.some((request) => request.owner === normalized && request.job.modelId === payload.modelId && request.job.prompt === payload.prompt)) {
          throw new Error(UNKNOWN_SUBMISSION);
        }
        if (get().requests.length >= 20) {
          throw new Error("Too many unresolved submissions. Wait for recovery before generating again.");
        }
        const requestId = crypto.randomUUID();
        const request: PendingSubmission = {
          requestId, owner: normalized,
          job: {
            requestId, modelId: payload.modelId, modelName: payload.modelId,
            prompt: payload.prompt, negativePrompt: payload.negativePrompt,
            type: payload.mediaType === "video" ? "video" : "image",
            isNsfw: !!payload.nsfw, isPublic: false, walletAddress: normalized,
            width: payload.params.width, height: payload.params.height,
            expectedGenerations: payload.params.n || 1, submittedAt: Date.now(),
          },
        };
        // Confirm the recovery handle reached durable browser storage BEFORE POST.
        try {
          set({ requests: [...get().requests, request] });
          const persisted = JSON.parse(localStorage.getItem("aipg-job-store") || "null");
          if (!persisted?.state?.requests?.some((item: PendingSubmission) => item.requestId === requestId && item.owner === normalized)) {
            throw new Error("Recovery handle was not saved");
          }
          prepared?.(requestId);
        } catch {
          // No POST has happened, so dropping this local-only attempt is safe.
          try {
            set({ requests: get().requests.filter((item) => item.requestId !== requestId) });
          } catch {
            console.warn("[JobStore] Browser storage needs attention before submitting.");
          }
          throw new Error("Browser storage is unavailable. No generation was submitted.");
        }
        submitting.add(requestId);
        get().startPolling();
        try {
          const response = await createJob({ ...payload, requestId });
          if (!response.jobId) throw new Error("Missing generation receipt");
          get().resolveRequest(request, response.jobId);
          return response;
        } catch (error) {
          // These synchronous rejections are before broker dispatch. Conflicts,
          // missing routes and gateway/transport failures are deliberately unknown.
          if (error instanceof ApiError && [400, 401, 402, 403, 413, 422, 429].includes(error.status)) {
            set({ requests: get().requests.filter((item) => item.requestId !== requestId) });
            throw error;
          }
          throw new Error(UNKNOWN_SUBMISSION);
        } finally {
          submitting.delete(requestId);
        }
      },

      resolveRequest: (request, jobId) => {
        const existing = get().jobs.find((job) => job.jobId === jobId);
        if (existing && existing.walletAddress !== request.owner) {
          throw new Error("Recovered job belongs to a different local account");
        }
        const job: TrackedJob = { ...request.job, jobId, status: "queued", ...existing };
        // One persisted write hands off the request to ordinary job polling.
        set({
          jobs: [job, ...get().jobs.filter((item) => item.jobId !== jobId)],
          requests: get().requests.filter((item) => item.requestId !== request.requestId || item.owner !== request.owner),
        });
      },

      addJob: (job) => {
        const newJob: TrackedJob = {
          ...get().jobs.find((existing) => existing.jobId === job.jobId),
          ...job,
          status: job.status || "queued",
          submittedAt: Date.now(),
        };

        set((state) => ({
          jobs: [newJob, ...state.jobs.filter((j) => j.jobId !== job.jobId)],
        }));

        // Start polling if not already running
        const store = get();
        if (!store.isPolling) {
          store.startPolling();
        }
      },

      updateJob: (jobId, updates) => {
        set((state) => ({
          jobs: state.jobs.map((job) =>
            job.jobId === jobId ? { ...job, ...updates } : job,
          ),
        }));
      },

      removeJob: (jobId) => {
        set((state) => ({
          jobs: state.jobs.filter((job) => job.jobId !== jobId),
        }));
      },

      clearCompletedJobs: () => {
        set((state) => ({
          jobs: state.jobs.filter(
            (job) =>
              job.walletAddress !== state.activeOwner ||
              (job.status !== "completed" &&
                job.status !== "faulted" &&
                job.status !== "cancelled"),
          ),
        }));
      },

      setActiveOwner: (owner, legacyOwners = []) => {
        const normalized = owner?.toLowerCase() ?? null;
        const aliases = new Set(
          legacyOwners
            .map((alias) => alias.trim().toLowerCase())
            .filter(Boolean),
        );
        const previous = get().activeOwner;
        const currentJobs = get().jobs;
        const jobs = normalized
          ? currentJobs.map((job) =>
              job.walletAddress && aliases.has(job.walletAddress.toLowerCase())
                ? { ...job, walletAddress: normalized }
                : job,
            )
          : currentJobs;
        const jobsChanged = jobs.some(
          (job, index) => job !== currentJobs[index],
        );
        const currentRequests = get().requests;
        const requests = normalized ? currentRequests.map((request) =>
          aliases.has(request.owner.toLowerCase())
            ? { ...request, owner: normalized, job: { ...request.job, walletAddress: normalized } }
            : request,
        ) : currentRequests;
        const requestsChanged = requests.some((request, index) => request !== currentRequests[index]);
        if (previous === normalized && !jobsChanged && !requestsChanged) return;
        get().stopPolling();
        set({ activeOwner: normalized, jobs, requests });
        if (normalized && (get().getActiveJobs().length > 0 || get().requests.some((request) => request.owner === normalized))) {
          get().startPolling();
        }
      },

      startPolling: () => {
        const store = get();
        if (store.isPolling || store.pollIntervalId) return;

        console.log("[JobStore] Starting job polling");

        const poll = () => {
          void store.pollOnce().catch(() => {
            console.error("[JobStore] Recovery storage needs attention. Do not repeat the generation.");
          });
        };
        poll();

        // Set up interval
        const intervalId = setInterval(() => {
          poll();
        }, POLL_INTERVAL);

        set({ isPolling: true, pollIntervalId: intervalId });
      },

      stopPolling: () => {
        const store = get();
        if (store.pollIntervalId) {
          clearInterval(store.pollIntervalId);
        }
        set({ isPolling: false, pollIntervalId: null });
        console.log("[JobStore] Stopped job polling");
      },

      pollOnce: async () => {
        const store = get();
        const owner = store.activeOwner;
        if (!owner) return;
        const pending = store.requests
          .filter((request) => request.owner === owner && (request.retryAt || 0) <= Date.now())
          .slice(0, 2);
        for (const request of pending) {
          if (submitting.has(request.requestId) || recovering.has(request.requestId)) continue;
          recovering.add(request.requestId);
          try {
            const status = await fetchJobByRequest(request.requestId);
            if (get().activeOwner !== owner) continue;
            if (!status.jobId) throw new Error("Missing recovered receipt");
            // Ensure a private history placeholder exists before handing off.
            await addToGallery({ ...request.job, jobId: status.jobId, mediaUrls: [] });
            if (get().activeOwner !== owner) continue;
            get().resolveRequest(request, status.jobId);
          } catch {
            // 404 is not proof of cancellation. Never replace an uncertain POST.
            set({
              requests: get().requests.map((item) =>
                item.requestId === request.requestId && item.owner === owner
                  ? { ...item, retryAt: Date.now() + 30000 }
                  : item,
              ),
            });
          } finally {
            recovering.delete(request.requestId);
          }
        }
        const activeJobs = store.getActiveJobs();

        if (activeJobs.length === 0) {
          // No active jobs, stop polling
          if (!get().requests.some((request) => request.owner === owner)) store.stopPolling();
          return;
        }

        // Poll each active job
        await Promise.all(
          activeJobs.map(async (job) => {
            if ((job.retryAt || 0) > Date.now()) return;
            try {
              const status = await fetchJobStatus(job.jobId);
              if (get().activeOwner !== owner) return;

              // Determine job status from response
              let newStatus: TrackedJob["status"] = job.status;

              if (status.status === "completed") {
                newStatus = "completed";

                // Update gallery with media URLs and seeds if user was authenticated
                if (
                  job.walletAddress &&
                  status.generations &&
                  status.generations.length > 0
                ) {
                  const mediaUrls = status.generations
                    .map((g) => g.url)
                    .filter((url): url is string => !!url);

                  // Extract seeds from each generation
                  // Grid workers often return the same base seed for all batch images
                  // In SD, batch images use seed + index, so we generate unique seeds
                  let seeds = status.generations
                    .map((g) => g.seed || "")
                    .filter((seed): seed is string => !!seed);

                  // If all seeds are identical (batch with same base), generate unique seeds
                  if (seeds.length > 1 && seeds.every((s) => s === seeds[0])) {
                    const baseSeed = parseInt(seeds[0], 10);
                    if (!isNaN(baseSeed)) {
                      seeds = seeds.map((_, idx) => String(baseSeed + idx));
                    }
                  }

                  if (mediaUrls.length > 0) {
                    try {
                      await updateGalleryItem(job.jobId, {
                        mediaUrls,
                        seeds: seeds.length > 0 ? seeds : undefined,
                      });
                      console.log(
                        "[JobStore] Updated gallery item with media and seeds:",
                        job.jobId,
                        seeds,
                      );
                    } catch (err) {
                      console.error(
                        "[JobStore] Failed to update gallery item:",
                        err,
                      );
                    }
                  }
                }
              } else if (status.status === "faulted" || status.faulted) {
                newStatus = "faulted";
              } else if (status.status === "processing") {
                newStatus = "processing";
              } else {
                newStatus = "queued";
              }

              // Track initial wait time for progress calculation
              const existingJob = store.getJob(job.jobId);
              const initialWaitTime =
                existingJob?.initialWaitTime ||
                (status.waitTime && status.waitTime > 0
                  ? status.waitTime
                  : undefined);

              // Always update result with latest status (including partial generations)
              // This allows batch images to appear as they complete
              store.updateJob(job.jobId, {
                status: newStatus,
                waitTime: status.waitTime,
                initialWaitTime,
                queuePosition: status.queuePosition,
                result: status, // Always update with latest status for progressive loading
                // Keep the grid's real failure text — consumers (e.g. the
                // Director's recipe-offline fallback) match on it.
                error: status.error ?? (status.faulted ? "Job failed" : undefined),
                retryAt: undefined,
                pollFailures: 0, // Reset failure count on success
              });
            } catch (error: unknown) {
              const failures = (job.pollFailures || 0) + 1;
              console.error(
                `[JobStore] Failed to poll job ${job.jobId} (attempt ${failures}):`,
                error,
              );

              if (get().activeOwner !== owner) return;
              store.updateJob(job.jobId, {
                error: UNKNOWN_SUBMISSION,
                pollFailures: failures,
                retryAt: Date.now() + 30000,
              });
            }
          }),
        );
      },

      getActiveJobs: () => {
        const owner = get().activeOwner;
        if (!owner) return [];
        return get().jobs.filter(
          (job) =>
            job.walletAddress?.toLowerCase() === owner &&
            (job.status === "queued" || job.status === "processing"),
        );
      },

      getCompletedJobs: () => {
        const owner = get().activeOwner;
        if (!owner) return [];
        return get().jobs.filter(
          (job) =>
            job.walletAddress?.toLowerCase() === owner &&
            (job.status === "completed" ||
              job.status === "faulted" ||
              job.status === "cancelled"),
        );
      },

      getJob: (jobId) => {
        return get().jobs.find((job) => job.jobId === jobId);
      },
    }),
    {
      name: "aipg-job-store",
      // Persist receipts and unresolved request handles, never polling state.
      partialize: (state) => ({ jobs: state.jobs, requests: state.requests }),
      // On rehydrate, clean up old jobs and restart polling if there are active jobs
      onRehydrateStorage: () => (state) => {
        if (state) {
          const now = Date.now();
          const MAX_JOB_AGE = 24 * 60 * 60 * 1000; // 24 hours

          // Filter out jobs older than 24 hours
          const validJobs = state.jobs.filter((job) => {
            if (job.status === "queued" || job.status === "processing") return true;
            const age = now - job.submittedAt;
            if (age > MAX_JOB_AGE) {
              console.log(
                `[JobStore] Removing stale job ${job.jobId} (${Math.round(age / 3600000)}h old)`,
              );
              return false;
            }
            return true;
          });

          // Update state if we removed any jobs
          if (validJobs.length !== state.jobs.length) {
            useJobStore.setState({ jobs: validJobs });
          }

          // Polling starts only after the auth provider selects an owner. This
          // keeps persisted jobs from another account invisible on shared
          // browsers and avoids sending their job IDs under the wrong session.
        }
      },
    },
  ),
);

// Hook to initialize polling on mount (call this in a provider or layout)
export function useJobPolling() {
  const { requests, activeOwner, isPolling, startPolling, getActiveJobs } = useJobStore();

  // Start polling if there are active jobs and not already polling
  if (!isPolling && (getActiveJobs().length > 0 || requests.some((request) => request.owner === activeOwner))) {
    startPolling();
  }

  return { activeCount: getActiveJobs().length };
}
