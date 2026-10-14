"use client";

import { useMemo, useState } from "react";
import { DirectorConsole } from "@/components/create/director";
import { DurableClipConsole } from "@/components/create/director/durable-clip-console";
import { useDurableVideoCapabilities } from "@/lib/hooks/use-durable-video-capabilities";
import { isDurableVideoModel } from "@/lib/hooks/use-durable-director-clip";
import { useJobStore } from "@/lib/stores/job-store";
import {
  FALLBACK_MODEL_ID,
  DIRECTOR_MODEL_ID,
  FIRST_FRAME_MODEL_ID,
} from "@/lib/create/director-payload";
import { useModelAvailability } from "@/lib/hooks/use-model-availability";
import { useStylesConfig } from "@/lib/hooks/use-styles-config";
import { useAuthStore } from "@/lib/stores/auth-store";

export function DirectorPageContent() {
  const { isAuthenticated: authenticated, accountId } = useAuthStore();
  const ownerIdentifier = authenticated ? accountId || undefined : undefined;
  const capabilities = useDurableVideoCapabilities(authenticated, ownerIdentifier);
  const [chosenView, setView] = useState<string | null>(null);
  const { jobs, requests } = useJobStore();
  const owner = ownerIdentifier?.toLowerCase();
  const hasRecovery = !!owner && (jobs.some((job) => job.walletAddress === owner && isDurableVideoModel(job.modelId)) || requests.some((request) => request.owner === owner && isDurableVideoModel(request.job.modelId)));
  const showClip = !!owner && (capabilities.enabled || hasRecovery);
  const view = chosenView ?? (hasRecovery ? "clip" : "timeline");
  const { styles } = useStylesConfig();
  const { checked: availabilityChecked, onlineModelIds } =
    useModelAvailability();
  const modelAvailability = useMemo(
    () => ({
      checked: availabilityChecked,
      director: onlineModelIds.has(DIRECTOR_MODEL_ID),
      fallback: onlineModelIds.has(FALLBACK_MODEL_ID),
      krea: onlineModelIds.has(FIRST_FRAME_MODEL_ID),
    }),
    [availabilityChecked, onlineModelIds],
  );

  return (
    <>
    {showClip && <div role="tablist" aria-label="Director workspace" className="fixed inset-x-0 top-0 z-[60] flex h-12 gap-1 border-b border-white/10 bg-[#0a0a0c] px-4 sm:px-6">
      {[["timeline", "Timeline"], ["clip", "LTX-2.5 clip"]].map(([id, label]) => <button key={id} id={`director-tab-${id}`} role="tab" aria-controls="director-workspace-panel" aria-selected={view === id} tabIndex={view === id ? 0 : -1} className={`px-4 py-2 text-sm ${view === id ? "border-b-2 border-white text-white" : "text-white/50"}`} onClick={() => setView(id)} onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === "Home" ? "timeline" : event.key === "End" ? "clip" : id === "timeline" ? "clip" : "timeline";
        setView(next);
        document.getElementById(`director-tab-${next}`)?.focus();
      }}>{label}</button>)}
    </div>}
    <div id="director-workspace-panel" role={showClip ? "tabpanel" : undefined} aria-labelledby={showClip ? `director-tab-${view}` : undefined}>
    {showClip && view === "clip" ? <DurableClipConsole key={owner} ownerIdentifier={owner!} enabled={capabilities.enabled} models={capabilities.models} /> : <DirectorConsole
      workspaceInset={showClip}
      styles={styles}
      ownerIdentifier={ownerIdentifier}
      authenticated={authenticated}
      modelAvailability={modelAvailability}
    />}
    </div>
    </>
  );
}
