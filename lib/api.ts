import { CreateJobRequest, GalleryModel, JobStatus, ModelsResponse } from "@/types/models";

const getApiBase = () =>
  process.env.NEXT_PUBLIC_GALLERY_API ?? "http://localhost:4000/api";

async function jsonFetch<T>(
  path: string,
  init?: RequestInit,
  revalidate?: number
): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    ...init,
    next: revalidate ? { revalidate } : undefined,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // Include status code in error for rate limit detection
    const message = body.error || body.message || res.statusText;
    throw new Error(`${res.status}: ${message}`);
  }
  return res.json();
}

/**
 * Fetch all available models from the API.
 * Models are sourced from the blockchain ModelVault contract and merged
 * with local presets for defaults and limits.
 */
export function fetchModels(): Promise<ModelsResponse> {
  return jsonFetch("/models", undefined, 30);
}

export function createJob(payload: CreateJobRequest) {
  return jsonFetch<{ jobId: string; status: string }>("/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function fetchJobStatus(jobId: string) {
  return jsonFetch<JobStatus>(`/jobs/${jobId}`);
}

