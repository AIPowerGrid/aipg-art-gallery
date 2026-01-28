"use client";

import { useEffect, useRef } from 'react';

/**
 * Hook to display progress in the browser favicon
 * Creates a circular progress indicator overlay on the favicon
 */
export function useFaviconProgress(progress: number, isActive: boolean) {
  const originalFaviconRef = useRef<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Get the current favicon
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!favicon) return;

    // Store original favicon on first run
    if (!originalFaviconRef.current) {
      originalFaviconRef.current = favicon.href;
    }

    // If not active, restore original favicon
    if (!isActive) {
      if (originalFaviconRef.current) {
        favicon.href = originalFaviconRef.current;
      }
      return;
    }

    // Create canvas if not exists
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
      canvasRef.current.width = 32;
      canvasRef.current.height = 32;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Load the original favicon image
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // Clear canvas
      ctx.clearRect(0, 0, 32, 32);

      // Draw original favicon (slightly dimmed when in progress)
      ctx.globalAlpha = 0.7;
      ctx.drawImage(img, 0, 0, 32, 32);
      ctx.globalAlpha = 1;

      // Draw progress ring
      const centerX = 16;
      const centerY = 16;
      const radius = 14;
      const lineWidth = 3;

      // Background ring (dark)
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.lineWidth = lineWidth;
      ctx.stroke();

      // Progress ring
      const startAngle = -Math.PI / 2; // Start from top
      const endAngle = startAngle + (2 * Math.PI * Math.min(progress, 100) / 100);

      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      
      // Color based on progress
      if (progress < 30) {
        ctx.strokeStyle = '#f59e0b'; // Amber for queued
      } else if (progress < 90) {
        ctx.strokeStyle = '#6366f1'; // Indigo for processing
      } else {
        ctx.strokeStyle = '#22c55e'; // Green for almost done
      }
      
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Update favicon
      favicon.href = canvas.toDataURL('image/png');
    };

    img.src = originalFaviconRef.current || '/favicon.ico';

    // Cleanup
    return () => {
      // Don't restore on every re-render, only when isActive changes to false
    };
  }, [progress, isActive]);

  // Restore original favicon on unmount
  useEffect(() => {
    return () => {
      if (originalFaviconRef.current) {
        const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
        if (favicon) {
          favicon.href = originalFaviconRef.current;
        }
      }
    };
  }, []);
}

/**
 * Calculate progress percentage based on elapsed time and initial estimate
 */
export function calculateProgress(
  submittedAt: number,
  initialWaitTime?: number,
  currentWaitTime?: number,
  status?: string
): number {
  if (status === 'completed') return 100;
  if (status === 'faulted' || status === 'cancelled') return 0;

  const elapsed = (Date.now() - submittedAt) / 1000; // seconds

  // If we have an initial wait time estimate
  if (initialWaitTime && initialWaitTime > 0) {
    // Calculate based on elapsed vs initial estimate
    // Cap at 95% until actually complete
    const progress = Math.min((elapsed / initialWaitTime) * 100, 95);
    return Math.max(progress, 5); // At least 5% to show something
  }

  // If we have current wait time, we're closer to done
  if (currentWaitTime !== undefined) {
    if (currentWaitTime <= 0) return 90; // About to finish
    // Estimate: if we've been waiting and still have time left
    // Assume we're partway through
    const estimatedTotal = elapsed + currentWaitTime;
    const progress = (elapsed / estimatedTotal) * 100;
    return Math.min(Math.max(progress, 10), 90);
  }

  // Fallback: slow progress based on elapsed time
  // Assume 60 second average, cap at 50%
  return Math.min((elapsed / 60) * 50, 50);
}
