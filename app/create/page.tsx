"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { Header } from "@/components/header";
import { AuthModal } from "@/components/auth-modal";
import { PromptForm, SettingsPanel, CreationsGrid, AnonLimitBanner } from "@/components/create";
import { useStylesConfig, getDefaultModel, getDimension } from "@/lib/hooks/use-styles-config";
import { useCreations } from "@/lib/hooks/use-creations";
import { useGeneration } from "@/lib/hooks/use-generation";
import { useJobStore } from "@/lib/stores/job-store";
import { useFaviconProgress, calculateProgress } from "@/lib/hooks/use-favicon-progress";
import { getRemainingGenerations, GENERATION_LIMIT } from "@/lib/generation-limits";
import { isAuthenticated } from "@/lib/auth";

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

  // Styles/config
  const { styles, error: stylesError } = useStylesConfig();
  const selectedModel = getDefaultModel(styles);
  const selectedDimension = getDimension(styles, dimensionId);

  // Set default dimension when styles load
  useEffect(() => {
    if (styles?.defaultDimensionId) {
      setDimensionId(styles.defaultDimensionId);
    }
  }, [styles?.defaultDimensionId]);

  // Creations (single source of truth)
  const { creations, addCreation, removeCreation, hasActiveJobs } = useCreations(address);

  // Generation logic
  const {
    isGenerating,
    isEnhancing,
    error: generationError,
    regeneratingJobId,
    generate,
    regenerate,
    enhance,
  } = useGeneration({
    styles,
    selectedModel,
    selectedDimension,
    batchMode,
    walletAddress: address,
    isConnected,
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

  return (
    <main className="min-h-screen bg-black">
      <Header />

      <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8">
        {/* Anonymous user limit banner */}
        <AnonLimitBanner
          remainingGenerations={remainingGens}
          authenticated={authenticated}
        />

        {/* Generate Section */}
        <div className="flex flex-col md:flex-row md:items-stretch gap-6 mb-12">
          <PromptForm
            onGenerate={generate}
            onEnhance={enhance}
            isGenerating={isGenerating || hasActiveJobs}
            isEnhancing={isEnhancing}
            error={error}
            selectedModel={selectedModel}
            batchMode={batchMode}
            trackedJobStatus={trackedJob?.status}
          />

          <SettingsPanel
            styles={styles}
            dimensionId={dimensionId}
            onDimensionChange={setDimensionId}
            batchMode={batchMode}
            onBatchModeChange={setBatchMode}
            selectedModel={selectedModel}
            authenticated={authenticated}
          />
        </div>

        {/* Creations Grid */}
        <CreationsGrid
          creations={creations}
          onDelete={removeCreation}
          onRegenerate={regenerate}
          regeneratingJobId={regeneratingJobId}
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
