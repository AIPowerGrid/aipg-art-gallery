import { useState, useEffect, useCallback, useMemo } from 'react';
import { useJobStore } from '@/lib/stores/job-store';
import { fetchMyGallery, GalleryItem } from '@/lib/api';
import { DisplayCreation, generateTagsFromPrompt } from '@/lib/storage';
import { calculateProgress } from '@/lib/hooks/use-favicon-progress';

/**
 * Sort creations: generating jobs first, then by date descending
 */
function sortCreations(arr: DisplayCreation[]): DisplayCreation[] {
  return [...arr].sort((a, b) => {
    if (a.isGenerating && !b.isGenerating) return -1;
    if (!a.isGenerating && b.isGenerating) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

/**
 * Convert a job from the job store to a DisplayCreation placeholder
 */
function jobToPlaceholder(job: ReturnType<typeof useJobStore.getState>['jobs'][0]): DisplayCreation {
  return {
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
    // Prefer the worker's REAL progress when reported; fall back to the
    // time-based estimate until the first real % arrives.
    progress: typeof job.result?.progress === "number"
      ? job.result.progress
      : calculateProgress(job.submittedAt, job.initialWaitTime, job.waitTime, job.status),
    status: job.status,
    width: job.width,
    height: job.height,
    expectedGenerations: job.expectedGenerations,
  };
}

/**
 * Convert a completed job to a DisplayCreation
 */
function completedJobToCreation(job: ReturnType<typeof useJobStore.getState>['jobs'][0]): DisplayCreation {
  const firstSeed = job.result?.generations?.[0]?.seed || "";
  return {
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
      workerName: g.workerName,
    })),
    worker: job.result?.worker,
    genTime: job.result?.genTime,
    gridJobId: job.result?.gridJobId,
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
      seed: firstSeed,
    },
  };
}

/**
 * Convert a gallery item from the server to a DisplayCreation
 */
function galleryItemToCreation(item: GalleryItem): DisplayCreation {
  return {
    jobId: item.jobId,
    modelId: item.modelId,
    modelName: item.modelName,
    prompt: item.prompt,
    type: item.type as "image" | "video",
    createdAt: item.createdAt,
    generations: item.mediaUrls?.map((url, idx) => ({
      id: `${item.jobId}-${idx}`,
      seed: item.seeds?.[idx] || item.params?.seed || '',
      kind: item.type as "image" | "video",
      url: url,
    })) || [],
    tags: generateTagsFromPrompt(item.prompt),
    walletAddress: item.walletAddress,
    isPublic: item.isPublic,
    width: item.params?.width,
    height: item.params?.height,
    expectedGenerations: item.mediaUrls?.length,
    params: item.params,
    worker: item.worker,
    genTime: item.genTime,
    gridJobId: item.gridJobId,
    isGenerating: false,
  };
}

interface UseCreationsReturn {
  creations: DisplayCreation[];
  isLoaded: boolean;
  addCreation: (creation: DisplayCreation) => void;
  removeCreation: (jobId: string) => void;
  hasActiveJobs: boolean;
  refresh: () => void;
}

/**
 * Hook to manage creations with a single source of truth
 * Merges only the selected account's persisted jobs and authenticated history.
 */
export function useCreations(accountId?: string): UseCreationsReturn {
  const owner = accountId?.trim().toLowerCase() || null;
  const [creations, setCreations] = useState<DisplayCreation[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadedOwner, setLoadedOwner] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  const { jobs: allJobs, removeJob } = useJobStore();
  const jobs = useMemo(() => owner
    ? allJobs.filter(job => job.walletAddress?.toLowerCase() === owner)
    : [], [allJobs, owner]);
  const currentLoaded = isLoaded && loadedOwner === owner;

  // Refresh function to reload creations
  const refresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  // Load creations on mount and when address changes
  useEffect(() => {
    let cancelled = false;
    setIsLoaded(false);
    setCreations([]);

    async function loadCreations() {
      const activeJobsFromStore = owner ? useJobStore.getState().jobs.filter(
        job => job.walletAddress?.toLowerCase() === owner,
      ) : [];

      // Build placeholders for active jobs
      const activePlaceholders = activeJobsFromStore
        .filter(job => job.status === 'queued' || job.status === 'processing')
        .map(jobToPlaceholder);

      // Get recently completed jobs (might not be on server yet)
      const completedCreations = activeJobsFromStore
        .filter(job => job.status === 'completed' && job.result?.generations?.length)
        .map(completedJobToCreation);

      // Anonymous browser history may belong to a previous account. Never import it.
      let serverCreations: DisplayCreation[] = [];

      if (owner) {
        try {
          const serverData = await fetchMyGallery(100);
          if (cancelled) return;

          serverCreations = serverData.items
            .filter((item: GalleryItem) => item.mediaUrls?.length && item.mediaUrls[0])
            .map(galleryItemToCreation);
        } catch (err) {
          console.error("Failed to load creations from server:", err);
        }
      }

      if (cancelled) return;

      // Merge all sources, avoiding duplicates (active > completed > server)
      const allJobIds = new Set<string>();
      const merged: DisplayCreation[] = [];

      for (const c of activePlaceholders) {
        if (!allJobIds.has(c.jobId)) {
          allJobIds.add(c.jobId);
          merged.push(c);
        }
      }

      for (const c of completedCreations) {
        if (!allJobIds.has(c.jobId)) {
          allJobIds.add(c.jobId);
          merged.push(c);
        }
      }

      for (const c of serverCreations) {
        if (!allJobIds.has(c.jobId)) {
          allJobIds.add(c.jobId);
          merged.push(c);
        }
      }

      setCreations(sortCreations(merged));
      setLoadedOwner(owner);
      setIsLoaded(true);
    }

    loadCreations();

    return () => { cancelled = true; };
  }, [owner, refreshTrigger]);

  // Update progress for active jobs
  useEffect(() => {
    if (!currentLoaded) return;

    const activeJobsFromStore = jobs.filter(job => job.status === 'queued' || job.status === 'processing');

    setCreations(prev => {
      const updated = [...prev];
      let changed = false;

      activeJobsFromStore.forEach(job => {
        const idx = updated.findIndex(c => c.jobId === job.jobId);
        if (idx !== -1 && updated[idx].isGenerating) {
          const newProgress = typeof job.result?.progress === "number"
            ? job.result.progress
            : calculateProgress(job.submittedAt, job.initialWaitTime, job.waitTime, job.status);
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
  }, [jobs, currentLoaded]);

  // Handle job completions and failures
  useEffect(() => {
    if (!currentLoaded) return;

    const completedJobs = jobs.filter(j => j.status === 'completed' && j.result?.generations?.length);
    const faultedJobs = jobs.filter(j => j.status === 'faulted');

    if (completedJobs.length === 0 && faultedJobs.length === 0) return;

    setCreations(prev => {
      let updated = [...prev];
      let changed = false;

      // Handle completed jobs
      completedJobs.forEach(job => {
        const idx = updated.findIndex(c => c.jobId === job.jobId);
        const firstSeed = job.result?.generations?.[0]?.seed || "";

        if (idx !== -1 && updated[idx].isGenerating) {
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
              workerName: g.workerName,
            })),
            worker: job.result?.worker,
            genTime: job.result?.genTime,
            gridJobId: job.result?.gridJobId,
            params: { ...existingParams, seed: firstSeed },
          };
          changed = true;
        } else if (idx === -1) {
          updated.unshift(completedJobToCreation(job));
          changed = true;
        }
      });

      // Handle faulted jobs - remove them
      const faultedIds = new Set(faultedJobs.map(j => j.jobId));
      const beforeLen = updated.length;
      updated = updated.filter(c => !faultedIds.has(c.jobId));
      if (updated.length !== beforeLen) changed = true;

      return changed ? sortCreations(updated) : prev;
    });
  }, [jobs, currentLoaded]);

  // Add a new creation (placeholder)
  const addCreation = useCallback((creation: DisplayCreation) => {
    if (!owner || useJobStore.getState().activeOwner !== owner ||
        creation.walletAddress?.toLowerCase() !== owner) return;
    setCreations(prev => sortCreations([creation, ...prev.filter(c => c.jobId !== creation.jobId)]));
  }, [owner]);

  // Remove a creation
  const removeCreation = useCallback((jobId: string) => {
    if (!owner || useJobStore.getState().activeOwner !== owner) return;
    setCreations(prev => prev.filter(c => c.jobId !== jobId));
    if (jobs.some(job => job.jobId === jobId)) removeJob(jobId);
  }, [owner, jobs, removeJob]);

  // Check if there are active jobs
  const hasActiveJobs = jobs.some(j => j.status === 'queued' || j.status === 'processing');

  return {
    creations: currentLoaded ? creations : [],
    isLoaded: currentLoaded,
    addCreation,
    removeCreation,
    hasActiveJobs,
    refresh,
  };
}
