/**
 * Global job tracking store using Zustand
 * Persists active jobs to localStorage and polls for status updates
 * Jobs survive page navigation and browser refresh
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { fetchJobStatus, updateGalleryItem } from '@/lib/api';
import { JobStatus } from '@/types/models';

export interface TrackedJob {
  jobId: string;
  modelId: string;
  modelName: string;
  prompt: string;
  negativePrompt?: string;
  type: 'image' | 'video';
  isNsfw: boolean;
  isPublic: boolean;
  walletAddress?: string;
  submittedAt: number;
  status: 'queued' | 'processing' | 'completed' | 'faulted' | 'cancelled';
  waitTime?: number;
  initialWaitTime?: number; // First wait time estimate (for progress calculation)
  queuePosition?: number;
  error?: string;
  result?: JobStatus; // Full result when completed
  pollFailures?: number; // Count consecutive poll failures
}

interface JobStore {
  // State
  jobs: TrackedJob[];
  isPolling: boolean;
  pollIntervalId: NodeJS.Timeout | null;

  // Actions
  addJob: (job: Omit<TrackedJob, 'status' | 'submittedAt'> & { status?: TrackedJob['status'] }) => void;
  updateJob: (jobId: string, updates: Partial<TrackedJob>) => void;
  removeJob: (jobId: string) => void;
  clearCompletedJobs: () => void;
  
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
      isPolling: false,
      pollIntervalId: null,

      addJob: (job) => {
        const newJob: TrackedJob = {
          ...job,
          status: job.status || 'queued',
          submittedAt: Date.now(),
        };
        
        set((state) => ({
          jobs: [newJob, ...state.jobs.filter(j => j.jobId !== job.jobId)],
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
            job.jobId === jobId ? { ...job, ...updates } : job
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
            (job) => job.status !== 'completed' && job.status !== 'faulted' && job.status !== 'cancelled'
          ),
        }));
      },

      startPolling: () => {
        const store = get();
        if (store.isPolling || store.pollIntervalId) return;

        console.log('[JobStore] Starting job polling');
        
        // Poll immediately
        store.pollOnce();

        // Set up interval
        const intervalId = setInterval(() => {
          store.pollOnce();
        }, POLL_INTERVAL);

        set({ isPolling: true, pollIntervalId: intervalId });
      },

      stopPolling: () => {
        const store = get();
        if (store.pollIntervalId) {
          clearInterval(store.pollIntervalId);
        }
        set({ isPolling: false, pollIntervalId: null });
        console.log('[JobStore] Stopped job polling');
      },

      pollOnce: async () => {
        const store = get();
        const activeJobs = store.getActiveJobs();

        if (activeJobs.length === 0) {
          // No active jobs, stop polling
          store.stopPolling();
          return;
        }

        // Poll each active job
        await Promise.all(
          activeJobs.map(async (job) => {
            try {
              const status = await fetchJobStatus(job.jobId);
              
              // Determine job status from response
              let newStatus: TrackedJob['status'] = job.status;
              
              if (status.status === 'completed') {
                newStatus = 'completed';
                
                // Update gallery with media URLs if user was authenticated
                if (job.walletAddress && status.generations && status.generations.length > 0) {
                  const mediaUrls = status.generations
                    .map(g => g.url)
                    .filter((url): url is string => !!url);
                  
                  if (mediaUrls.length > 0) {
                    try {
                      await updateGalleryItem(job.jobId, mediaUrls);
                      console.log('[JobStore] Updated gallery item with media:', job.jobId);
                    } catch (err) {
                      console.error('[JobStore] Failed to update gallery item:', err);
                    }
                  }
                }
              } else if (status.status === 'faulted' || status.faulted) {
                newStatus = 'faulted';
              } else if (status.status === 'processing') {
                newStatus = 'processing';
              } else {
                newStatus = 'queued';
              }

              // Track initial wait time for progress calculation
              const existingJob = store.getJob(job.jobId);
              const initialWaitTime = existingJob?.initialWaitTime || 
                (status.waitTime && status.waitTime > 0 ? status.waitTime : undefined);

              store.updateJob(job.jobId, {
                status: newStatus,
                waitTime: status.waitTime,
                initialWaitTime,
                queuePosition: status.queuePosition,
                result: status.status === 'completed' ? status : undefined,
                error: status.faulted ? 'Job failed' : undefined,
                pollFailures: 0, // Reset failure count on success
              });

            } catch (error: any) {
              const failures = (job.pollFailures || 0) + 1;
              console.error(`[JobStore] Failed to poll job ${job.jobId} (attempt ${failures}):`, error);
              
              // If we get a 404 or similar, mark as faulted immediately
              if (error.message?.includes('404') || error.message?.includes('not found')) {
                store.updateJob(job.jobId, {
                  status: 'faulted',
                  error: 'Job not found - may have expired',
                  pollFailures: failures,
                });
              } else if (failures >= 10) {
                // After 10 consecutive failures, give up
                console.error(`[JobStore] Giving up on job ${job.jobId} after ${failures} failures`);
                store.updateJob(job.jobId, {
                  status: 'faulted',
                  error: 'Failed to get job status - server may be unavailable',
                  pollFailures: failures,
                });
              } else {
                // Track the failure count
                store.updateJob(job.jobId, { pollFailures: failures });
              }
            }
          })
        );
      },

      getActiveJobs: () => {
        return get().jobs.filter(
          (job) => job.status === 'queued' || job.status === 'processing'
        );
      },

      getCompletedJobs: () => {
        return get().jobs.filter(
          (job) => job.status === 'completed' || job.status === 'faulted' || job.status === 'cancelled'
        );
      },

      getJob: (jobId) => {
        return get().jobs.find((job) => job.jobId === jobId);
      },
    }),
    {
      name: 'aipg-job-store',
      // Only persist the jobs array, not polling state
      partialize: (state) => ({ jobs: state.jobs }),
      // On rehydrate, clean up old jobs and restart polling if there are active jobs
      onRehydrateStorage: () => (state) => {
        if (state) {
          const now = Date.now();
          const MAX_JOB_AGE = 24 * 60 * 60 * 1000; // 24 hours
          
          // Filter out jobs older than 24 hours
          const validJobs = state.jobs.filter((job) => {
            const age = now - job.submittedAt;
            if (age > MAX_JOB_AGE) {
              console.log(`[JobStore] Removing stale job ${job.jobId} (${Math.round(age / 3600000)}h old)`);
              return false;
            }
            return true;
          });
          
          // Update state if we removed any jobs
          if (validJobs.length !== state.jobs.length) {
            useJobStore.setState({ jobs: validJobs });
          }
          
          const activeJobs = validJobs.filter(
            (job) => job.status === 'queued' || job.status === 'processing'
          );
          if (activeJobs.length > 0) {
            console.log(`[JobStore] Rehydrated with ${activeJobs.length} active jobs, starting polling`);
            // Delay to ensure store is ready
            setTimeout(() => {
              state.startPolling();
            }, 100);
          }
        }
      },
    }
  )
);

// Hook to initialize polling on mount (call this in a provider or layout)
export function useJobPolling() {
  const { jobs, isPolling, startPolling, getActiveJobs } = useJobStore();
  
  // Start polling if there are active jobs and not already polling
  if (!isPolling && getActiveJobs().length > 0) {
    startPolling();
  }
  
  return { activeCount: getActiveJobs().length };
}
