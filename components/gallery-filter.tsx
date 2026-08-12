"use client";

import { useState, useEffect } from "react";
import { GalleryFilters, fetchGalleryModels } from "@/lib/api";

interface GalleryFilterProps {
  filters: GalleryFilters;
  onFiltersChange: (filters: GalleryFilters) => void;
}

export function GalleryFilter({ filters, onFiltersChange }: GalleryFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  // Count active filters
  const activeFilterCount = [
    filters.type && filters.type !== "all" ? 1 : 0,
    filters.models && filters.models.length > 0 ? 1 : 0,
    filters.aspect ? 1 : 0,
    filters.nsfw && filters.nsfw !== "all" ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  // Load available models when panel opens
  useEffect(() => {
    if (isOpen && availableModels.length === 0 && !loadingModels) {
      setLoadingModels(true);
      fetchGalleryModels()
        .then((res) => setAvailableModels(res.models))
        .catch(() => {})
        .finally(() => setLoadingModels(false));
    }
  }, [isOpen, availableModels.length, loadingModels]);

  // Prevent body scroll when panel is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleTypeChange = (type: string) => {
    onFiltersChange({ ...filters, type: type === "all" ? undefined : type });
  };

  const handleModelToggle = (model: string) => {
    const currentModels = filters.models || [];
    const newModels = currentModels.includes(model)
      ? currentModels.filter((m) => m !== model)
      : [...currentModels, model];
    onFiltersChange({ ...filters, models: newModels.length > 0 ? newModels : undefined });
  };

  const handleAspectChange = (aspect: string) => {
    onFiltersChange({
      ...filters,
      aspect: aspect === filters.aspect ? undefined : (aspect as GalleryFilters["aspect"]),
    });
  };

  const handleNsfwChange = (nsfw: string) => {
    onFiltersChange({
      ...filters,
      nsfw: nsfw === "all" ? undefined : (nsfw as GalleryFilters["nsfw"]),
    });
  };

  const clearAllFilters = () => {
    onFiltersChange({});
  };

  return (
    <>
      {/* Filter Button - Inline with search */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`group relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-all ${
          activeFilterCount > 0
            ? "bg-white text-black border-white"
            : "bg-transparent text-[#888] border-[#333] hover:border-[#555] hover:text-white"
        }`}
        aria-label={activeFilterCount > 0 ? `Filters, ${activeFilterCount} active` : "Filters"}
        title="Filters"
      >
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
          <rect x="1" y="2" width="14" height="1.5" rx="0.75" fill="currentColor" opacity={activeFilterCount > 0 ? 1 : 0.7} />
          <rect x="3" y="7" width="10" height="1.5" rx="0.75" fill="currentColor" opacity={activeFilterCount > 0 ? 1 : 0.85} />
          <rect x="5" y="12" width="6" height="1.5" rx="0.75" fill="currentColor" />
        </svg>
        {activeFilterCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-500 px-1 text-[11px] font-semibold text-white">
            {activeFilterCount}
          </span>
        )}
      </button>

      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/70 z-40 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setIsOpen(false)}
      />

      {/* Side Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-lg bg-[#0d0d0d] z-50 transform transition-transform duration-300 ease-out flex flex-col ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6">
          <div className="flex items-center gap-4">
            <svg className="w-6 h-6 text-white/60" viewBox="0 0 16 16" fill="currentColor">
              <rect x="1" y="2" width="14" height="1.5" rx="0.75" opacity="0.7" />
              <rect x="3" y="7" width="10" height="1.5" rx="0.75" opacity="0.85" />
              <rect x="5" y="12" width="6" height="1.5" rx="0.75" />
            </svg>
            <div>
              <h2 className="text-2xl font-semibold text-white">Filters</h2>
              {activeFilterCount > 0 && (
                <p className="text-white/40 text-sm mt-0.5">{activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} applied</p>
              )}
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 -mr-2 rounded-full hover:bg-white/5 text-white/40 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Divider */}
        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mx-8" />

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-8 py-8">
          <div className="space-y-10">
            
            {/* Media Type */}
            <section>
              <h3 className="text-xs font-medium text-white/40 uppercase tracking-widest mb-4">Media Type</h3>
              <div className="flex gap-3">
                {[
                  { value: "all", label: "All", icon: (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                  )},
                  { value: "image", label: "Images", icon: (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  )},
                  { value: "video", label: "Videos", icon: (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )},
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleTypeChange(option.value)}
                    className={`flex-1 flex flex-col items-center gap-2 py-4 rounded-2xl border transition-all ${
                      (filters.type || "all") === option.value
                        ? "bg-white text-black border-white"
                        : "bg-white/[0.02] text-white/60 border-white/10 hover:border-white/20 hover:text-white"
                    }`}
                  >
                    {option.icon}
                    <span className="text-sm font-medium">{option.label}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* Content Rating */}
            <section>
              <h3 className="text-xs font-medium text-white/40 uppercase tracking-widest mb-4">Content Rating</h3>
              <div className="flex gap-3">
                {[
                  { value: "all", label: "All" },
                  { value: "sfw", label: "Safe" },
                  { value: "nsfw", label: "Mature" },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleNsfwChange(option.value)}
                    className={`flex-1 py-3 rounded-xl border transition-all text-sm font-medium ${
                      (filters.nsfw || "all") === option.value
                        ? "bg-white text-black border-white"
                        : "bg-white/[0.02] text-white/60 border-white/10 hover:border-white/20 hover:text-white"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </section>

            {/* Aspect Ratio */}
            <section>
              <h3 className="text-xs font-medium text-white/40 uppercase tracking-widest mb-4">Aspect Ratio</h3>
              <div className="flex gap-3">
                {[
                  { value: "landscape", label: "Wide", ratio: "16:9" },
                  { value: "square", label: "Square", ratio: "1:1" },
                  { value: "portrait", label: "Tall", ratio: "9:16" },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleAspectChange(option.value)}
                    className={`flex-1 flex flex-col items-center gap-3 py-4 rounded-2xl border transition-all ${
                      filters.aspect === option.value
                        ? "bg-white text-black border-white"
                        : "bg-white/[0.02] text-white/60 border-white/10 hover:border-white/20 hover:text-white"
                    }`}
                  >
                    {/* Visual aspect ratio indicator */}
                    <div className={`rounded-sm ${filters.aspect === option.value ? 'bg-black/20' : 'bg-white/20'} ${
                      option.value === 'landscape' ? 'w-10 h-6' :
                      option.value === 'square' ? 'w-7 h-7' :
                      'w-5 h-8'
                    }`} />
                    <div className="text-center">
                      <div className="text-sm font-medium">{option.label}</div>
                      <div className={`text-xs mt-0.5 ${filters.aspect === option.value ? 'text-black/50' : 'text-white/30'}`}>{option.ratio}</div>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            {/* Models */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-medium text-white/40 uppercase tracking-widest">Models</h3>
                {filters.models && filters.models.length > 0 && (
                  <span className="text-xs text-white/40">{filters.models.length} selected</span>
                )}
              </div>
              {loadingModels ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
                </div>
              ) : availableModels.length === 0 ? (
                <p className="text-white/30 text-sm py-8 text-center">No models available</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {availableModels.map((model) => {
                    const isSelected = filters.models?.includes(model);
                    return (
                      <button
                        key={model}
                        onClick={() => handleModelToggle(model)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                          isSelected
                            ? "bg-white text-black border-white"
                            : "bg-white/[0.02] text-white/60 border-white/10 hover:border-white/20 hover:text-white"
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          isSelected ? "bg-black border-black" : "border-white/30"
                        }`}>
                          {isSelected && (
                            <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <span className="text-sm font-medium truncate">{model}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-6 border-t border-white/5">
          <div className="flex gap-3">
            {activeFilterCount > 0 && (
              <button
                onClick={clearAllFilters}
                className="flex-1 py-3.5 rounded-xl border border-white/10 text-white/60 hover:text-white hover:border-white/20 text-sm font-medium transition-all"
              >
                Clear All
              </button>
            )}
            <button
              onClick={() => setIsOpen(false)}
              className={`py-3.5 rounded-xl bg-white text-black text-sm font-semibold transition-all hover:bg-white/90 ${
                activeFilterCount > 0 ? "flex-1" : "w-full"
              }`}
            >
              Show Results
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
