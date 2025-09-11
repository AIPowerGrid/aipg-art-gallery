import React, { useState, useEffect } from 'react';
import { createSupabaseClient } from '@/lib/supabase/client';
import { getUserActiveJobs, getUserCompletedJobs, cancelJob } from '@/app/_api/jobTrackingService';
import { getFinishedImage } from '@/app/_api/fetchFinishedImage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GeneratedImage } from '@/types';
import { LoadingSpinner } from '../misc-components/LoadingSpinner';
import { useToast } from '@/components/ui/use-toast';

interface ActiveJobsPanelProps {
  onJobComplete?: (images: GeneratedImage[]) => void;
}

const ActiveJobsPanel: React.FC<ActiveJobsPanelProps> = ({ onJobComplete }) => {
  const [activeJobs, setActiveJobs] = useState<any[]>([]);
  const [completedJobs, setCompletedJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingJob, setCheckingJob] = useState<string | null>(null);
  const [cancellingJob, setCancellingJob] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [rateLimitTimer, setRateLimitTimer] = useState(0);
  
  const supabase = createSupabaseClient();
  const [userData, setUserData] = useState<any>(null);
  const { toast } = useToast();
  
  // Get the current user
  useEffect(() => {
    const fetchUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUserData(data.user);
    };
    
    fetchUser();
  }, [supabase]);
  
  const fetchJobs = async () => {
    if (!userData?.id) return;
    
    setLoading(true);
    try {
      const activeJobsResult = await getUserActiveJobs(userData.id);
      if (activeJobsResult.success && activeJobsResult.data) {
        setActiveJobs(activeJobsResult.data);
      } else {
        setActiveJobs([]);
      }
      
      const completedJobsResult = await getUserCompletedJobs(userData.id);
      if (completedJobsResult.success && completedJobsResult.data) {
        setCompletedJobs(completedJobsResult.data);
      } else {
        setCompletedJobs([]);
      }
    } catch (error) {
      console.error('Error fetching jobs:', error);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    if (userData?.id) {
      fetchJobs();
    }
  }, [userData]);
  
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchJobs();
    setRefreshing(false);
  };
  
  const handleCheckJob = async (jobId: string) => {
    if (!userData?.id) return;
    
    if (rateLimited) {
      alert('You are rate limited. Please wait ' + rateLimitTimer + ' seconds before checking again.');
      return;
    }
    
    setCheckingJob(jobId);
    
    try {
      // Check if this is a completed job
      const isCompleted = completedJobs.some(job => job.job_id === jobId);
      
      // If it's a completed job, fetch the images directly
      if (isCompleted) {
        const result = await getFinishedImage(jobId);
        
        if (result.success && 'images' in result) {
          // If we have a callback, use it
          if (onJobComplete) {
            onJobComplete(result.images);
          }
          
          // Display success toast
          toast({
            title: "Success",
            description: "Images loaded successfully!",
          });
          
          // Navigate to the images in the UI
          // This should be handled by the parent component via onJobComplete
        } else {
          toast({
            title: "Error",
            description: 'message' in result ? result.message : "Failed to load images. Please try again.",
            variant: "destructive",
          });
        }
        return;
      }
      
      // For active jobs, we need to check the status
      // First, get the job from our active jobs list
      const activeJob = activeJobs.find(job => job.job_id === jobId);
      
      // Only pass userId if the job is not in a final state
      // to prevent triggering another API request for completed jobs
      const result = await getFinishedImage(
        jobId, 
        activeJob && ['pending', 'processing'].includes(activeJob.status) ? userData.id : undefined
      );
      
      if (result.success && 'generations' in result) {
        // Job is complete, refresh the job list
        await handleRefresh();
        
        // Notify parent component if callback provided
        if (onJobComplete && result.generations) {
          onJobComplete(result.generations as GeneratedImage[]);
        }
      } else if (!result.success && 'status' in result && result.status === 'RATE_LIMITED') {
        // Handle rate limiting
        const retryAfter = 'retryAfter' in result ? (result.retryAfter as number) : 60;
        setRateLimited(true);
        setRateLimitTimer(retryAfter);
        
        toast({
          title: "Rate Limited",
          description: `API rate limit reached. Please wait ${retryAfter} seconds.`,
          variant: "destructive",
        });
      } else if (!result.success && 'status' in result && result.status === 'PROCESSING') {
        // Job is still processing, update the job list with wait time info
        const updatedJobs = activeJobs.map(job => {
          if (job.job_id === jobId) {
            return {
              ...job,
              result: {
                ...job.result,
                wait_time: 'waitTime' in result ? result.waitTime : 0,
                queue_position: 'queuePosition' in result ? result.queuePosition : 0
              }
            };
          }
          return job;
        });
        
        setActiveJobs(updatedJobs);
        
        toast({
          title: "Job Status",
          description: `Your image is still processing. ${('waitTime' in result && result.waitTime) ? `Estimated wait: ~${result.waitTime}s` : ''}`,
        });
      }
    } catch (error) {
      console.error('Error checking job:', error);
      
      toast({
        title: "Error",
        description: "Failed to check job status. Please try again.",
        variant: "destructive",
      });
    } finally {
      setCheckingJob(null);
    }
  };
  
  const handleCancelJob = async (jobId: string) => {
    if (!userData?.id) return;
    
    if (rateLimited) {
      alert('You are rate limited. Please wait ' + rateLimitTimer + ' seconds before cancelling again.');
      return;
    }
    
    setCancellingJob(jobId);
    try {
      const result = await cancelJob(jobId, userData.id);
      
      if (result.success) {
        // Job is cancelled, refresh the job list
        await handleRefresh();
        
        // Check if we got any partial images back
        if (result.partialImages && result.partialImages.length > 0) {
          toast({
            title: "Job Cancelled",
            description: `Your job has been cancelled. ${result.partialImages.length} partial image(s) were saved.`,
          });
          
          // Notify parent component if callback provided
          if (onJobComplete && result.partialImages) {
            onJobComplete(result.partialImages);
          }
        } else {
          toast({
            title: "Job Cancelled",
            description: `Your job has been cancelled.`,
          });
        }
      } else if (result.status === 'RATE_LIMITED') {
        // Handle rate limiting
        const retryAfter = result.retryAfter || 60;
        setRateLimited(true);
        setRateLimitTimer(retryAfter);
        
        toast({
          title: "Rate Limited",
          description: `API rate limit reached. Please wait ${retryAfter} seconds.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to cancel job. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error cancelling job:', error);
      
      toast({
        title: "Error",
        description: "Failed to cancel job. Please try again.",
        variant: "destructive",
      });
    } finally {
      setCancellingJob(null);
    }
  };
  
  // Add a rate limit countdown effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (rateLimited && rateLimitTimer > 0) {
      interval = setInterval(() => {
        setRateLimitTimer(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            setRateLimited(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [rateLimited, rateLimitTimer]);
  
  // Auto-refresh jobs every 15 seconds
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (userData?.id && !rateLimited) {
      interval = setInterval(() => {
        fetchJobs();
      }, 15000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [userData, rateLimited]);
  
  if (!userData) {
    return null;
  }
  
  return (
    <Card className="bg-zinc-900/60 border-zinc-800/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-medium flex items-center justify-between">
          <span>Your Jobs</span>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleRefresh} 
            disabled={refreshing || loading}
            className="h-8 px-2 text-xs"
          >
            {refreshing ? <LoadingSpinner size="sm" /> : 'Refresh'}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="active" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="active">Active ({activeJobs.length})</TabsTrigger>
            <TabsTrigger value="completed">Completed ({completedJobs.length})</TabsTrigger>
          </TabsList>
          
          <TabsContent value="active">
            {loading ? (
              <div className="flex justify-center py-4">
                <LoadingSpinner />
              </div>
            ) : activeJobs.length > 0 ? (
              <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                {activeJobs.map((job) => (
                  <div key={job.job_id} className="flex items-center justify-between bg-zinc-800/40 p-3 rounded-md">
                    <div>
                      <p className="text-sm font-medium truncate max-w-[200px]">{job.prompt}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-zinc-400">
                          Status: {job.status}
                          {job.result?.wait_time > 0 && ` (Wait: ~${job.result.wait_time}s)`}
                          {job.result?.queue_position > 0 && ` (Queue: #${job.result.queue_position})`}
                        </p>
                        {job.status === 'processing' && (
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                          </span>
                        )}
                        {job.status === 'cancelled' && (
                          <span className="text-xs text-red-400 ml-2">Cancelled</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCheckJob(job.job_id)}
                        disabled={checkingJob === job.job_id || rateLimited}
                        className="h-8 text-xs"
                      >
                        {checkingJob === job.job_id ? <LoadingSpinner size="sm" /> : rateLimited ? `Wait (${rateLimitTimer}s)` : 'Check'}
                      </Button>
                      {job.status !== 'cancelled' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCancelJob(job.job_id)}
                          disabled={cancellingJob === job.job_id || rateLimited}
                          className="h-8 text-xs"
                        >
                          {cancellingJob === job.job_id ? <LoadingSpinner size="sm" /> : rateLimited ? `Wait (${rateLimitTimer}s)` : 'Cancel'}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-400 text-center py-4">No active jobs</p>
            )}
          </TabsContent>
          
          <TabsContent value="completed">
            {loading ? (
              <div className="flex justify-center py-4">
                <LoadingSpinner />
              </div>
            ) : completedJobs.length > 0 ? (
              <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                {completedJobs.map((job) => (
                  <div key={job.job_id} className="flex items-center justify-between bg-zinc-800/40 p-3 rounded-md">
                    <div>
                      <p className="text-sm font-medium truncate max-w-[200px]">{job.prompt}</p>
                      <p className="text-xs text-zinc-400">Completed</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCheckJob(job.job_id)}
                      className="h-8 text-xs"
                    >
                      View
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-400 text-center py-4">No completed jobs</p>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default ActiveJobsPanel;
