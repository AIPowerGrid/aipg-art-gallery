"use client";

import { DimensionSlider } from '@/components/dimension-slider';
import { StylesConfig, Model } from '@/lib/types/create';

interface SettingsPanelProps {
  styles: StylesConfig | null;
  dimensionId: number;
  onDimensionChange: (id: number) => void;
  batchMode: boolean;
  onBatchModeChange: (enabled: boolean) => void;
  selectedModel: Model | null;
  authenticated: boolean;
}

export function SettingsPanel({
  styles,
  dimensionId,
  onDimensionChange,
  batchMode,
  onBatchModeChange,
  selectedModel,
  authenticated,
}: SettingsPanelProps) {
  return (
    <div className="w-full md:w-[280px] border border-zinc-700 rounded-2xl p-5 bg-zinc-800/30">
      {/* Dimensions */}
      <DimensionSlider
        dimensions={styles?.dimensions || []}
        selectedId={dimensionId}
        onChange={onDimensionChange}
      />

      {/* Batch Mode */}
      <div className="mt-6 mb-6">
        <div
          className={`relative ${!authenticated ? 'group' : ''}`}
          title={!authenticated ? "Connect your wallet to unlock batch generation" : ""}
        >
          <label className={`flex items-center gap-3 ${authenticated ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
            <div className="relative flex items-center">
              <input
                type="checkbox"
                checked={batchMode}
                onChange={(e) => authenticated && onBatchModeChange(e.target.checked)}
                disabled={!authenticated}
                className="sr-only peer"
              />
              <div className={`w-11 h-6 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${
                authenticated
                  ? 'bg-zinc-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-500/50 peer-checked:bg-indigo-600'
                  : 'bg-zinc-800 opacity-40 cursor-not-allowed'
              }`} />
            </div>
            <div className="flex-1">
              <div className={`flex items-center gap-2 text-sm font-medium ${authenticated ? 'text-white' : 'text-zinc-500'}`}>
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
                  <rect x="1" y="1" width="6" height="6" rx="1" />
                  <rect x="9" y="1" width="6" height="6" rx="1" />
                  <rect x="1" y="9" width="6" height="6" rx="1" />
                  <rect x="9" y="9" width="6" height="6" rx="1" />
                </svg>
                <span>Batch Mode</span>
                {!authenticated && (
                  <svg className="w-3.5 h-3.5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <p className={`text-xs mt-0.5 ${authenticated ? 'text-zinc-400' : 'text-zinc-500'}`}>
                {authenticated ? 'Generate 4 images at once' : 'Connect wallet to unlock'}
              </p>
            </div>
          </label>

          {/* Hover tooltip for non-authenticated users */}
          {!authenticated && (
            <div className="absolute inset-0 z-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <div className="absolute top-full left-0 right-0 mt-2 p-3 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl">
                <p className="text-xs text-zinc-300 mb-2">
                  Batch Mode is a <span className="text-indigo-400 font-medium">member feature</span>
                </p>
                <p className="text-xs text-zinc-400">
                  Connect your wallet to generate 4 images at once!
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Model */}
      <div>
        <div className="flex items-center gap-2 text-xs text-zinc-400 mb-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <span>Model</span>
        </div>
        <div className="relative">
          <select
            className="w-full bg-transparent text-zinc-200 text-sm py-2 px-3 pr-8 rounded-lg hover:bg-zinc-700/50 cursor-pointer focus:outline-none appearance-none"
            value={selectedModel?.id || ""}
            onChange={() => {
              // Model selection - ready for multiple models
            }}
          >
            {styles?.models.filter(m => m.enabled).map(model => (
              <option key={model.id} value={model.id} className="bg-zinc-800">
                {model.name}
              </option>
            ))}
          </select>
          <svg
            className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    </div>
  );
}
