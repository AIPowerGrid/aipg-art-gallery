import { useEffect, useState } from "react";
import { fetchModels } from "@/lib/api";

interface ModelAvailability {
  checked: boolean;
  onlineModelIds: ReadonlySet<string>;
}

const EMPTY_MODEL_IDS = new Set<string>();

/**
 * Fetch live Grid capacity. Static style configuration describes what the UI
 * supports; it must not be used as evidence that a worker is online.
 */
export function useModelAvailability(): ModelAvailability {
  const [availability, setAvailability] = useState<ModelAvailability>({
    checked: false,
    onlineModelIds: EMPTY_MODEL_IDS,
  });

  useEffect(() => {
    let cancelled = false;

    void fetchModels()
      .then(({ models }) => {
        if (cancelled) return;
        setAvailability({
          checked: true,
          onlineModelIds: new Set(
            models
              .filter((model) => model.status === "online" && model.onlineWorkers > 0)
              .map((model) => model.id),
          ),
        });
      })
      .catch(() => {
        if (!cancelled) {
          // A failed status lookup is not proof of capacity. Fail closed.
          setAvailability({ checked: true, onlineModelIds: EMPTY_MODEL_IDS });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return availability;
}
