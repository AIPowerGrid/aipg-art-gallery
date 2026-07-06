import { useEffect, useState } from "react";
import { fetchGridStyles } from "@/lib/api";
import { GridStyle } from "@/types/models";

/** Fetch the grid's curated creative styles (GET /api/styles/grid). */
export function useGridStyles() {
  const [styles, setStyles] = useState<GridStyle[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchGridStyles()
      .then((r) => {
        if (!cancelled) setStyles(r.styles || []);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load styles");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { gridStyles: styles, gridStylesError: error };
}
