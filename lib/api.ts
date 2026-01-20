import { CreateJobRequest, GalleryModel, JobStatus, ModelsResponse } from "@/types/models";
import { getAuthToken } from "./auth";

const getApiBase = () =>
  process.env.NEXT_PUBLIC_GALLERY_API ?? "http://localhost:4000/api";

async function jsonFetch<T>(
  path: string,
  init?: RequestInit,
  revalidate?: number
): Promise<T> {
  // Build headers with JWT auth if available
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  };
  
  // Add JWT token for authenticated requests
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${getApiBase()}${path}`, {
    ...init,
    headers,
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

// Gallery API

export interface JobParams {
  width?: number;
  height?: number;
  steps?: number;
  cfgScale?: number;
  sampler?: string;
  scheduler?: string;
  seed?: string;
  denoise?: number;
  length?: number;
  fps?: number;
  tiling?: boolean;
  hiresFix?: boolean;
}

export interface GalleryItem {
  jobId: string;
  modelId: string;
  modelName: string;
  prompt: string;
  negativePrompt?: string;
  type: "image" | "video";
  isNsfw: boolean;
  isPublic?: boolean;
  walletAddress?: string;
  createdAt: number;
  params?: JobParams;
  mediaUrls?: string[];
}

export interface GalleryResponse {
  items: GalleryItem[];
  total: number;
  hasMore: boolean;
  nextOffset: number;
}

export interface GalleryFilters {
  type?: string;
  models?: string[];
  aspect?: "square" | "landscape" | "portrait";
  nsfw?: "sfw" | "nsfw" | "all";
}

export function fetchGallery(
  typeFilter?: string, 
  limit?: number, 
  offset?: number, 
  searchQuery?: string,
  filters?: GalleryFilters
): Promise<GalleryResponse> {
  const params = new URLSearchParams();
  const effectiveType = filters?.type || typeFilter;
  if (effectiveType && effectiveType !== "all") params.append("type", effectiveType);
  if (limit) params.append("limit", String(limit));
  if (offset !== undefined) params.append("offset", String(offset));
  if (searchQuery) params.append("q", searchQuery);
  if (filters?.models && filters.models.length > 0) {
    params.append("models", filters.models.join(","));
  }
  if (filters?.aspect) params.append("aspect", filters.aspect);
  if (filters?.nsfw && filters.nsfw !== "all") params.append("nsfw", filters.nsfw);
  const query = params.toString();
  return jsonFetch(`/gallery${query ? `?${query}` : ""}`);
}

export interface GalleryModelsResponse {
  models: string[];
}

export function fetchGalleryModels(): Promise<GalleryModelsResponse> {
  return jsonFetch("/gallery/models");
}

export interface AddToGalleryRequest {
  jobId: string;
  modelId: string;
  modelName: string;
  prompt: string;
  negativePrompt?: string;
  type: "image" | "video";
  isNsfw: boolean;
  isPublic: boolean;
  walletAddress?: string;
  params?: JobParams;
  mediaUrls?: string[];
}

export function addToGallery(item: AddToGalleryRequest): Promise<{ success: boolean }> {
  return jsonFetch("/gallery", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item),
  });
}

export interface WalletGalleryResponse {
  items: GalleryItem[];
  count: number;
  wallet: string;
}

export function fetchGalleryByWallet(walletAddress: string, limit?: number): Promise<WalletGalleryResponse> {
  const params = new URLSearchParams();
  if (limit) params.append("limit", String(limit));
  const query = params.toString();
  return jsonFetch(`/gallery/wallet/${walletAddress}${query ? `?${query}` : ""}`);
}

export interface GalleryMediaResponse {
  jobId: string;
  mediaUrls: string[];
  type: "image" | "video";
  source: "r2" | "grid-api" | "cache";
  error?: string;
}

export function fetchGalleryMedia(jobId: string): Promise<GalleryMediaResponse> {
  return jsonFetch(`/gallery/${jobId}/media`);
}

// Protected endpoints - require JWT authentication (handled automatically by jsonFetch)

export function deleteGalleryItem(jobId: string): Promise<{ success: boolean; message: string }> {
  return jsonFetch(`/gallery/${jobId}`, {
    method: "DELETE",
  });
}

export function publishGalleryItem(jobId: string): Promise<{ success: boolean; isPublic: boolean }> {
  return jsonFetch(`/gallery/${jobId}/publish`, {
    method: "POST",
  });
}

// Favorites API - JWT authenticated
export function addFavorite(jobId: string): Promise<{ success: boolean }> {
  return jsonFetch(`/favorites/${jobId}`, {
    method: "POST",
  });
}

export function removeFavorite(jobId: string): Promise<{ success: boolean }> {
  return jsonFetch(`/favorites/${jobId}`, {
    method: "DELETE",
  });
}

export function getFavorites(walletAddress: string, limit?: number): Promise<{ items: GalleryItem[]; count: number }> {
  const params = new URLSearchParams();
  if (limit) params.append("limit", String(limit));
  const query = params.toString();
  return jsonFetch(`/favorites/wallet/${walletAddress}${query ? `?${query}` : ""}`);
}

export function checkFavorite(walletAddress: string, jobId: string): Promise<{ favorited: boolean }> {
  return jsonFetch(`/favorites/check/${walletAddress}/${jobId}`);
}
