import { CreateJobRequest, GalleryModel, JobStatus } from "@/types/models";

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
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

export function fetchModels(): Promise<{ models: GalleryModel[] }> {
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

