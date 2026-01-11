"use client";

import { useState, useCallback } from "react";
import { fetchGalleryMedia, GalleryItem } from "@/lib/api";

interface MediaFetchResult {
  mediaUrls: string[];
  mediaSource?: string;
  error?: string;
}

export function useMediaFetching() {
  const [fetching, setFetching] = useState<Set<string>>(new Set());

  const fetchMedia = useCallback(
    async (jobId: string): Promise<MediaFetchResult> => {
      if (fetching.has(jobId)) {
        return { mediaUrls: [] };
      }

      setFetching((prev) => new Set(prev).add(jobId));

      try {
        const media = await fetchGalleryMedia(jobId);
        return {
          mediaUrls: media.mediaUrls || [],
          mediaSource: media.source,
          error: media.error,
        };
      } catch (err: any) {
        return {
          mediaUrls: [],
          error: err.message || "Failed to load media",
        };
      } finally {
        setFetching((prev) => {
          const next = new Set(prev);
          next.delete(jobId);
          return next;
        });
      }
    },
    [fetching]
  );

  const fetchMediaBatch = useCallback(
    async (
      items: GalleryItem[],
      batchSize = 10,
      delayMs = 50
    ): Promise<Map<string, MediaFetchResult>> => {
      const results = new Map<string, MediaFetchResult>();

      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await Promise.allSettled(
          batch.map(async (item) => {
            const result = await fetchMedia(item.jobId);
            return { jobId: item.jobId, result };
          })
        );

        batchResults.forEach((settled) => {
          if (settled.status === "fulfilled") {
            results.set(settled.value.jobId, settled.value.result);
          }
        });

        if (i + batchSize < items.length) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }

      return results;
    },
    [fetchMedia]
  );

  return { fetchMedia, fetchMediaBatch };
}
