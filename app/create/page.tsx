"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { Header } from "@/components/header";
import { AuthModal } from "@/components/auth-modal";
import { PromptForm, StudioRail, CreationsGrid } from "@/components/create";
import { CreationCard } from "@/components/creation-card";
import type { LoraSpec, StudioTab } from "@/components/create";
import { useStylesConfig, getDefaultModel, getDimension } from "@/lib/hooks/use-styles-config";
import { useGridStyles } from "@/lib/hooks/use-grid-styles";
import { GridStyle } from "@/types/models";
import { useCreations } from "@/lib/hooks/use-creations";
import { useGeneration } from "@/lib/hooks/use-generation";
import { useJobStore } from "@/lib/stores/job-store";
import {
  useFaviconProgress,
  calculateProgress,
} from "@/lib/hooks/use-favicon-progress";
import {
  fetchCredits,
  fetchCreditQuote,
  type GridCredits,
  type GridCreditQuote,
} from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth-store";
import { AdvancedSettings } from "@/lib/types/create";
import { DisplayCreation } from "@/lib/storage";
import { acceptsSourceImage } from "@/lib/create/capabilities";

const fundingURL =
  "https://console.aipowergrid.io/dashboard/funding?returnTo=https%3A%2F%2Faipg.art%2Fcreate";

function formatUSD(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: value > 0 && value < 0.01 ? 4 : 3,
  }).format(value);
}

export default function CreatePage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <main className="min-h-screen">
        <Header />
        <div className="flex items-center justify-center h-[60vh]">
          <div className="animate-spin w-8 h-8 border-2 border-white/20 border-t-white rounded-full" />
        </div>
      </main>
    );
  }

  return <CreatePageContent />;
}

function CreatePageContent() {
  // Wallet state
  const { address } = useAccount();
  const {
    isAuthenticated: hasSession,
    address: sessionAddress,
    googleId,
  } = useAuthStore();
  const authenticated = hasSession;
  const ownerIdentifier = authenticated
    ? googleId
      ? `google:${googleId}`
      : (sessionAddress ?? address)
    : undefined;

  // UI state
  const [dimensionId, setDimensionId] = useState(3);
  const [batchMode, setBatchMode] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [credits, setCredits] = useState<GridCredits | null>(null);
  const [creditQuote, setCreditQuote] = useState<GridCreditQuote | null>(null);
  const [settingsByModel, setSettingsByModel] = useState<Record<string, AdvancedSettings>>({});
  const [railTab, setRailTab] = useState<StudioTab>("basic");
  const [prompt, setPrompt] = useState("");
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(null);
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [lora, setLora] = useState<LoraSpec | null>(null);

  // Styles/config
  const { styles, error: stylesError } = useStylesConfig();
  // Curated creative styles served by the grid (separate from the config blob above).
  const { gridStyles } = useGridStyles();
  const defaultModel = getDefaultModel(styles);
  const selectedModel = selectedModelId
    ? styles?.models.find((m) => m.id === selectedModelId) || defaultModel
    : defaultModel;
  const selectedDimension = getDimension(styles, dimensionId);
  const settingsModelId = selectedModel?.id ?? "default";
  const advancedSettings = settingsByModel[settingsModelId] ?? {};
  // Core verifies native batch cardinality, but the current production image
  // worker is not yet certified to return every requested output.
  const batchAvailable = false;

  const setAdvancedSettings = (settings: AdvancedSettings) => {
    setSettingsByModel((current) => ({
      ...current,
      [settingsModelId]: settings,
    }));
  };

  // Set default dimension when styles load
  useEffect(() => {
    if (styles?.defaultDimensionId) {
      setDimensionId(styles.defaultDimensionId);
    }
  }, [styles?.defaultDimensionId]);

  useEffect(() => {
    if (!batchAvailable) setBatchMode(false);
  }, [batchAvailable]);

  useEffect(() => {
    if (!authenticated) {
      setCredits(null);
      setCreditQuote(null);
      return;
    }
    void fetchCredits()
      .then(setCredits)
      .catch(() => setCredits(null));
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated || !selectedModel) {
      setCreditQuote(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const isVideo = selectedModel.type === "video";
      void fetchCreditQuote(
        {
          modelId: selectedModel.id,
          n: batchMode && batchAvailable ? 4 : 1,
          ...(isVideo
            ? {
                length:
                  advancedSettings.length ??
                  selectedModel.settings?.length ??
                  96,
                fps: selectedModel.settings?.fps ?? 24,
              }
            : {}),
        },
        controller.signal,
      )
        .then((quote) => {
          setCreditQuote(quote);
          setCredits(quote);
        })
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            setCreditQuote(null);
          }
        });
    }, 150);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    authenticated,
    selectedModel,
    batchMode,
    batchAvailable,
    advancedSettings.length,
  ]);

  // Creations (single source of truth)
  const { creations, addCreation, removeCreation, hasActiveJobs, refresh } =
    useCreations(Boolean(ownerIdentifier));
  const hadActiveJobs = useRef(false);

  useEffect(() => {
    if (hasActiveJobs) {
      hadActiveJobs.current = true;
      return;
    }
    if (!hadActiveJobs.current || !authenticated) return;
    hadActiveJobs.current = false;
    void fetchCredits()
      .then(setCredits)
      .catch(() => undefined);
  }, [authenticated, hasActiveJobs]);

  // Generation logic
  const {
    isGenerating,
    isEnhancing,
    error: generationError,
    generate,
    enhance,
  } = useGeneration({
    styles,
    selectedModel,
    selectedDimension,
    batchMode: batchMode && batchAvailable,
    ownerIdentifier,
    authenticated,
    advancedSettings,
    selectedStyleId,
    sourceImage,
    lora,
    onCreationAdded: addCreation,
    onShowAuthModal: () => setShowAuthModal(true),
  });

  // Track job progress for favicon
  const { getActiveJobs } = useJobStore();
  const activeJobs = getActiveJobs();
  const trackedJob = activeJobs.length > 0 ? activeJobs[0] : null;
  const jobProgress = trackedJob
    ? calculateProgress(
        trackedJob.submittedAt,
        trackedJob.initialWaitTime,
        trackedJob.waitTime,
        trackedJob.status,
      )
    : 0;
  useFaviconProgress(jobProgress, !!trackedJob);

  const error = stylesError || generationError;

  const handleModelChange = (modelID: string) => {
    const next = styles?.models.find((model) => model.id === modelID) ?? null;
    setSelectedModelId(modelID);
    if (!acceptsSourceImage(next)) {
      setSourceImage(null);
    }
  };

  // Selecting a style switches the model to the one it's tuned for (matched
  // case-insensitively against the local model list). The grid still enforces
  // the style's locked params + prompt template server-side.
  const handleStyleSelect = (style: GridStyle | null) => {
    setSelectedStyleId(style?.id ?? null);
    if (style && styles?.models) {
      const m = styles.models.find(
        (mm) =>
          mm.id.toLowerCase() === style.model.toLowerCase() ||
          mm.name.toLowerCase() === style.model.toLowerCase(),
      );
      if (m) handleModelChange(m.id);
    }
  };

  // Handle "Edit in Studio" - prefill prompt and settings from existing creation
  const handleEditInStudio = (creation: DisplayCreation) => {
    setPrompt(creation.prompt);
    const modelExists = styles?.models.some((model) => model.id === creation.modelId);
    const targetModelId = modelExists ? creation.modelId : settingsModelId;
    if (modelExists) setSelectedModelId(creation.modelId);
    setSettingsByModel((current) => ({
      ...current,
      [targetModelId]: {
        seed: creation.params?.seed,
        steps: creation.params?.steps,
        cfgScale: creation.params?.cfgScale,
      },
    }));
    setRailTab("advanced");
    // Scroll to top to see the prompt form
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <main className="min-h-screen">
      <Header />

      <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8">
        {authenticated && credits && (
          <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border pb-4 text-sm text-muted-foreground">
            <span className="font-medium text-white">
              Spendable {formatUSD(credits.total_spendable_usd)}
            </span>
            {credits.promotional.active && (
              <span>Promo {formatUSD(credits.promotional.remaining_usd)}</span>
            )}
            {credits.free.active && (
              <span>Daily {formatUSD(credits.free.remaining_usd)}</span>
            )}
            <span>Purchased {formatUSD(credits.paid.balance_usd)}</span>
            {creditQuote?.estimate.priced &&
              creditQuote.estimate.cost_usd !== null && (
                <span>
                  {credits.charging_enabled ? "Estimated charge" : "Preview price"}{" "}
                  {formatUSD(creditQuote.estimate.cost_usd)}
                </span>
              )}
            {creditQuote && !creditQuote.estimate.priced && (
              <span className="text-amber-400">Price unavailable</span>
            )}
            {!credits.charging_enabled && (
              <span className="font-medium text-success">Free during preview</span>
            )}
            <a
              href={fundingURL}
              className="ml-auto text-primary hover:text-primary/80"
            >
              Add credits
            </a>
          </div>
        )}

        {/* Workspace: prompt + creations in the main column, the vertical control
            rail alongside. The rail keeps every knob one persistent Basic/Advanced
            tab away, with Advanced's groups collapsible so it never turns into a
            long scroll. */}
        <div className="flex flex-col md:flex-row md:items-start gap-6">
          <div className="flex-1 min-w-0 flex flex-col gap-8">
            <PromptForm
              prompt={prompt}
              onPromptChange={setPrompt}
              onGenerate={generate}
              onEnhance={enhance}
              isGenerating={isGenerating || hasActiveJobs}
              isEnhancing={isEnhancing}
              error={error}
              selectedModel={selectedModel}
              batchMode={batchMode}
              trackedJobStatus={trackedJob?.status}
              sourceImage={sourceImage}
              onSourceChange={setSourceImage}
              fundingUrl={fundingURL}
            />

            {creations[0] && (
              <section aria-label="Current generation">
                <div className="mb-3 flex items-center justify-between gap-4">
                  <h2 className="text-sm font-semibold text-white">
                    {creations[0].isGenerating ? "Generating" : "Latest creation"}
                  </h2>
                  <a href="/profile" className="text-sm text-primary hover:text-primary/80">
                    My creations
                  </a>
                </div>
                <CreationCard
                  creation={creations[0]}
                  onDelete={removeCreation}
                  onRegenerate={() => handleEditInStudio(creations[0])}
                  onExtractComplete={refresh}
                  displayMode="focus"
                />
              </section>
            )}

            <CreationsGrid
              creations={creations.slice(1, 9)}
              onDelete={removeCreation}
              onEditInStudio={handleEditInStudio}
              onRefresh={refresh}
              isGenerating={false}
              heading="Recent creations"
              viewAllHref="/profile"
              hideEmptyState
            />
          </div>

          <StudioRail
            styles={styles}
            gridStyles={gridStyles}
            selectedModel={selectedModel}
            onModelChange={handleModelChange}
            dimensionId={dimensionId}
            onDimensionChange={setDimensionId}
            batchMode={batchMode}
            onBatchModeChange={setBatchMode}
            batchAvailable={batchAvailable}
            authenticated={authenticated}
            selectedStyleId={selectedStyleId}
            onStyleSelect={handleStyleSelect}
            lora={lora}
            onLoraChange={setLora}
            advancedSettings={advancedSettings}
            onAdvancedSettingsChange={setAdvancedSettings}
            activeTab={railTab}
            onActiveTabChange={setRailTab}
          />
        </div>
      </div>

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        title="Sign in to generate"
        message="Continue with Google or verify a Base wallet. Both methods can be linked to one Grid account and credit balance."
      />
    </main>
  );
}
