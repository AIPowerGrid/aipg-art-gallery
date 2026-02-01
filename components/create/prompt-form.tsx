"use client";

import { useState, KeyboardEvent } from 'react';
import { Model } from '@/lib/types/create';

interface PromptFormProps {
  onGenerate: (prompt: string) => Promise<boolean>;
  onEnhance: (prompt: string) => Promise<string | null>;
  isGenerating: boolean;
  isEnhancing: boolean;
  error: string | null;
  selectedModel: Model | null;
  batchMode: boolean;
  trackedJobStatus?: string | null;
}

export function PromptForm({
  onGenerate,
  onEnhance,
  isGenerating,
  isEnhancing,
  error,
  selectedModel,
  batchMode,
  trackedJobStatus,
}: PromptFormProps) {
  const [prompt, setPrompt] = useState("");

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
      <div className="relative flex-1">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe your image..."
          disabled={isGenerating}
          className="w-full h-full min-h-[160px] bg-zinc-800/60 border border-zinc-700 rounded-2xl px-5 py-4 text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 resize-none disabled:opacity-50"
          onKeyDown={handleKeyDown}
        />
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
