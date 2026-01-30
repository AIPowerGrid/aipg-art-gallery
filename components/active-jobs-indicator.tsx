"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useJobStore, TrackedJob } from "@/lib/stores/job-store";
import { calculateProgress } from "@/lib/hooks/use-favicon-progress";
import { getThumbnailUrl } from "@/lib/utils/thumbnails";
import { downloadMedia, getMediaFilename } from "@/lib/utils/download";

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

  // Handle escape key for modal
  useEffect(() => {
    if (!selectedJob) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedJob(null);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedJob]);

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

      {/* Job Detail Modal - rendered via portal to escape header stacking context */}
      {selectedJob && selectedJob.result?.generations?.[0] && mounted && createPortal(
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 p-4"
          onClick={() => setSelectedJob(null)}
        >
          <div 
            className="flex flex-col items-center max-w-[95vw] max-h-[95vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Image */}
            <div className="relative flex items-center justify-center">
              {selectedJob.type === 'video' ? (
                <video 
                  src={selectedJob.result.generations[0].url}
                  controls
                  autoPlay
                  loop
                  className="max-w-full max-h-[70vh] object-contain rounded-lg"
                />
              ) : (
                <img 
                  src={selectedJob.result.generations[0].url}
                  alt={selectedJob.prompt}
                  className="max-w-full max-h-[70vh] object-contain rounded-lg"
                />
              )}
              
              {/* Close button */}
              <button
                onClick={() => setSelectedJob(null)}
                className="absolute top-2 right-2 p-2 bg-black/60 hover:bg-black/80 rounded-full transition-colors"
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Multiple images indicator */}
              {selectedJob.result.generations.length > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-black/60 rounded-full text-white text-sm font-medium">
                  1 / {selectedJob.result.generations.length}
                </div>
              )}
            </div>

            {/* Info bar */}
            <div className="mt-3 px-4 py-3 bg-zinc-900/90 rounded-xl backdrop-blur-sm max-w-2xl w-full">
              <p className="text-white/90 text-sm leading-relaxed mb-3 max-h-20 overflow-y-auto">
                {selectedJob.prompt}
              </p>
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <div className="flex items-center gap-3">
                  <span>{selectedJob.modelName}</span>
                  <span>•</span>
                  <span>{selectedJob.type === 'video' ? 'Video' : 'Image'}</span>
                  {selectedJob.width && selectedJob.height && (
                    <>
                      <span>•</span>
                      <span>{selectedJob.width}×{selectedJob.height}</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const url = selectedJob.result?.generations[0]?.url;
                      if (url) {
                        downloadMedia(url, getMediaFilename(url, selectedJob.type));
                      }
                    }}
                    className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download
                  </button>
                  <Link
                    href="/create"
                    onClick={() => setSelectedJob(null)}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    View in Studio
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
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
