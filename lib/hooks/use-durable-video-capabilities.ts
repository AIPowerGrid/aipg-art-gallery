import { useEffect, useState } from "react";
import { DurableVideoCapabilities, fetchDurableVideoCapabilities } from "@/lib/api";

export function useDurableVideoCapabilities(authenticated: boolean, ownerIdentifier?: string) {
  const owner = authenticated ? ownerIdentifier?.trim().toLowerCase() : undefined;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; value: DurableVideoCapabilities | null; error: boolean } | null>(null);
  const key = owner ? JSON.stringify([owner, attempt]) : null;
  useEffect(() => {
    if (!key) { setState(null); return; }
    let active = true;
    void fetchDurableVideoCapabilities().then((value) => {
      if (!active) return;
      const seen = new Set<string>();
      if (typeof value?.enabled !== "boolean" || !Array.isArray(value.models) || value.models.length > 2 ||
          (value.sourceModes !== undefined && (!Array.isArray(value.sourceModes) || value.sourceModes.length > 2 || new Set(value.sourceModes).size !== value.sourceModes.length || value.sourceModes.some((mode) => mode !== "audio" && mode !== "video"))) ||
          (!value.enabled && value.models.length > 0) || value.models.some((model) => {
            if (!model || !["LTX-2.5 Distilled BF16", "LTX-2.5 Distilled NVFP4"].includes(model.id) ||
                !Number.isSafeInteger(model.onlineWorkers) || model.onlineWorkers <= 0 || seen.has(model.id)) return true;
            seen.add(model.id); return false;
          })) throw new Error("Invalid video capabilities");
      setState({ key, value, error: false });
    }).catch(() => { if (active) setState({ key, value: null, error: true }); });
    return () => { active = false; };
  }, [key]);
  const current = key && state?.key === key ? state : null;
  return {
    ready: !!current,
    enabled: current?.value?.enabled ?? false,
    models: current?.value?.models ?? [],
    sourceModes: current?.value?.sourceModes ?? [],
    error: current?.error ?? false,
    refresh: () => setAttempt((value) => value + 1),
  };
}
