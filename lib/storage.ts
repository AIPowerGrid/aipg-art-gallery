/**
 * Local storage for job history - eliminates need for Supabase
 * Jobs are stored locally and media URLs come from Grid API / R2
 */

const STORAGE_KEY = 'aipg_job_history';
const MAX_JOBS = 100; // Keep last 100 jobs

export interface StoredJob {
  jobId: string;
  modelId: string;
  modelName: string;
  prompt: string;
  negativePrompt?: string;
  isPublic: boolean;
  isNsfw: boolean;
  createdAt: number;
  type: 'image' | 'video';
  walletAddress?: string;
}

/**
 * Get all stored jobs from localStorage
 */
export function getStoredJobs(): StoredJob[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch {
    return [];
  }
}

/**
 * Get jobs for a specific wallet address
 */
export function getJobsByWallet(walletAddress: string): StoredJob[] {
  return getStoredJobs().filter(
    job => job.walletAddress?.toLowerCase() === walletAddress.toLowerCase()
  );
}

/**
 * Get public jobs (for gallery)
 */
export function getPublicJobs(): StoredJob[] {
  return getStoredJobs().filter(job => job.isPublic);
}

/**
 * Save a new job to localStorage
 */
export function saveJob(job: StoredJob): void {
  if (typeof window === 'undefined') return;
  
  try {
    const jobs = getStoredJobs();
    
    // Check if job already exists
    const existingIndex = jobs.findIndex(j => j.jobId === job.jobId);
    if (existingIndex >= 0) {
      jobs[existingIndex] = job;
    } else {
      jobs.unshift(job); // Add to beginning
    }
    
    // Trim to max size
    const trimmed = jobs.slice(0, MAX_JOBS);
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (error) {
    console.error('Failed to save job to localStorage:', error);
  }
}

/**
 * Remove a job from localStorage
 */
export function removeJob(jobId: string): void {
  if (typeof window === 'undefined') return;
  
  try {
    const jobs = getStoredJobs();
    const filtered = jobs.filter(j => j.jobId !== jobId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Failed to remove job from localStorage:', error);
  }
}

/**
 * Clear all stored jobs
 */
export function clearJobs(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}


