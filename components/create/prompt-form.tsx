"use client";

import { KeyboardEvent, DragEvent, useRef, useState } from 'react';
import { Model } from '@/lib/types/create';

interface PromptFormProps {
  prompt: string;
  onPromptChange: (prompt: string) => void;
  onGenerate: (prompt: string) => Promise<boolean>;
  onEnhance: (prompt: string) => Promise<string | null>;
  isGenerating: boolean;
  isEnhancing: boolean;
  error: string | null;
  selectedModel: Model | null;
  batchMode: boolean;
  trackedJobStatus?: string | null;
  /** Optional img2img / img2video source frame (data URI), shown as a square in the box. */
  sourceImage?: string | null;
  onSourceChange?: (dataUri: string | null) => void;
}

export function PromptForm({
  prompt,
  onPromptChange,
  onGenerate,
  onEnhance,
  isGenerating,
  isEnhancing,
  error,
  selectedModel,
  batchMode,
  trackedJobStatus,
  sourceImage,
  onSourceChange,
}: PromptFormProps) {
  const setPrompt = onPromptChange;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const sourceEnabled = !!onSourceChange;

  const readImageFile = (file: File | undefined | null) => {
    if (!file || !file.type.startsWith('image/') || !onSourceChange) return;
    const reader = new FileReader();
    reader.onload = () => onSourceChange(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (!sourceEnabled) return;
    readImageFile(e.dataTransfer.files?.[0]);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    const success = await onGenerate(prompt);
    if (success) {
      setPrompt("");
    }
  };

  const handleEnhance = async () => {
    if (!prompt.trim()) return;
    const enhanced = await onEnhance(prompt);
    if (enhanced) {
      setPrompt(enhanced);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && prompt.trim()) {
      e.preventDefault();
      handleGenerate();
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <div
        className="relative flex-1"
        onDragOver={(e) => { if (sourceEnabled) { e.preventDefault(); setDragOver(true); } }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe your image..."
          disabled={isGenerating}
          className={`w-full h-full min-h-[160px] bg-zinc-800/60 border rounded-2xl px-5 py-4 ${sourceEnabled ? 'pr-24' : ''} text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 resize-none disabled:opacity-50 ${dragOver ? 'border-indigo-500 ring-2 ring-indigo-500/50' : 'border-zinc-700'}`}
          onKeyDown={handleKeyDown}
        />

        {/* Source image (img2img / img2video) — click or drag-drop. */}
        {sourceEnabled && (
          <div className="absolute bottom-3 right-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => readImageFile(e.target.files?.[0])}
            />
            {sourceImage ? (
              <div className="relative w-[60px] h-[60px] rounded-lg overflow-hidden border border-zinc-600 group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={sourceImage} alt="source" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => onSourceChange?.(null)}
                  title="Remove source image"
                  className="absolute top-0.5 right-0.5 w-5 h-5 flex items-center justify-center rounded-full bg-black/70 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Add a source image (img2img / img2video) — click or drag & drop"
                className="w-[60px] h-[60px] rounded-lg border border-dashed border-zinc-600 hover:border-indigo-500 hover:bg-zinc-700/40 text-zinc-400 hover:text-zinc-200 flex flex-col items-center justify-center gap-0.5 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-[9px] leading-none">Source</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* AI Enhance and Generate buttons */}
      <div className="mt-4 flex justify-end gap-3">
        <button
          onClick={handleEnhance}
          disabled={isGenerating || isEnhancing || !prompt.trim()}
          className="px-5 py-3 bg-zinc-700 hover:bg-zinc-600 text-white font-medium rounded-xl shadow-lg disabled:opacity-40 disabled:cursor-default transition-all flex items-center gap-2"
          title="AI Enhance Prompt"
        >
          {isEnhancing ? (
            <>
              <span className="animate-spin w-4 h-4 border-2 border-zinc-400 border-t-white rounded-full" />
              <span className="md:hidden">...</span>
              <span className="hidden md:inline">Enhancing...</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="md:hidden">Enhance</span>
              <span className="hidden md:inline">Enhance my Prompt with AI</span>
            </>
          )}
        </button>

        <button
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim()}
          className="px-6 md:px-10 py-3 bg-gradient-to-t from-slate-50 via-slate-50 to-slate-100 text-zinc-900 font-semibold rounded-xl shadow-lg disabled:opacity-40 disabled:cursor-default hover:brightness-110 transition-all"
        >
          {isGenerating ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin w-4 h-4 border-2 border-zinc-400 border-t-zinc-700 rounded-full" />
              <span className="md:hidden">{trackedJobStatus === "processing" ? "..." : "..."}</span>
              <span className="hidden md:inline">
                {trackedJobStatus === "processing" ? "Creating..." : "Finding worker..."}
              </span>
            </span>
          ) : (
            <>
              <span className="md:hidden">Generate{batchMode ? ' ×4' : ''}</span>
              <span className="hidden md:inline">
                Generate{batchMode ? ' 4 images' : ''} with {selectedModel?.name || 'AI'}
              </span>
            </>
          )}
        </button>
      </div>

      {error && (
        <p className="mt-3 text-red-400 text-sm">{error}</p>
      )}
    </div>
  );
}
