"use client";

import { useMemo } from "react";
import { useAccount } from "wagmi";
import { DirectorConsole } from "@/components/create/director";
import {
  FALLBACK_MODEL_ID,
  DIRECTOR_MODEL_ID,
  FIRST_FRAME_MODEL_ID,
} from "@/lib/create/director-payload";
import { useModelAvailability } from "@/lib/hooks/use-model-availability";
import { useStylesConfig } from "@/lib/hooks/use-styles-config";
import { useAuthStore } from "@/lib/stores/auth-store";

export function DirectorPageContent() {
  const { address } = useAccount();
  const {
    isAuthenticated: authenticated,
    address: sessionAddress,
    googleId,
  } = useAuthStore();
  const ownerIdentifier = authenticated
    ? googleId
      ? `google:${googleId}`
      : (sessionAddress ?? address)
    : undefined;
  const { styles } = useStylesConfig();
  const { checked: availabilityChecked, onlineModelIds } = useModelAvailability();
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
    <DirectorConsole
      styles={styles}
      ownerIdentifier={ownerIdentifier}
      authenticated={authenticated}
      modelAvailability={modelAvailability}
    />
  );
}
