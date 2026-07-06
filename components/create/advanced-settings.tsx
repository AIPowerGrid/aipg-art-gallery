"use client";

import { useState, useEffect } from 'react';
import { Model, AdvancedSettings } from '@/lib/types/create';

interface AdvancedSettingsPanelProps {
  selectedModel: Model | null;
  settings: AdvancedSettings;
  onChange: (settings: AdvancedSettings) => void;
  isExpanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  defaults: { steps: number; cfgScale: number };
}

export function AdvancedSettingsPanel({
  selectedModel,
  settings,
  onChange,
  isExpanded,
  onExpandedChange,
  defaults,
}: AdvancedSettingsPanelProps) {
  const limits = selectedModel?.limits || {
    steps: { min: 1, max: 50 },
    cfgScale: { min: 1, max: 20 },
  };

  const currentSteps = settings.steps ?? selectedModel?.settings?.steps ?? defaults.steps;
  const currentCfg = settings.cfgScale ?? selectedModel?.settings?.cfgScale ?? defaults.cfgScale;

  const hasCustomSettings = settings.seed || settings.steps !== undefined || settings.cfgScale !== undefined;

  const handleReset = () => {
    onChange({});
  };

  return (
    <div className="mt-4 border-t border-zinc-700/50 pt-4">
      {/* Toggle Header */}
      <button
        onClick={() => onExpandedChange(!isExpanded)}
        className="w-full flex items-center justify-between text-sm text-zinc-400 hover:text-zinc-300 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
          <span>Advanced</span>
          {hasCustomSettings && (
            <span className="px-1.5 py-0.5 text-xs bg-indigo-600/50 text-indigo-300 rounded">Custom</span>
          )}
        </div>
        <svg 
          className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="mt-4 space-y-4">
          {/* Seed Input */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">
              Seed <span className="text-zinc-500">(optional)</span>
            </label>
            <input
              type="text"
              value={settings.seed || ''}
              onChange={(e) => onChange({ ...settings, seed: e.target.value || undefined })}
              placeholder="Random"
              className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500/50"
            />
          </div>

          {/* Steps Slider */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-zinc-400">Steps</label>
              <span className="text-xs text-zinc-300 font-mono">{currentSteps}</span>
            </div>
            <input
              type="range"
              min={limits.steps?.min || 1}
              max={limits.steps?.max || 50}
              step={1}
              value={currentSteps}
              onChange={(e) => onChange({ ...settings, steps: parseInt(e.target.value) })}
              className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
            <div className="flex justify-between text-xs text-zinc-500 mt-1">
              <span>{limits.steps?.min || 1}</span>
              <span>{limits.steps?.max || 50}</span>
            </div>
          </div>

          {/* CFG Scale Slider */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-zinc-400">CFG Scale</label>
              <span className="text-xs text-zinc-300 font-mono">{currentCfg.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min={limits.cfgScale?.min || 1}
              max={limits.cfgScale?.max || 20}
              step={0.5}
              value={currentCfg}
              onChange={(e) => onChange({ ...settings, cfgScale: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
            <div className="flex justify-between text-xs text-zinc-500 mt-1">
              <span>{limits.cfgScale?.min || 1}</span>
              <span>{limits.cfgScale?.max || 20}</span>
            </div>
          </div>

          {/* Reset Button */}
          {hasCustomSettings && (
            <button
              onClick={handleReset}
              className="w-full py-2 text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-600 rounded-lg transition-colors"
            >
              Reset to defaults
            </button>
          )}
        </div>
      )}
    </div>
  );
}
