// Generation limits for anonymous users
const ANON_GENERATION_KEY = 'aipg_anon_generations';
const ANON_GENERATION_LIMIT = 5;

export interface GenerationRecord {
  timestamp: number;
  jobId: string;
}

export function getAnonGenerationCount(): number {
  if (typeof window === 'undefined') return 0;
  
  try {
    const data = localStorage.getItem(ANON_GENERATION_KEY);
    if (!data) return 0;
    
    const records: GenerationRecord[] = JSON.parse(data);
    return records.length;
  } catch {
    return 0;
  }
}

export function canGenerateAnon(): boolean {
  return getAnonGenerationCount() < ANON_GENERATION_LIMIT;
}

export function getRemainingGenerations(): number {
  return Math.max(0, ANON_GENERATION_LIMIT - getAnonGenerationCount());
}

export function recordAnonGeneration(jobId: string): void {
  if (typeof window === 'undefined') return;
  
  try {
    const data = localStorage.getItem(ANON_GENERATION_KEY);
    const records: GenerationRecord[] = data ? JSON.parse(data) : [];
    
    records.push({
      timestamp: Date.now(),
      jobId
    });
    
    localStorage.setItem(ANON_GENERATION_KEY, JSON.stringify(records));
  } catch (err) {
    console.error('Failed to record generation:', err);
  }
}

export function clearAnonGenerations(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ANON_GENERATION_KEY);
}

export const GENERATION_LIMIT = ANON_GENERATION_LIMIT;
