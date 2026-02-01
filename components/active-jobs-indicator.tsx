"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useJobStore, TrackedJob } from "@/lib/stores/job-store";
import { calculateProgress } from "@/lib/hooks/use-favicon-progress";
import { getThumbnailUrl } from "@/lib/utils/thumbnails";
import { downloadMedia, getMediaFilename } from "@/lib/utils/download";
import { ImageModal } from "./image-modal";
import { GalleryItem } from "@/lib/api";

export function ActiveJobsIndicator() {
  const [mounted, setMounted] = useState(false);
  const { jobs, getActiveJobs, startPolling, isPolling } = useJobStore();
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedJob, setSelectedJob] = useState<TrackedJob | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Start polling if there are active jobs
  useEffect(() => {
    if (mounted && !isPolling) {
      const activeJobs = getActiveJobs();
      if (activeJobs.length > 0) {
        startPolling();
      }
    }
  }, [mounted, isPolling, getActiveJobs, startPolling]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setShowDropdown(false);
    if (showDropdown) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [showDropdown]);

  // Convert TrackedJob to GalleryItem format for ImageModal
  const jobToGalleryItem = (job: TrackedJob): GalleryItem | null => {
    if (!job.result?.generations?.[0]) return null;
    const gen = job.result.generations[0];
    return {
      jobId: job.jobId,
      modelId: job.modelId,
      modelName: job.modelName,
      prompt: job.prompt,
      negativePrompt: "",
      type: job.type,
      isNsfw: false,
      isPublic: false,
      walletAddress: job.walletAddress,
      createdAt: job.submittedAt,
      mediaUrls: job.result.generations.map(g => g.url).filter((url): url is string => !!url),
      params: {
        width: job.width,
        height: job.height,
      },
    };
  };

  if (!mounted) return null;

  const activeJobs = getActiveJobs();
  const recentCompleted = jobs
    .filter(j => j.status === 'completed')
    .slice(0, 5);

  // Don't show anything if no jobs
  if (activeJobs.length === 0 && recentCompleted.length === 0) {
    return null;
  }

  const totalJobs = activeJobs.length + recentCompleted.length;

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setShowDropdown(!showDropdown);
        }}
        className="relative flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-white/80 hover:bg-zinc-700 hover:text-white transition-colors"
      >
        {activeJobs.length > 0 ? (
          <div className="w-4 h-4 border-2 border-white/30 border-t-indigo-400 rounded-full animate-spin" />
        ) : (
          <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        )}
        <span className="text-sm font-medium">Jobs</span>
        {totalJobs > 0 && (
          <span className="px-1.5 py-0.5 text-xs bg-zinc-700 rounded-full">
            {totalJobs}
          </span>
        )}
        <svg 
          className={`w-3 h-3 text-zinc-500 transition-transform ${showDropdown ? 'rotate-180' : ''}`}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {showDropdown && (
        <div 
          className="absolute right-0 top-full mt-2 w-80 rounded-xl bg-zinc-900 border border-zinc-700 shadow-2xl z-50 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-4 py-3 bg-zinc-800/50 border-b border-zinc-700">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">Jobs</span>
              <Link
                href="/create"
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                onClick={() => setShowDropdown(false)}
              >
                View all in Studio →
              </Link>
            </div>
          </div>

          {/* Jobs list */}
          <div className="max-h-80 overflow-y-auto">
            {/* Active Jobs */}
            {activeJobs.length > 0 && (
              <div className="p-2">
                <div className="px-2 py-1.5 text-xs text-zinc-500 font-medium flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                  In Progress ({activeJobs.length})
                </div>
                {activeJobs.map((job) => (
                  <JobItem key={job.jobId} job={job} onSelect={() => {}} />
                ))}
              </div>
            )}

            {/* Completed Jobs */}
            {recentCompleted.length > 0 && (
              <div className={`p-2 ${activeJobs.length > 0 ? 'border-t border-zinc-800' : ''}`}>
                <div className="px-2 py-1.5 text-xs text-zinc-500 font-medium flex items-center gap-2">
                  <svg className="w-3 h-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Completed ({recentCompleted.length})
                </div>
                {recentCompleted.map((job) => (
                  <JobItem 
                    key={job.jobId} 
                    job={job} 
                    onSelect={() => {
                      setSelectedJob(job);
                      setShowDropdown(false);
                    }} 
                  />
                ))}
              </div>
            )}

            {activeJobs.length === 0 && recentCompleted.length === 0 && (
              <div className="p-8 text-center text-zinc-500 text-sm">
                No jobs yet
              </div>
            )}
          </div>
        </div>
      )}

      {/* Job Detail Modal - uses shared ImageModal component */}
      {selectedJob && (() => {
        const galleryItem = jobToGalleryItem(selectedJob);
        if (!galleryItem) return null;
        return (
          <ImageModal
            isOpen={true}
            onClose={() => setSelectedJob(null)}
            item={galleryItem}
            onDownload={(index) => {
              const gen = selectedJob.result?.generations[index];
              if (gen?.url) {
                downloadMedia(gen.url, getMediaFilename(selectedJob.jobId, gen.id, selectedJob.type === 'video'));
              }
            }}
          />
        );
      })()}
    </div>
  );
}

function JobItem({ job, onSelect }: { job: TrackedJob; onSelect: () => void }) {
  const progress = calculateProgress(
    job.submittedAt,
    job.initialWaitTime,
    job.waitTime,
    job.status
  );

  const isActive = job.status === 'queued' || job.status === 'processing';
  const isCompleted = job.status === 'completed';
  const isFailed = job.status === 'faulted';
  
  // Get thumbnail for completed jobs
  const thumbnailUrl = isCompleted && job.result?.generations?.[0]?.url
    ? getThumbnailUrl(job.result.generations[0].url, 80)
    : null;

  const content = (
    <div className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
      isCompleted ? 'hover:bg-zinc-800 cursor-pointer' : 'hover:bg-zinc-800/50'
    }`}>
      {/* Thumbnail or Progress */}
      <div className="w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-zinc-800 flex items-center justify-center">
        {thumbnailUrl ? (
          <img 
            src={thumbnailUrl} 
            alt="" 
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="relative w-10 h-10">
            <svg className="w-10 h-10 transform -rotate-90">
              <circle
                cx="20"
                cy="20"
                r="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                className="text-zinc-700"
              />
              <circle
                cx="20"
                cy="20"
                r="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeDasharray={`${progress * 1.005} 100`}
                strokeLinecap="round"
                className={
                  isFailed ? 'text-red-400' :
                  progress >= 80 ? 'text-green-400' :
                  job.status === 'processing' ? 'text-indigo-400' : 'text-yellow-400'
                }
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs text-white/70 font-medium">
              {isFailed ? '!' : `${Math.round(progress)}%`}
            </span>
          </div>
        )}
      </div>
      
      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-white truncate">
          {job.prompt.length > 35 ? job.prompt.slice(0, 35) + '...' : job.prompt}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-500">
          {isActive && (
            <>
              <span className="text-indigo-400">
                {job.status === 'queued' ? 'Queued' : 'Processing'}
              </span>
              {job.waitTime && job.waitTime > 0 && (
                <>
                  <span>•</span>
                  <span>~{Math.ceil(job.waitTime)}s</span>
                </>
              )}
            </>
          )}
          {isCompleted && (
            <span className="text-green-400">Done</span>
          )}
          {isFailed && (
            <span className="text-red-400">Failed</span>
          )}
          <span>•</span>
          <span>{job.type === 'video' ? 'Video' : 'Image'}</span>
        </div>
      </div>

      {/* Arrow for completed */}
      {isCompleted && (
        <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      )}
    </div>
  );

  if (isCompleted) {
    return (
      <div onClick={onSelect}>
        {content}
      </div>
    );
  }

  return content;
}
