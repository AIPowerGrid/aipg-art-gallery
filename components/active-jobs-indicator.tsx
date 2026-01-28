"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useJobStore, TrackedJob } from "@/lib/stores/job-store";
import { calculateProgress } from "@/lib/hooks/use-favicon-progress";

export function ActiveJobsIndicator() {
  const [mounted, setMounted] = useState(false);
  const { jobs, getActiveJobs, startPolling, isPolling } = useJobStore();
  const [showDropdown, setShowDropdown] = useState(false);

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

  if (!mounted) return null;

  const activeJobs = getActiveJobs();
  const recentCompleted = jobs
    .filter(j => j.status === 'completed')
    .slice(0, 3);

  // Don't show anything if no jobs
  if (activeJobs.length === 0 && recentCompleted.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setShowDropdown(!showDropdown);
        }}
        className="relative flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1a1a1a] border border-[#333] text-white/80 hover:bg-[#222] hover:text-white transition-colors"
      >
        {activeJobs.length > 0 ? (
          <>
            {/* Spinning loader */}
            <div className="w-4 h-4 border-2 border-white/30 border-t-blue-400 rounded-full animate-spin" />
            <span className="text-xs sm:text-sm font-medium">
              {activeJobs.length} {activeJobs.length === 1 ? 'job' : 'jobs'}
            </span>
          </>
        ) : (
          <>
            <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-xs sm:text-sm">Done</span>
          </>
        )}
      </button>

      {showDropdown && (
        <div 
          className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto rounded-xl bg-black/95 border border-white/20 p-2 z-50 shadow-xl backdrop-blur-sm"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Active Jobs */}
          {activeJobs.length > 0 && (
            <>
              <div className="px-3 py-2 text-xs text-white/50 border-b border-white/10 mb-2 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                Active Jobs
              </div>
              {activeJobs.map((job) => (
                <JobItem key={job.jobId} job={job} />
              ))}
            </>
          )}

          {/* Recent Completed */}
          {recentCompleted.length > 0 && (
            <>
              <div className="px-3 py-2 text-xs text-white/50 border-b border-white/10 mb-2 mt-2 flex items-center gap-2">
                <svg className="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Recently Completed
              </div>
              {recentCompleted.map((job) => (
                <JobItem key={job.jobId} job={job} />
              ))}
            </>
          )}

          {/* View all link */}
          <Link
            href="/create"
            className="block mt-2 px-3 py-2 text-center text-sm text-blue-400 hover:bg-blue-500/10 rounded-xl transition"
            onClick={() => setShowDropdown(false)}
          >
            View in Studio →
          </Link>
        </div>
      )}
    </div>
  );
}

function JobItem({ job }: { job: TrackedJob }) {
  const progress = calculateProgress(
    job.submittedAt,
    job.initialWaitTime,
    job.waitTime,
    job.status
  );

  const statusLabels = {
    queued: 'Finding worker...',
    processing: 'Processing',
    completed: 'Done',
    faulted: 'Failed',
    cancelled: 'Cancelled',
  };

  const isActive = job.status === 'queued' || job.status === 'processing';

  return (
    <div className="px-3 py-2 rounded-lg hover:bg-white/5 transition">
      <div className="flex items-start gap-2">
        {/* Progress indicator */}
        <div className="w-8 h-8 flex-shrink-0 relative">
          <svg className="w-8 h-8 transform -rotate-90">
            <circle
              cx="16"
              cy="16"
              r="12"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className="text-zinc-700"
            />
            <circle
              cx="16"
              cy="16"
              r="12"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeDasharray={`${progress * 0.754} 100`}
              strokeLinecap="round"
              className={
                job.status === 'completed' ? 'text-green-400' :
                job.status === 'faulted' ? 'text-red-400' :
                progress >= 80 ? 'text-green-400' :
                job.status === 'processing' ? 'text-blue-400' : 'text-yellow-400'
              }
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white/70 font-medium">
            {job.status === 'completed' ? '✓' : 
             job.status === 'faulted' ? '!' :
             `${Math.round(progress)}%`}
          </span>
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="text-sm text-white truncate">
            {job.prompt.slice(0, 40)}{job.prompt.length > 40 ? '...' : ''}
          </div>
          
          <div className="flex items-center gap-2 mt-1 text-xs text-white/50">
            <span className={`${job.status === 'faulted' ? 'text-red-400' : ''}`}>
              {statusLabels[job.status]}
            </span>
            <span>•</span>
            <span>{job.type === 'video' ? '🎬' : '🖼️'}</span>
            {isActive && job.waitTime && job.waitTime > 0 && (
              <>
                <span>•</span>
                <span>~{Math.ceil(job.waitTime)}s</span>
              </>
            )}
          </div>

          {job.status === 'faulted' && job.error && (
            <div className="text-xs text-red-400 mt-1 truncate">
              {job.error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
