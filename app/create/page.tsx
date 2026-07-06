"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { Header } from "@/components/header";
import { AuthModal } from "@/components/auth-modal";
import { PromptForm, SettingsPanel, CreationsGrid, AnonLimitBanner, StylePicker, LoraInput, CollapsibleSection } from "@/components/create";
import type { LoraSpec } from "@/components/create";
import { useStylesConfig, getDefaultModel, getDimension } from "@/lib/hooks/use-styles-config";
import { useGridStyles } from "@/lib/hooks/use-grid-styles";
import { GridStyle } from "@/types/models";
import { useCreations } from "@/lib/hooks/use-creations";
import { useGeneration } from "@/lib/hooks/use-generation";
import { useJobStore } from "@/lib/stores/job-store";
import { useFaviconProgress, calculateProgress } from "@/lib/hooks/use-favicon-progress";
import { getRemainingGenerations, GENERATION_LIMIT } from "@/lib/generation-limits";
import { isAuthenticated } from "@/lib/auth";
import { AdvancedSettings } from "@/lib/types/create";
import { DisplayCreation } from "@/lib/storage";

export default function CreatePage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <main className="min-h-screen bg-black">
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
  const { address, isConnected } = useAccount();
  const authenticated = isConnected && isAuthenticated();

  // UI state
  const [dimensionId, setDimensionId] = useState(3);
  const [batchMode, setBatchMode] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [remainingGens, setRemainingGens] = useState(GENERATION_LIMIT);
  const [advancedSettings, setAdvancedSettings] = useState<AdvancedSettings>({});
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
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
    ? styles?.models.find(m => m.id === selectedModelId) || defaultModel
    : defaultModel;
  const selectedDimension = getDimension(styles, dimensionId);

  // Set default dimension when styles load
  useEffect(() => {
    if (styles?.defaultDimensionId) {
      setDimensionId(styles.defaultDimensionId);
    }
  }, [styles?.defaultDimensionId]);

  // Creations (single source of truth)
  const { creations, addCreation, removeCreation, hasActiveJobs, refresh } = useCreations(address);

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
    batchMode,
    walletAddress: address,
    isConnected,
    advancedSettings,
    selectedStyleId,
    sourceImage,
    lora,
    onCreationAdded: addCreation,
    onShowAuthModal: () => setShowAuthModal(true),
    onRemainingGensChange: setRemainingGens,
  });

  // Track job progress for favicon
  const { getActiveJobs } = useJobStore();
  const activeJobs = getActiveJobs();
  const trackedJob = activeJobs.length > 0 ? activeJobs[0] : null;
  const jobProgress = trackedJob
    ? calculateProgress(trackedJob.submittedAt, trackedJob.initialWaitTime, trackedJob.waitTime, trackedJob.status)
    : 0;
  useFaviconProgress(jobProgress, !!trackedJob);

  // Update remaining generations for anonymous users
  useEffect(() => {
    if (!authenticated) {
      setRemainingGens(getRemainingGenerations());
    }
  }, [authenticated, creations]);

  const error = stylesError || generationError;

  // Selecting a style switches the model to the one it's tuned for (matched
  // case-insensitively against the local model list). The grid still enforces
  // the style's locked params + prompt template server-side.
  const handleStyleSelect = (style: GridStyle | null) => {
    setSelectedStyleId(style?.id ?? null);
    if (style && styles?.models) {
      const m = styles.models.find(
        (mm) =>
          mm.id.toLowerCase() === style.model.toLowerCase() ||
          mm.name.toLowerCase() === style.model.toLowerCase()
      );
      if (m) setSelectedModelId(m.id);
    }
  };

  // Handle "Edit in Studio" - prefill prompt and settings from existing creation
  const handleEditInStudio = (creation: DisplayCreation) => {
    setPrompt(creation.prompt);
    setAdvancedSettings({
      seed: creation.params?.seed,
      steps: creation.params?.steps,
      cfgScale: creation.params?.cfgScale,
    });
    setAdvancedExpanded(true);
    // Scroll to top to see the prompt form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <main className="min-h-screen bg-black">
      <Header />

      <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8">
        {/* Anonymous user limit banner */}
        <AnonLimitBanner
          remainingGenerations={remainingGens}
          authenticated={authenticated}
        />

        {/* Optional creative controls — collapsed by default so the prompt stays
            the focus; each expands inline and shows its active selection. */}
        <div className="flex flex-col gap-3 mb-6">
          <CollapsibleSection
            title="Styles"
            hint={
              selectedStyleId
                ? gridStyles.find((s) => s.id === selectedStyleId)?.name ?? "1 selected"
                : undefined
            }
          >
            <StylePicker
              styles={gridStyles}
              selectedStyleId={selectedStyleId}
              onSelect={handleStyleSelect}
              modelType={selectedModel?.type === "video" ? "video" : "image"}
            />
          </CollapsibleSection>

          {selectedModel?.type !== "video" && (
            <CollapsibleSection title="LoRA" hint={lora ? "1 added" : undefined}>
              <LoraInput
                value={lora}
                onChange={setLora}
                hint={
                  selectedModel?.id?.toLowerCase().includes("klein")
                    ? "CivitAI link/version id — use Flux.2 Klein 4B LoRAs only"
                    : "CivitAI link/version id — z-image LoRAs work best"
                }
              />
            </CollapsibleSection>
          )}
        </div>

        {/* Generate Section */}
        <div className="flex flex-col md:flex-row md:items-stretch gap-6 mb-12">
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
          />

          <SettingsPanel
            styles={styles}
            dimensionId={dimensionId}
            onDimensionChange={setDimensionId}
            batchMode={batchMode}
            onBatchModeChange={setBatchMode}
            selectedModel={selectedModel}
            onModelChange={setSelectedModelId}
            authenticated={authenticated}
            advancedSettings={advancedSettings}
            onAdvancedSettingsChange={setAdvancedSettings}
            advancedExpanded={advancedExpanded}
            onAdvancedExpandedChange={setAdvancedExpanded}
          />
        </div>

        {/* Creations Grid */}
        <CreationsGrid
          creations={creations}
          onDelete={removeCreation}
          onEditInStudio={handleEditInStudio}
          onRefresh={refresh}
          isGenerating={isGenerating || hasActiveJobs}
        />
      </div>

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        title="Generation Limit Reached"
        message={`You've used all ${GENERATION_LIMIT} free generations. Connect your Base wallet to unlock unlimited image generations, access to video creation, and the ability to save and manage your creations across all your devices!`}
      />
    </main>
  );
}
