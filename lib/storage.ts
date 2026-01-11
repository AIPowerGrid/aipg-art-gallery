/**
 * Local storage for job history - eliminates need for Supabase
 * Jobs are stored locally and media URLs come from Grid API / R2
 */

const STORAGE_KEY = 'aipg_job_history';
const CREATIONS_KEY = 'aipg_creations';
const ACTIVE_JOBS_KEY = 'aipg_active_jobs'; // For queued/processing jobs that survive refresh
const MAX_JOBS = 100; // Keep last 100 jobs
const MAX_CREATIONS = 50; // Keep last 50 creations with media

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

export interface StoredGeneration {
  id: string;
  seed: string;
  kind: 'image' | 'video';
  url?: string;
  base64?: string;
  workerName?: string;
}

export interface StoredCreation {
  jobId: string;
  modelId: string;
  modelName: string;
  prompt: string;
  type: 'image' | 'video';
  createdAt: number;
  generations: StoredGeneration[];
  tags: string[];
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

// ========== CREATIONS (with media) ==========

/**
 * Get all stored creations from localStorage
 */
export function getStoredCreations(): StoredCreation[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const data = localStorage.getItem(CREATIONS_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch {
    return [];
  }
}

/**
 * Save a completed creation with its generations
 */
export function saveCreation(creation: StoredCreation): void {
  if (typeof window === 'undefined') return;
  
  try {
    const creations = getStoredCreations();
    
    // Check if creation already exists
    const existingIndex = creations.findIndex(c => c.jobId === creation.jobId);
    if (existingIndex >= 0) {
      creations[existingIndex] = creation;
    } else {
      creations.unshift(creation); // Add to beginning
    }
    
    // Trim to max size
    const trimmed = creations.slice(0, MAX_CREATIONS);
    
    localStorage.setItem(CREATIONS_KEY, JSON.stringify(trimmed));
  } catch (error) {
    console.error('Failed to save creation to localStorage:', error);
  }
}

/**
 * Update tags for a creation
 */
export function updateCreationTags(jobId: string, tags: string[]): void {
  if (typeof window === 'undefined') return;
  
  try {
    const creations = getStoredCreations();
    const index = creations.findIndex(c => c.jobId === jobId);
    if (index >= 0) {
      creations[index].tags = tags;
      localStorage.setItem(CREATIONS_KEY, JSON.stringify(creations));
    }
  } catch (error) {
    console.error('Failed to update creation tags:', error);
  }
}

/**
 * Remove a creation from localStorage
 */
export function removeCreation(jobId: string): void {
  if (typeof window === 'undefined') return;
  
  try {
    const creations = getStoredCreations();
    const filtered = creations.filter(c => c.jobId !== jobId);
    localStorage.setItem(CREATIONS_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Failed to remove creation from localStorage:', error);
  }
}

/**
 * Search creations by tags or prompt
 */
export function searchCreations(query: string): StoredCreation[] {
  const creations = getStoredCreations();
  const lowerQuery = query.toLowerCase();
  
  return creations.filter(c => 
    c.prompt.toLowerCase().includes(lowerQuery) ||
    c.tags.some(tag => tag.toLowerCase().includes(lowerQuery)) ||
    c.modelName.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Generate tags from prompt - only truly key words that provide distinguishable searches
 * Focuses on distinctive nouns, specific descriptors, and unique identifiers
 */
export function generateTagsFromPrompt(prompt: string): string[] {
  // Extended stop words - includes generic quality descriptors
  const stopWords = new Set([
    // Articles and pronouns
    'a', 'an', 'the', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
    // Common verbs
    'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 
    'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
    // Prepositions and conjunctions
    'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as',
    'if', 'because', 'although', 'though', 'while', 'where', 'when', 'why', 'how',
    'after', 'before', 'above', 'below', 'between', 'under', 'over', 'through', 'during',
    'against', 'about', 'into', 'onto', 'upon', 'within', 'without',
    // Generic qualifiers
    'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such',
    'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
    'also', 'now', 'here', 'there', 'then', 'once',
    // Generic quality descriptors (too common to be distinctive)
    'high', 'quality', 'detailed', 'sharp', 'clear', 'good', 'great', 'excellent',
    'beautiful', 'nice', 'fine', 'perfect', 'best', 'better', 'amazing', 'wonderful',
    'smooth', 'clean', 'bright', 'dark', 'light', 'big', 'small', 'large', 'tiny',
    'long', 'short', 'wide', 'narrow', 'thick', 'thin', 'full', 'empty',
    // Common style descriptors (unless part of compound)
    'style', 'art', 'artwork', 'image', 'picture', 'photo', 'photograph', 'drawing',
    'painting', 'illustration', 'render', 'rendering', 'scene', 'view', 'shot',
  ]);
  
  // Extract potential keywords
  const words = prompt
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(word => {
      // Must be at least 3 characters
      if (word.length < 3) return false;
      // Must not be a stop word
      if (stopWords.has(word)) return false;
      // Must not be purely numeric
      if (/^\d+$/.test(word)) return false;
      return true;
    });
  
  // Prioritize distinctive words:
  // 1. Compound words (hyphenated or common compounds)
  // 2. Longer words (4+ chars) - more specific
  // 3. Words that appear less frequently in prompts
  
  const scored = words.map(word => {
    let score = 0;
    // Longer words are more distinctive
    score += word.length;
    // Compound words (with hyphens) are more specific
    if (word.includes('-')) score += 5;
    // Prefer words that aren't too common
    const commonWords = ['portrait', 'landscape', 'background', 'foreground', 'subject', 'object'];
    if (!commonWords.includes(word)) score += 2;
    return { word, score };
  });
  
  // Sort by score (highest first) and take top 5
  const topTags = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(item => item.word);
  
  return [...new Set(topTags)];
}

// ========== ACTIVE JOBS (queued/processing) ==========

export interface ActiveJob {
  jobId: string;
  submittedAt: number;
  status: 'queued' | 'processing' | 'completed' | 'faulted' | null;
  error?: string;
}

/**
 * Get all active jobs (queued/processing) from localStorage
 */
export function getActiveJobs(): ActiveJob[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const data = localStorage.getItem(ACTIVE_JOBS_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch {
    return [];
  }
}

/**
 * Save an active job to localStorage
 */
export function saveActiveJob(job: ActiveJob): void {
  if (typeof window === 'undefined') return;
  
  try {
    const jobs = getActiveJobs();
    
    // Check if job already exists
    const existingIndex = jobs.findIndex(j => j.jobId === job.jobId);
    if (existingIndex >= 0) {
      jobs[existingIndex] = job;
    } else {
      jobs.unshift(job); // Add to beginning
    }
    
    // Remove completed/faulted jobs older than 1 hour
    const now = Date.now();
    const filtered = jobs.filter(j => {
      if (j.status === 'completed' || j.status === 'faulted') {
        return (now - j.submittedAt) < 3600000; // Keep for 1 hour
      }
      return true; // Keep all queued/processing jobs
    });
    
    localStorage.setItem(ACTIVE_JOBS_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Failed to save active job to localStorage:', error);
  }
}

/**
 * Update an active job's status
 */
export function updateActiveJob(jobId: string, updates: Partial<ActiveJob>): void {
  if (typeof window === 'undefined') return;
  
  try {
    const jobs = getActiveJobs();
    const index = jobs.findIndex(j => j.jobId === jobId);
    if (index >= 0) {
      jobs[index] = { ...jobs[index], ...updates };
      localStorage.setItem(ACTIVE_JOBS_KEY, JSON.stringify(jobs));
    }
  } catch (error) {
    console.error('Failed to update active job:', error);
  }
}

/**
 * Remove an active job from localStorage (when completed/faulted)
 */
export function removeActiveJob(jobId: string): void {
  if (typeof window === 'undefined') return;
  
  try {
    const jobs = getActiveJobs();
    const filtered = jobs.filter(j => j.jobId !== jobId);
    localStorage.setItem(ACTIVE_JOBS_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Failed to remove active job from localStorage:', error);
  }
}

/**
 * Clear all active jobs
 */
export function clearActiveJobs(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ACTIVE_JOBS_KEY);
}


