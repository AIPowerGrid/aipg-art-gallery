"use client";

/**
 * Director console — the full-screen merged Storyboard+Director tool
 * (mockup B "Console", 1-1): top bar with the global prompt, big preview
 * stage + right rail (segment inspector + render settings), timeline docked
 * at the bottom. The stage/rail and main/timeline splits are draggable
 * (sizes persist), everything else lives in the director store.
 */

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AuthModal } from "@/components/auth-modal";
import { confirmDialog } from "@/components/confirm-dialog";
import { useDirectorStore } from "@/lib/stores/director-store";
import { useDirector, useDirectorSync } from "@/lib/hooks/use-director";
import { useDirectorBilling } from "@/lib/hooks/use-director-billing";
import { segmentBlockers } from "@/lib/create/director-payload";
import { cropImageToRenderSize } from "@/lib/utils/crop-image";
import { exportStitched } from "@/lib/utils/export-stitched";
import { StylesConfig } from "@/lib/types/create";
import { ConsoleTimeline } from "./console-timeline";
import { PreviewStage } from "./preview-stage";
import { SegmentInspector, type SegmentCoachStep } from "./segment-inspector";
import { RenderSettingsPanel } from "./render-settings-panel";
import {
  IconChevronDown,
  IconChevronLeft,
  IconDownload,
  IconLayoutConsole,
  IconLayoutRows,
  IconPlay,
  IconPlus,
  IconStop,
  IconX,
} from "./icons";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const RAIL_MIN = 280;
const RAIL_MAX = 480;
const TIMELINE_MIN = 150;
const TIMELINE_MAX = 360;
const CONTROLS_MIN = 200;
const CONTROLS_MAX = 480;
const FUNDING_URL =
  "https://console.aipowergrid.io/dashboard/funding?returnTo=https%3A%2F%2Faipg.art%2Fcreate%2Fdirector";

function formatUSD(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: value > 0 && value < 0.01 ? 4 : 3,
  }).format(value);
}

type DirectorCoachStep =
  | "add-segment"
  | "select-segment"
  | Exclude<SegmentCoachStep, null>
  | null;

interface DirectorConsoleProps {
  styles: StylesConfig | null;
  ownerIdentifier?: string;
  authenticated: boolean;
  modelAvailability: {
    checked: boolean;
    director: boolean;
    fallback: boolean;
    krea: boolean;
  };
}

export function DirectorConsole({
  styles,
  ownerIdentifier,
  authenticated,
  modelAvailability,
}: DirectorConsoleProps) {
  const router = useRouter();
  const [showAuthModal, setShowAuthModal] = useState(false);

  const globalPrompt = useDirectorStore((s) => s.globalPrompt);
  const segments = useDirectorStore((s) => s.segments);
  const audios = useDirectorStore((s) => s.audios);
  const settings = useDirectorStore((s) => s.settings);
  const panels = useDirectorStore((s) => s.panels);
  const selectedId = useDirectorStore((s) => s.selectedId);
  const queueActive = useDirectorStore((s) => s.queueActive);

  const projects = useDirectorStore((s) => s.projects);
  const activeProjectId = useDirectorStore((s) => s.activeProjectId);
  const activeProjectName = useDirectorStore((s) => s.activeProjectName);
  const saveActiveProject = useDirectorStore((s) => s.saveActiveProject);
  const newProject = useDirectorStore((s) => s.newProject);
  const openProject = useDirectorStore((s) => s.openProject);
  const deleteProject = useDirectorStore((s) => s.deleteProject);
  const renameActiveProject = useDirectorStore((s) => s.renameActiveProject);

  const setGlobalPrompt = useDirectorStore((s) => s.setGlobalPrompt);
  const addAudio = useDirectorStore((s) => s.addAudio);
  const updateAudio = useDirectorStore((s) => s.updateAudio);
  const removeAudio = useDirectorStore((s) => s.removeAudio);
  const setSettings = useDirectorStore((s) => s.setSettings);
  const setPanels = useDirectorStore((s) => s.setPanels);
  const setSelectedId = useDirectorStore((s) => s.setSelectedId);
  const addSegment = useDirectorStore((s) => s.addSegment);
  const updateSegment = useDirectorStore((s) => s.updateSegment);
  const removeSegment = useDirectorStore((s) => s.removeSegment);
  const moveSegment = useDirectorStore((s) => s.moveSegment);
  const reorderSegment = useDirectorStore((s) => s.reorderSegment);
  const splitSegment = useDirectorStore((s) => s.splitSegment);
  const duplicateSegment = useDirectorStore((s) => s.duplicateSegment);

  const { renderSegment, generateFirstFrame, renderPending, stopQueue, error, model } = useDirector({
    styles,
    ownerIdentifier,
    authenticated,
    modelAvailability,
    onAuthRequired: () => setShowAuthModal(true),
  });
  useDirectorSync(renderSegment);

  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [playheadSec, setPlayheadSec] = useState(0);
  const [seekRequest, setSeekRequest] = useState<{ sec: number; n: number } | null>(null);
  const [exporting, setExporting] = useState<number | null>(null); // 0..1
  const exportAbort = useRef<AbortController | null>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const selected = segments.find((s) => s.id === selectedId) ?? null;
  const selectedIndex = selected ? segments.findIndex((s) => s.id === selected.id) : -1;
  const doneCount = segments.filter((s) => s.status === "done").length;
  const pendingCount = segments.filter((s) => s.status === "idle" || s.status === "error").length;
  const selectedBlockers = selected
    ? segmentBlockers(selected, selectedIndex, globalPrompt)
    : [];
  const coachStep: DirectorCoachStep =
    doneCount > 0
      ? null
      : segments.length === 0
        ? "add-segment"
        : !selected
          ? "select-segment"
          : !globalPrompt.trim() && !selected.prompt.trim()
            ? "prompt"
            : !selected.startImage && !(selected.chained && selectedIndex > 0)
              ? "source-image"
              : selectedBlockers.length === 0 && selected.status === "idle"
                ? "render"
                : null;
  const totalSec = segments.reduce((a, s) => a + s.lengthFrames, 0) / 24;
  const hasAudio = audios.length > 0;
  const modelReady =
    !!model?.enabled &&
    modelAvailability.checked &&
    (modelAvailability.director || (!hasAudio && modelAvailability.fallback));
  const degradedMode = !modelAvailability.director && !hasAudio && modelAvailability.fallback;
  const { credits, firstFrameQuote, segmentQuote } = useDirectorBilling({
    authenticated,
    selected,
    hasAudio,
    modelAvailability,
  });

  // --- panel dividers (LeetCode-style) ---
  const dragDivider = useCallback(
    (e: React.PointerEvent, kind: "rail" | "timeline" | "controls") => {
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const start =
        kind === "rail"
          ? panels.railWidth
          : kind === "timeline"
            ? panels.timelineHeight
            : (panels.controlsHeight ?? 280);
      const move = (ev: PointerEvent) => {
        if (kind === "rail") {
          const next = Math.min(RAIL_MAX, Math.max(RAIL_MIN, start + (startX - ev.clientX)));
          setPanels({ railWidth: next });
        } else if (kind === "timeline") {
          const next = Math.min(TIMELINE_MAX, Math.max(TIMELINE_MIN, start + (startY - ev.clientY)));
          setPanels({ timelineHeight: next });
        } else {
          const next = Math.min(CONTROLS_MAX, Math.max(CONTROLS_MIN, start + (ev.clientY - startY)));
          setPanels({ controlsHeight: next });
        }
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [panels.railWidth, panels.timelineHeight, panels.controlsHeight, setPanels]
  );

  // --- uploads ---
  const handleUploadImage = (segmentId: string) => async (file: File) => {
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Image too large (max 12MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result !== "string") return;
      try {
        // Crop to the render aspect so the recipe can't override the chosen
        // resolution and chained frames stay geometry-identical.
        const cropped = await cropImageToRenderSize(reader.result, settings.width, settings.height);
        updateSegment(segmentId, {
          startImage: cropped,
          startImageName: file.name,
          startImageJobId: undefined,
          startImageGridJobId: undefined,
          startImageStatus: undefined,
          startImageUrl: undefined,
          startImageError: undefined,
          chained: false,
          sourceJobId: undefined,
          anchorStale: false,
        });
      } catch {
        updateSegment(segmentId, {
          startImage: reader.result,
          startImageName: file.name,
          startImageJobId: undefined,
          startImageGridJobId: undefined,
          startImageStatus: undefined,
          startImageUrl: undefined,
          startImageError: undefined,
          chained: false,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAddAudio = async (file?: File) => {
    if (!file) return;
    if (file.size > MAX_AUDIO_BYTES) {
      toast.error("Audio too large (max 8MB) — a few minutes of MP3 fits comfortably.");
      return;
    }
    const audioB64 = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
    if (!audioB64) {
      toast.error("Could not read the audio file.");
      return;
    }
    // Decode for the real duration — drives the lane's real-size block + crop.
    let durationSec: number | undefined;
    try {
      const AudioCtx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
      durationSec = decoded.duration;
      ctx.close().catch(() => {});
    } catch {
      toast.warning("Could not decode the audio — cropping is unavailable for this file.");
    }
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    addAudio({
      id,
      audioB64,
      fileName: file.name,
      durationSec,
      // One full-file clip at timeline 0; breakpoints split it, and clips can
      // then be moved/cropped freely with gaps between them.
      slices: durationSec
        ? [{ id: `s${Date.now().toString(36)}`, timelineStartSec: 0, trimStartSec: 0, trimEndSec: durationSec }]
        : undefined,
    });
  };

  const handleToggleChain = (id: string) => {
    const idx = segments.findIndex((s) => s.id === id);
    const seg = segments[idx];
    if (!seg || idx === 0) return;
    updateSegment(id, {
      chained: !seg.chained,
      startImage: null,
      startImageName: undefined,
      startImageJobId: undefined,
      startImageGridJobId: undefined,
      startImageStatus: undefined,
      startImageUrl: undefined,
      startImageError: undefined,
      sourceJobId: undefined,
      anchorStale: false,
    });
  };

  const handleDownloadClip = (url: string, name = "segment.mp4") => {
    const a = document.createElement("a");
    a.href = `/api/download?url=${encodeURIComponent(url)}`;
    a.download = name;
    a.click();
  };

  // Export the assembled cut. One rendered clip → direct MP4 download (no
  // re-encode). Several → client-side stitch to WebM (real-time recording).
  const handleExport = async () => {
    if (exporting !== null) {
      exportAbort.current?.abort();
      return;
    }
    const urls = segments.filter((s) => s.status === "done" && s.outputUrl).map((s) => s.outputUrl!);
    if (urls.length === 0) return;
    if (urls.length === 1) {
      handleDownloadClip(urls[0], "director-cut.mp4");
      return;
    }
    const ctrl = new AbortController();
    exportAbort.current = ctrl;
    setExporting(0);
    try {
      const blob = await exportStitched(urls, {
        width: settings.width,
        height: settings.height,
        signal: ctrl.signal,
        onProgress: (p) => setExporting(p.fraction),
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "director-cut.webm";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        console.error("[Director] export failed", err);
        const detail = err instanceof Error ? err.message : String(err);
        toast.error("Export failed", {
          description: `${detail} — each rendered segment can still be downloaded from its panel.`,
        });
      }
    } finally {
      setExporting(null);
      exportAbort.current = null;
    }
  };

  return (
    <div
      data-testid="director-console"
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-background font-sans text-[14px] text-foreground"
    >
      {/* ===== top bar ===== */}
      <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2 sm:gap-4 sm:px-5 sm:py-3 max-sm:flex-wrap">
        <div className="flex min-w-0 flex-shrink-0 items-center gap-2 sm:gap-3 max-sm:w-full">
          <button
            type="button"
            onClick={() => router.push("/create")}
            title="Back to Studio"
            className="flex items-center gap-1 rounded-lg border border-border bg-card py-[6px] pl-1.5 pr-2.5 text-[12px] text-muted-foreground hover:text-foreground"
          >
            <IconChevronLeft className="h-[13px] w-[13px]" />
            <span className="max-sm:hidden">Studio</span>
          </button>
          <h1 className="text-[16px] font-semibold">Director</h1>

          {/* project switcher */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                saveActiveProject();
                setProjectMenuOpen((v) => !v);
              }}
              className="flex max-w-[150px] items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-[6px] text-[12px] text-muted-foreground hover:text-foreground sm:max-w-none"
            >
              <span className="max-w-[160px] truncate text-foreground">{activeProjectName}</span>
              <IconChevronDown className="h-[12px] w-[12px]" />
            </button>

            {projectMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setProjectMenuOpen(false)} />
                <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-[280px] max-w-[calc(100vw-24px)] rounded-lg border border-border bg-card p-1.5 shadow-xl">
                  <input
                    value={activeProjectName}
                    onChange={(e) => renameActiveProject(e.target.value)}
                    className="mb-1.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-[12px] text-foreground outline-none focus:border-edge"
                  />
                  <div className="max-h-[260px] overflow-y-auto">
                    {projects.map((p) => (
                      <div
                        key={p.id}
                        className={`group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[12px] ${
                          p.id === activeProjectId
                            ? "bg-primary/10 text-primary"
                            : "text-foreground hover:bg-card"
                        }`}
                        onClick={() => {
                          openProject(p.id);
                          setProjectMenuOpen(false);
                        }}
                      >
                        <span className="min-w-0 flex-1 truncate">{p.name}</span>
                        <span className="flex-shrink-0 text-[10px] text-tertiary">
                          {p.segments.length} seg
                        </span>
                        <button
                          type="button"
                          title="Delete project"
                          onClick={async (e) => {
                            e.stopPropagation();
                            const ok = await confirmDialog({
                              title: `Delete "${p.name}"?`,
                              message: "The project and its timeline are removed. Rendered clips stay in your creations.",
                              confirmLabel: "Delete",
                              danger: true,
                            });
                            if (ok) deleteProject(p.id);
                          }}
                          className="invisible flex-shrink-0 text-tertiary hover:text-destructive group-hover:visible"
                        >
                          <IconX className="h-[11px] w-[11px]" />
                        </button>
                      </div>
                    ))}
                    {projects.length === 0 && (
                      <p className="px-2 py-1.5 text-[11px] text-tertiary">No saved projects yet</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      newProject();
                      setProjectMenuOpen(false);
                    }}
                    className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1.5 text-[12px] text-muted-foreground hover:border-edge hover:text-foreground"
                  >
                    <IconPlus className="h-[11px] w-[11px]" /> New project
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1 max-sm:hidden" />

        <div className="flex min-w-0 flex-shrink-0 items-center gap-2 max-sm:w-full max-sm:justify-end">
          <button
            type="button"
            onClick={() =>
              setPanels({ layout: (panels.layout ?? "console") === "console" ? "rows" : "console" })
            }
            title={
              (panels.layout ?? "console") === "console"
                ? "Try the rows layout: controls on top, preview middle, timeline bottom"
                : "Back to the console layout: big stage with a right rail"
            }
            className="flex h-[27px] w-[30px] items-center justify-center rounded-md border border-border text-muted-foreground hover:border-edge hover:text-foreground max-sm:hidden"
          >
            {(panels.layout ?? "console") === "console" ? (
              <IconLayoutRows className="h-[14px] w-[14px]" />
            ) : (
              <IconLayoutConsole className="h-[14px] w-[14px]" />
            )}
          </button>
          <span className="rounded-md border border-border px-2.5 py-1 text-[11.5px] text-muted-foreground max-sm:hidden">
            Total <b className="tabular-nums text-foreground">{totalSec.toFixed(1)}s</b>
          </span>
          <span className="rounded-md border border-border px-2.5 py-1 text-[11.5px] text-muted-foreground">
            <b className="text-success">{doneCount}</b> / {segments.length} rendered
          </span>
          {!authenticated && (
            <button
              type="button"
              onClick={() => setShowAuthModal(true)}
              className="rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11.5px] text-primary hover:bg-primary/20"
            >
              Sign in
            </button>
          )}
          {modelAvailability.checked && degradedMode && (
            <span className="rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11.5px] text-primary">
              fallback video
            </span>
          )}
          {modelAvailability.checked && !modelReady && (
            <span className="rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11.5px] text-primary">
              model offline
            </span>
          )}
          <button
            type="button"
            onClick={() => (queueActive ? stopQueue() : renderPending())}
            disabled={!queueActive && (pendingCount === 0 || !modelReady)}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-[7px] text-[12.5px] font-semibold disabled:opacity-40 ${
              queueActive
                ? "border border-primary bg-transparent text-primary"
                : "bg-primary text-background"
            }`}
          >
            {queueActive ? (
              <>
                <IconStop className="h-[11px] w-[11px]" /> Stop queue
              </>
            ) : (
              <>
                <IconPlay className="h-[11px] w-[11px]" />
                Render{pendingCount > 0 ? ` (${pendingCount})` : ""}
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={doneCount === 0}
            title={doneCount === 0 ? "Render segments first" : "Export the assembled cut"}
            className="flex items-center gap-1.5 rounded-lg border border-primary/45 bg-primary/10 px-3 py-[7px] text-[12.5px] font-medium text-primary transition-colors hover:bg-primary/20 disabled:border-border disabled:bg-card disabled:text-tertiary disabled:opacity-60"
          >
            {exporting !== null ? (
              <>
                <IconX className="h-[11px] w-[11px]" /> {Math.round(exporting * 100)}%
              </>
            ) : (
              <>
                <IconDownload className="h-[12px] w-[12px]" /> Export
              </>
            )}
          </button>
        </div>
      </div>

      {authenticated && credits && (
        <div className="flex flex-shrink-0 flex-wrap items-center gap-x-5 gap-y-1.5 border-b border-border bg-background px-5 py-2 text-[11.5px] text-muted-foreground">
          <span className="font-medium text-foreground">
            Spendable {formatUSD(credits.total_spendable_usd)}
          </span>
          {credits.promotional.active && (
            <span>Promo {formatUSD(credits.promotional.remaining_usd)}</span>
          )}
          {credits.free.active && <span>Daily {formatUSD(credits.free.remaining_usd)}</span>}
          <span>Purchased {formatUSD(credits.paid.balance_usd)}</span>
          {segmentQuote?.estimate.priced && segmentQuote.estimate.cost_usd !== null && (
            <span className={segmentQuote.estimate.balance_sufficient ? "" : "text-primary"}>
              Segment estimate {formatUSD(segmentQuote.estimate.cost_usd)}
              {!segmentQuote.estimate.balance_sufficient && " · add credits"}
            </span>
          )}
          {segmentQuote && !segmentQuote.estimate.priced && (
            <span className="text-primary">Segment price unavailable</span>
          )}
          {firstFrameQuote?.estimate.priced && firstFrameQuote.estimate.cost_usd !== null && (
            <span>First frame {formatUSD(firstFrameQuote.estimate.cost_usd)}</span>
          )}
          {firstFrameQuote && !firstFrameQuote.estimate.priced && (
            <span className="text-primary">First-frame price unavailable</span>
          )}
          {!credits.charging_enabled && <span className="text-tertiary">Metering preview</span>}
          <a
            href={FUNDING_URL}
            className="ml-auto font-medium text-primary hover:text-primary"
          >
            Add credits
          </a>
        </div>
      )}

      {error && (
        <div className="flex flex-shrink-0 flex-wrap items-center gap-3 border-b border-destructive/40 bg-destructive/10 px-5 py-1.5 text-[12px] text-destructive">
          <span>{error.replace(/^402:\s*/, "")}</span>
          {error.startsWith("402:") && (
            <a href={FUNDING_URL} className="font-medium text-primary hover:text-primary">
              Add credits
            </a>
          )}
        </div>
      )}

      {(() => {
        const inspectorEl = selected ? (
          <SegmentInspector
            segment={selected}
            index={selectedIndex}
            count={segments.length}
            blockers={selectedBlockers}
            coachStep={
              coachStep === "source-image" || coachStep === "prompt" || coachStep === "render"
                ? coachStep
                : null
            }
            onUpdate={(patch) => updateSegment(selected.id, patch)}
            onToggleChain={() => handleToggleChain(selected.id)}
            onUploadImage={(f) => handleUploadImage(selected.id)(f)}
            onGenerateImage={() => generateFirstFrame(selected.id)}
            kreaAvailable={modelAvailability.checked && modelAvailability.krea}
            canGenerateImage={Boolean(selected.prompt.trim() || globalPrompt.trim())}
            onRender={() => renderSegment(selected.id, { manual: true })}
            onDuplicate={() => duplicateSegment(selected.id)}
            onRemove={() => removeSegment(selected.id)}
            onMove={(d) => moveSegment(selected.id, d)}
            onDownload={
              selected.outputUrl ? () => handleDownloadClip(selected.outputUrl!) : undefined
            }
          />
        ) : (
          <>
            {coachStep === "select-segment" ? (
              <p className="px-1 text-[12px] text-primary">Select segment 1 in the timeline to edit it.</p>
            ) : (
              <p className="px-1 text-[12px] text-tertiary">Select a segment to edit.</p>
            )}
          </>
        );
        const settingsEl = (
          <RenderSettingsPanel
            settings={settings}
            model={model}
            onChange={setSettings}
            globalPrompt={globalPrompt}
            onGlobalPrompt={setGlobalPrompt}
          />
        );
        const timelineEl = (
          <ConsoleTimeline
            segments={segments}
            audios={audios}
            selectedId={selectedId}
            pxPerSec={panels.pxPerSec}
            playheadSec={playheadSec}
            onSelect={setSelectedId}
            onZoom={(v) => setPanels({ pxPerSec: v })}
            onResize={(id, frames) => updateSegment(id, { lengthFrames: frames })}
            onToggleChain={handleToggleChain}
            onAddSegment={addSegment}
            onDuplicateSegment={(id) => duplicateSegment(id)}
            onRemoveSegment={removeSegment}
            onReorderSegment={reorderSegment}
            onSplitSegment={splitSegment}
            onAddAudio={() => audioInputRef.current?.click()}
            onRemoveAudio={removeAudio}
            onAudioChange={updateAudio}
            onSeek={(sec) => {
              setPlayheadSec(sec);
              setSeekRequest((prev) => ({ sec, n: (prev?.n ?? 0) + 1 }));
            }}
            coachStep={
              coachStep === "add-segment" || coachStep === "select-segment"
                ? coachStep
                : null
            }
          />
        );
        const timelineDivider = (
          <div
            onPointerDown={(e) => dragDivider(e, "timeline")}
            className="group flex h-[7px] flex-shrink-0 cursor-row-resize items-center justify-center"
          >
            <div className="h-px w-full bg-border transition-colors group-hover:h-[3px] group-hover:bg-primary/50" />
          </div>
        );

        if ((panels.layout ?? "console") === "rows") {
          // ===== experimental ROWS layout: controls / preview / timeline =====
          return (
            <>
              {/* top controls band — ALL SEGMENTS (global) first, then the
                  selected segment; each column scrolls on its own */}
              <div
                className="flex min-h-0 flex-shrink-0 gap-3 px-4 pt-3 max-sm:!h-auto max-sm:flex-col"
                style={{ height: panels.controlsHeight ?? 280 }}
              >
                <div className="min-w-0 flex-1 overflow-y-auto pb-1">{settingsEl}</div>
                <div className="min-w-0 flex-1 overflow-y-auto pb-1">{inspectorEl}</div>
              </div>

              {/* controls/preview divider */}
              <div
                onPointerDown={(e) => dragDivider(e, "controls")}
                className="group flex h-[7px] flex-shrink-0 cursor-row-resize items-center justify-center"
              >
                <div className="h-px w-full bg-border transition-colors group-hover:h-[3px] group-hover:bg-primary/50" />
              </div>

              {/* middle preview */}
              <div className="flex min-h-0 flex-1 max-sm:min-h-[280px] max-sm:flex-none">
                <PreviewStage segments={segments} onPlayhead={setPlayheadSec} seekRequest={seekRequest} />
              </div>

              {timelineDivider}

              {/* bottom timeline (full width in rows layout) */}
              <div className="flex-shrink-0" style={{ height: panels.timelineHeight }}>
                {timelineEl}
              </div>
            </>
          );
        }

        // ===== primary CONSOLE layout: full-height right controls rail;
        // the left column stacks preview + timeline, so the rail runs
        // top-to-bottom beside BOTH (no scrolling needed for controls). =====
        return (
          <div className="flex min-h-0 flex-1 max-sm:flex-col max-sm:overflow-y-auto">
            {/* left column: preview over timeline */}
            <div className="flex min-w-0 flex-1 flex-col max-sm:min-h-[510px] max-sm:flex-none">
              <PreviewStage segments={segments} onPlayhead={setPlayheadSec} seekRequest={seekRequest} />

              {timelineDivider}

              <div className="min-h-0 flex-shrink-0" style={{ height: panels.timelineHeight }}>
                {timelineEl}
              </div>
            </div>

            {/* vertical divider (full height) */}
            <div
              onPointerDown={(e) => dragDivider(e, "rail")}
              className="group flex w-[7px] flex-shrink-0 cursor-col-resize items-center justify-center max-sm:hidden"
            >
              <div className="h-full w-px bg-border transition-colors group-hover:w-[3px] group-hover:bg-primary/50" />
            </div>

            {/* right rail — spans down beside the timeline too */}
            <div
              data-testid="director-rail"
              className="flex flex-shrink-0 flex-col gap-3 overflow-y-auto py-4 pr-4 max-sm:!w-full max-sm:overflow-visible max-sm:px-3"
              style={{ width: panels.railWidth }}
            >
              {inspectorEl}
              {settingsEl}
            </div>
          </div>
        );
      })()}

      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          handleAddAudio(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        title="Sign in to render"
        message="Continue with Google or verify a Base wallet. Both methods use the same Grid account and credit balance."
      />
    </div>
  );
}
