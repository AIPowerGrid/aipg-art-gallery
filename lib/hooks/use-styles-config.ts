import { useState, useEffect } from 'react';
import { fetchStylesConfig } from '@/lib/api';
import { StylesConfig } from '@/lib/types/create';

interface UseStylesConfigReturn {
  styles: StylesConfig | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook to fetch and manage styles configuration (models, dimensions, defaults)
 */
export function useStylesConfig(): UseStylesConfigReturn {
  const [styles, setStyles] = useState<StylesConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchStyles() {
      try {
        const data = await fetchStylesConfig();
        if (!cancelled) {
          setStyles(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load configuration');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchStyles();

    return () => { cancelled = true; };
  }, []);

  return { styles, isLoading, error };
}

/**
 * Get the default model from styles config
 */
export function getDefaultModel(styles: StylesConfig | null) {
  if (!styles) return null;
  return styles.models.find(m => m.default) || styles.models[0] || null;
}

/**
 * Get dimension by ID from styles config
 */
export function getDimension(styles: StylesConfig | null, dimensionId: number) {
  if (!styles) return null;
  return styles.dimensions.find(d => d.id === dimensionId) || null;
}
