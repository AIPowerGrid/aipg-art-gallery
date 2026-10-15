// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid
"use client";

import { Film, RefreshCw, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AuthModal } from "@/components/auth-modal";
import { DurableVideoCapabilities } from "@/lib/api";
import { useDurableDirectorClip } from "@/lib/hooks/use-durable-director-clip";
import { DurableVideoRequest } from "@/types/models";
import { maxDurableVideoFrames } from "@/lib/create/durable-video-limits";

const field = "w-full min-w-0 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm";
const funding = "https://console.aipowergrid.io/dashboard/funding?returnTo=https%3A%2F%2Faipg.art%2Fcreate%2Fdirector";

export function DurableClipConsole(props: {
  ownerIdentifier?: string;
  authenticated?: boolean;
  enabled: boolean;
  models: DurableVideoCapabilities["models"];
  sourceModes?: DurableVideoCapabilities["sourceModes"];
  onAssemble?: (clip: {url:string;frames:number;gridJobId?:string}) => void;
}) {
  const authenticated = props.authenticated ?? true;
  const clip = useDurableDirectorClip({ ...props, authenticated });
  const [showAuth, setShowAuth] = useState(false);
  const [timing,setTiming] = useState<{url:string;duration:number}|null>(null);
  const latest = clip.jobs[0];
  const maxFrames = maxDurableVideoFrames(clip.model);
  const resultPanel = useRef<HTMLDivElement>(null);
  const followResult = useRef<{previous?:string}|null>(null);
  const latestId = latest?.jobId;
  useEffect(()=>{
    if (!followResult.current) return;
    if (clip.pending.length > 0 || (latestId && latestId !== followResult.current.previous)) {
      resultPanel.current?.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"start"});
      followResult.current=null;
    } else if (!clip.busy && clip.error) followResult.current=null;
  },[latestId,clip.pending.length,clip.busy,clip.error]);
  const output = latest?.result?.generations.find((item) => item.kind === "video" && item.url)?.url;
  const uncertain = clip.pending.length > 0 || latest?.result?.status === "uncertain" || !!latest?.pollFailures;
  return (
    <section aria-label="LTX-2.5 clip workspace" className="fixed inset-x-0 bottom-0 top-12 z-50 overflow-y-auto bg-[#0a0a0c]">
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <a href="/create" className="mb-2 inline-block text-sm text-white/60">← Studio</a>
      <h1 className="mb-5 text-2xl font-semibold">Director</h1>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <form className="min-w-0 space-y-4" onSubmit={(event) => { event.preventDefault(); if (!authenticated) setShowAuth(true); else if(clip.canSubmit){followResult.current={previous:latestId};void clip.submit();} }}>
          <div role="group" aria-label="Generation mode" className="grid grid-cols-3 overflow-hidden rounded-md border border-white/15">
            {([["text", "Text to video"], ["audio", "Audio to video"], ["video", "Video to video"]] as const).map(([mode, label]) => <button key={mode} type="button" aria-pressed={clip.mode === mode} disabled={clip.busy} className={`min-w-0 px-2 py-2 text-xs ${clip.mode === mode ? "bg-white text-black" : "text-white/60"}`} onClick={() => clip.setMode(mode)}>{label}</button>)}
          </div>
          <label className="block space-y-1 text-sm">Clip prompt
            <textarea className={`${field} min-h-28 resize-y`} value={clip.prompt} maxLength={8000} disabled={clip.busy} onChange={(event) => clip.setPrompt(event.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1 text-sm">Clip length
              <select className={field} value={clip.frames} disabled={clip.busy} onChange={(event)=>clip.setFrames(Number(event.target.value))}>{Array.from(new Set([9,33,81,121,169,241,337,385,433,481,577,673,721,clip.frames])).filter((frames)=>Number.isFinite(frames) && (frames <= maxFrames || frames === clip.frames)).sort((a,b)=>a-b).map((frames)=><option key={frames} value={frames} disabled={frames > maxFrames}>{(frames/24).toFixed(2)} seconds{frames > maxFrames ? " · exceeds model limit" : ""}</option>)}</select>
            </label>
            <label className="block space-y-1 text-sm">Resolution
              <select className={field} value={clip.size} disabled={clip.busy} onChange={(event) => clip.setSize(event.target.value)}>
                {clip.mode === "video" ? <><option value="960x512">960 × 512</option><option value="512x960">512 × 960</option></> : <><option value="960x544">960 × 544</option><option value="544x960">544 × 960</option></>}<option value="512x512">512 × 512</option>
              </select>
            </label>
          </div>
          <div className="text-xs text-white/60">24 fps · {Number.isFinite(clip.frames) ? (clip.frames / 24).toFixed(3) : "—"} s</div>
          {clip.mode !== "text" && <div className="space-y-3 border-t border-white/10 pt-3">
            <label className="block space-y-1 text-sm">{clip.mode === "audio" ? "Soundtrack" : "Source video"}
              <input key={clip.mode} aria-label={clip.mode === "audio" ? "Soundtrack" : "Source video"} className="block w-full min-w-0 text-xs" type="file" accept={clip.mode === "audio" ? "audio/*" : "video/mp4,video/webm,video/quicktime"} disabled={clip.busy} onChange={(event) => clip.loadSource(event.target.files?.[0])} />
            </label>
            {clip.sourceURL && (clip.mode === "audio" ? <audio aria-label="Source soundtrack preview" src={clip.sourceURL} controls preload="metadata" className="w-full" /> : <video aria-label="Source video preview" src={clip.sourceURL} controls playsInline preload="metadata" className="aspect-video w-full bg-black object-contain" />)}
            <label className="block space-y-1 text-sm">Source start (seconds)<input className={field} type="number" min={0} max={600} step={0.001} value={clip.startSeconds} disabled={clip.busy} onChange={(event) => clip.setStartSeconds(Number(event.target.value))} /></label>
            <p className="text-xs text-white/60">{clip.mode === "video" ? "Original soundtrack retained. Picture fitted without cropping." : "Uploaded soundtrack retained."}</p>
          </div>}
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Upload size={16} aria-hidden="true" /> First frame (optional)
            <input aria-label="Opening image" className="min-w-0 flex-1 text-xs" type="file" accept="image/png,image/jpeg,image/webp" disabled={clip.busy} onChange={(event) => { void clip.loadImage(event.target.files?.[0]); }} />
          </label>
          {clip.image && <div className="flex min-w-0 items-center gap-2">
            {/* Inline, ephemeral input is never sent through the image optimizer. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={clip.image} alt="Opening image guide" className="h-16 w-16 shrink-0 rounded object-contain" />
            <span className="min-w-0 flex-1 truncate text-xs">{clip.imageName}</span>
            <button type="button" title="Remove opening image" aria-label="Remove opening image" disabled={clip.busy} onClick={() => { void clip.loadImage(); }}><X size={16} /></button>
          </div>}
          <details className="border-t border-white/10 pt-3">
            <summary className="cursor-pointer text-sm">Advanced</summary>
            <div className="mt-3 space-y-3">
              <label className="block space-y-1 text-sm">Output frames<input className={field} type="number" min={9} max={maxFrames} step={8} value={clip.frames} disabled={clip.busy} onChange={(event)=>clip.setFrames(Number(event.target.value))} /></label>
              <label className="block space-y-1 text-sm">Model
                <select className={field} value={clip.model} disabled={clip.busy} onChange={(event) => clip.setModel(event.target.value as DurableVideoRequest["model"])}>
                  {(["LTX-2.5 Distilled BF16", "LTX-2.5 Distilled NVFP4"] as const).map((id) => {
                    const online = props.models.find((item) => item.id === id);
                    return <option key={id} value={id} disabled={!online}>{id}{online ? ` · ${online.onlineWorkers} online` : authenticated ? " · unavailable" : ""}</option>;
                  })}
                </select>
              </label>
              {clip.mode === "video" && <label className="block space-y-1 text-sm">Motion strength <span className="tabular-nums">{clip.motionStrength.toFixed(2)}</span><input className="w-full" type="range" min={0.05} max={1} step={0.05} value={clip.motionStrength} disabled={clip.busy} onChange={(event) => clip.setMotionStrength(Number(event.target.value))} /></label>}
              <label className="block space-y-1 text-sm">Negative prompt<input className={field} value={clip.negativePrompt} maxLength={8000} disabled={clip.busy} onChange={(event) => clip.setNegativePrompt(event.target.value)} /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1 text-sm">Steps<input className={field} type="number" min={4} max={40} value={clip.steps} disabled={clip.busy} onChange={(event) => clip.setSteps(Number(event.target.value))} /></label>
                <label className="block space-y-1 text-sm">Guidance<input className={field} type="number" min={1} max={5} step={0.1} value={clip.cfgScale} disabled={clip.busy} onChange={(event) => clip.setCfgScale(Number(event.target.value))} /></label>
              </div>
              <label className="block space-y-1 text-sm">Seed<input className={field} inputMode="numeric" value={clip.seed} disabled={clip.busy} onChange={(event) => clip.setSeed(event.target.value)} placeholder="Random" /></label>
            </div>
          </details>
          <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-3 text-sm">
            <span>Maximum charge</span><span className="tabular-nums">{clip.quote.costCeilingMicro !== null ? `$${(clip.quote.costCeilingMicro / 1_000_000).toFixed(4)}` : "—"}</span>
            <button type="button" title="Refresh quote" aria-label="Refresh quote" onClick={clip.quote.refresh} disabled={clip.busy}><RefreshCw size={16} /></button>
          </div>
          {clip.quote.quote && <div className="text-xs text-white/60">Available ${(clip.quote.quote.total_spendable_micro / 1_000_000).toFixed(4)}</div>}
          {(clip.quote.quote?.estimate.balance_sufficient === false || clip.error?.startsWith("402")) && <a href={funding} className="block text-sm text-blue-300 underline">Add credits</a>}
          {authenticated && (!props.enabled || !clip.sourceEnabled) && <p role="status" className="text-sm text-white/60">{clip.mode !== "text" && !clip.sourceEnabled ? "This source mode is not yet available." : "New clip submissions are closed."}</p>}
          {clip.quote.error && <p role="alert" className="text-sm text-amber-300">{clip.quote.error}</p>}
          {clip.error && <p role="alert" className="break-words text-sm text-amber-300">{clip.error}</p>}
          <button type="submit" disabled={authenticated && !clip.canSubmit} className="flex w-full items-center justify-center gap-2 rounded-md bg-white px-4 py-3 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-40"><Film size={16} aria-hidden="true" />{!authenticated ? "Sign in to generate" : clip.submitting ? "Preparing / submitting…" : "Generate clip"}</button>
        </form>
        <div ref={resultPanel} className={`min-w-0 scroll-mt-4 space-y-4 ${latest || clip.pending.length ? "order-first lg:order-last" : ""}`}>
          <div className="flex aspect-video min-w-0 items-center justify-center overflow-hidden rounded-md border border-white/10 bg-black">
            {output ? <video key={output} aria-label="Generated clip" src={output} controls playsInline preload="metadata" onLoadedMetadata={(event)=>setTiming({url:output,duration:event.currentTarget.duration})} className="h-full w-full object-contain" /> : <Film size={40} className="text-white/25" aria-label="Clip preview" />}
          </div>
          {uncertain && <p role="status" className="text-sm text-amber-300">Checking the original request. No new generation submitted.</p>}
          {clip.pending.map((request) => <p key={request.requestId} className="break-all font-mono text-xs text-white/60">Request {request.requestId}</p>)}
          {latest && <div className="space-y-2 text-sm">
            <p className="capitalize">{uncertain ? "Result pending verification" : latest.status}</p>
            {latest.error && <p role="alert" className="break-words text-amber-300">{latest.error}</p>}
            <p className="break-all font-mono text-xs text-white/60">Gallery job {latest.jobId}</p>
            {latest.result?.gridJobId && <p className="break-all font-mono text-xs text-white/60">Core receipt {latest.result.gridJobId}</p>}
            {output && <a className="inline-block text-blue-300 underline" href={`/api/download?url=${encodeURIComponent(output)}`} download>Download clip</a>}
            {output && props.onAssemble && timing?.url === output && Number.isFinite(timing.duration) && <button type="button" className="ml-4 inline-flex items-center gap-2 text-white underline" onClick={()=>props.onAssemble?.({url:output,frames:Math.round(timing.duration*24),gridJobId:latest.result?.gridJobId})}><Film size={16} />Add to assembly</button>}
          </div>}
          <a href="/profile" className="inline-block text-sm text-white/60 underline">My creations</a>
        </div>
      </div>
    </div>
    <AuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} title="Sign in to AIPG" message="Continue with Google or your wallet." />
    </section>
  );
}
