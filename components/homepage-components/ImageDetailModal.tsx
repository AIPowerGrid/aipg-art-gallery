"use client";

import React, { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Share, Heart, ChevronLeft, ChevronRight, ImageIcon, Copy, Check, Sparkles, X, Trash } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteUserImages } from '@/app/_api/deleteImage';
import { LoadingSpinner } from '../misc-components/LoadingSpinner';
import { fetchLikedStatus, likeorUnlikeImages } from '@/app/_api/likeImages';

interface ImageDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  image: any; // The main image to display
  isUserOwned?: boolean; // Flag to indicate if image is owned by current user
  currentUserId?: string; // Current user ID to check ownership
}

interface ImageData {
  id: string;
  image_url: string;
  seed?: string;
}

const ImageDetailModal: React.FC<ImageDetailModalProps> = ({
  isOpen,
  onClose,
  image,
  isUserOwned = false,
  currentUserId = ''
}) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const queryClient = useQueryClient();
  
  // Fetch the liked status from the database
  const { data: isLiked, refetch: refetchLikeStatus } = useQuery({
    queryKey: ["imageLikeStatus", image?.id, currentUserId],
    queryFn: () => {
      console.log("Fetching like status for:", { imageId: image?.id, userId: currentUserId });
      if (!image?.id || !currentUserId) {
        console.warn("Missing required data for fetching like status:", { imageId: image?.id, userId: currentUserId });
        return false;
      }
      return fetchLikedStatus(image?.id, currentUserId);
    },
    enabled: !!currentUserId && !!image?.id && isOpen
  });
  
  // Set up mutation for like/unlike
  const { mutate: likeMutate, isPending: isLiking } = useMutation({
    mutationKey: ["likeMutation", image?.id, currentUserId],
    mutationFn: () => {
      console.log("[ImageDetailModal] Toggling like for:", { imageId: image?.id, userId: currentUserId });
      if (!image?.id || !currentUserId) {
        console.warn("Missing required data for toggling like:", { imageId: image?.id, userId: currentUserId });
        throw new Error("Missing required data");
      }
      return likeorUnlikeImages(currentUserId, image?.id);
    },
    // Add optimistic updates for better UX
    onMutate: async () => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["imageLikeStatus", image?.id, currentUserId] });
      
      // Snapshot the previous value
      const previousLiked = queryClient.getQueryData(["imageLikeStatus", image?.id, currentUserId]);
      console.log("[ImageDetailModal] Optimistic update - previous state:", previousLiked);
      
      // Optimistically update to the new value
      queryClient.setQueryData(["imageLikeStatus", image?.id, currentUserId], !previousLiked);
      console.log("[ImageDetailModal] Optimistic update - new state:", !previousLiked);
      
      // Return a context object with the previous value
      return { previousLiked };
    },
    onSuccess: async (newIsLiked) => {
      console.log("[ImageDetailModal] Like toggled successfully, new status:", newIsLiked);
      
      // Invalidate any other queries that might depend on like status
      queryClient.invalidateQueries({ queryKey: ["userLikedImages", currentUserId] });
      
      // Show a toast notification based on the new status
      toast.success(newIsLiked ? 'Image liked' : 'Image unliked');
    },
    onError: (error, _, context) => {
      console.error('[ImageDetailModal] Error toggling like:', error);
      toast.error('Failed to update like status');
      
      // Rollback to the previous value if there was an error
      if (context) {
        console.log("[ImageDetailModal] Rolling back optimistic update");
        queryClient.setQueryData(
          ["imageLikeStatus", image?.id, currentUserId], 
          context.previousLiked
        );
      }
    },
    // Refetch after error or success
    onSettled: () => {
      console.log("[ImageDetailModal] Refetching like status after mutation");
      refetchLikeStatus();
    },
  });
  
  const { mutate: deleteMutate, isPending: isDeleting } = useMutation({
    mutationFn: () => deleteUserImages(image.id),
    onSuccess: () => {
      // Invalidate the query to refresh the history list
      queryClient.invalidateQueries({ queryKey: ['usergeneratedImages'] });
      toast.success('Image deleted successfully');
      onClose(); // Close the modal after deletion
    },
    onError: (error) => {
      console.error('Error deleting image:', error);
      toast.error('Failed to delete image');
    }
  });
  
  useEffect(() => {
    // Reset to first image when modal opens
    setCurrentImageIndex(0);
    
    // Refetch like status when modal opens with a new image
    if (isOpen && currentUserId && image?.id) {
      refetchLikeStatus();
    }
  }, [isOpen, image, currentUserId, refetchLikeStatus]);
  
  useEffect(() => {
    // When modal opens, check if user is authenticated
    if (isOpen && !currentUserId) {
      console.log("[ImageDetailModal] Modal opened but user is not authenticated");
      toast.info('Log in to like images and save them to your collection', {
        id: 'login-prompt',
        duration: 5000,
      });
    }
  }, [isOpen, currentUserId]);
  
  const handleLikeToggle = () => {
    console.log("[ImageDetailModal] Like button clicked, current state:", {
      userId: currentUserId,
      imageId: image?.id,
      isCurrentlyLiked: isLiked,
      isLiking
    });
    
    if (!currentUserId) {
      console.warn("[ImageDetailModal] User not logged in, can't like image");
      toast.error('You must be logged in to like images');
      return;
    }
    
    if (!image?.id) {
      console.warn("[ImageDetailModal] Missing image ID, can't like image");
      toast.error('Error: Unable to like this image');
      return;
    }
    
    if (isLiking) {
      console.log("[ImageDetailModal] Like action already in progress, ignoring click");
      return; // Prevent multiple clicks
    }
    
    console.log("[ImageDetailModal] Calling likeMutate");
    likeMutate();
  };

  const handleDownload = async (imageUrl: string) => {
    if (!imageUrl) return;
    
    try {
      setLoading(true);
      let fileUrl = imageUrl;
      let fileName = 'generated-image.png';
      
      // Handle base64 images
      if (isBase64) {
        const blob = await (await fetch(imageUrl)).blob();
        fileUrl = URL.createObjectURL(blob);
        fileName = 'generated-image.png';
      } 
      // Handle permanent URLs with filename
      else if (imageUrl.includes('images.aipg.art')) {
        // Get the filename from the URL
        const parts = imageUrl.split('/');
        const filename = parts[parts.length - 1];
        if (filename) {
          fileName = filename;
        }
      }
      // Handle Cloudflare R2 URLs (temporary)
      else if (imageUrl.includes('cloudflarestorage.com')) {
        // Extract filename from the URL before the query params
        const urlWithoutParams = imageUrl.split('?')[0];
        const parts = urlWithoutParams.split('/');
        const filename = parts[parts.length - 1];
        if (filename) {
          fileName = filename;
        }
      }
      
      // Create a download link
      const link = document.createElement('a');
      link.href = fileUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      
      // Clean up
      if (!isBase64) {
        // No need to revoke for direct URLs
        document.body.removeChild(link);
      } else {
        // For blob URLs, we need to revoke them after download
        setTimeout(() => {
          URL.revokeObjectURL(fileUrl);
          document.body.removeChild(link);
        }, 100);
      }
      
      toast.success('Image downloaded successfully');
    } catch (error) {
      console.error('Error downloading image:', error);
      toast.error('Failed to download image');
    } finally {
      setLoading(false);
    }
  };
  
  const handleCopyPrompt = () => {
    if (image?.positive_prompt) {
      navigator.clipboard.writeText(image.positive_prompt)
        .then(() => {
          setCopied(true);
          toast.success('Prompt copied to clipboard');
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(err => {
          console.error('Failed to copy text: ', err);
          toast.error('Failed to copy prompt');
        });
    }
  };
  
  // Determine if the current user is the owner of this image
  const isOwner = isUserOwned || (currentUserId && image && image.user_id === currentUserId);

  if (!image || !image.image_data || image.image_data.length === 0) return null;

  const images = image.image_data as ImageData[];
  const currentImage = images[currentImageIndex];
  const imageUrl = currentImage?.image_url;
  const isBase64 = imageUrl?.startsWith('data:image');

  const goToNextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };

  const goToPrevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const selectImage = (index: number) => {
    setCurrentImageIndex(index);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] md:max-h-[85vh] overflow-y-auto bg-gradient-to-b from-zinc-900 to-black border-zinc-800/50 text-white rounded-xl shadow-2xl backdrop-blur-sm p-1">
        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 blur opacity-50" />
        <DialogClose className="absolute right-3 top-3 md:right-4 md:top-4 rounded-full p-1.5 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-700/50 z-20 opacity-70 hover:opacity-100 transition-opacity">
          <X className="h-4 w-4 md:h-5 md:w-5 text-zinc-300" />
          <span className="sr-only">Close</span>
        </DialogClose>
        <div className="relative z-10 p-3 md:p-5">
          <DialogHeader>
            <DialogTitle className="text-xl md:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-violet-400 to-pink-400">
              Image Details
            </DialogTitle>
          </DialogHeader>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 py-4 md:py-6">
            {/* Main Image with Navigation */}
            <div className="relative aspect-square overflow-hidden rounded-xl flex items-center justify-center bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800/50 shadow-xl">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentImageIndex}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="w-full h-full flex items-center justify-center"
                >
                  {/* Use simple img tag for all image types to ensure consistent display */}
                  <img 
                    src={imageUrl} 
                    alt={image.positive_prompt || "AI generated image"}
                    className="object-contain max-h-full max-w-full p-2 md:p-4"
                    onError={(e) => {
                      console.error("Image load error in modal:", e);
                      // Fall back to a placeholder if the image fails to load
                      e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23333'/%3E%3Ctext x='50' y='50' font-family='Arial' font-size='12' text-anchor='middle' fill='white' dominant-baseline='middle'%3EImage Error%3C/text%3E%3C/svg%3E";
                    }}
                  />
                </motion.div>
              </AnimatePresence>
              
              {images.length > 1 && (
                <>
                  <motion.button 
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={goToPrevImage}
                    className="absolute left-2 md:left-3 top-1/2 transform -translate-y-1/2 bg-black/60 rounded-full p-1.5 md:p-2.5 hover:bg-black/80 backdrop-blur-sm border border-white/10 shadow-lg z-20"
                  >
                    <ChevronLeft className="h-4 w-4 md:h-5 md:w-5" />
                  </motion.button>
                  <motion.button 
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={goToNextImage}
                    className="absolute right-2 md:right-3 top-1/2 transform -translate-y-1/2 bg-black/60 rounded-full p-1.5 md:p-2.5 hover:bg-black/80 backdrop-blur-sm border border-white/10 shadow-lg z-20"
                  >
                    <ChevronRight className="h-4 w-4 md:h-5 md:w-5" />
                  </motion.button>
                  <div className="absolute bottom-2 md:bottom-4 left-0 right-0 flex justify-center gap-1.5 z-20">
                    {images.map((_, index: number) => (
                      <button
                        key={index}
                        onClick={() => selectImage(index)}
                        className={`h-2 md:h-2.5 w-2 md:w-2.5 rounded-full transition-all ${
                          index === currentImageIndex 
                            ? 'bg-white scale-110 shadow-glow' 
                            : 'bg-white/40 hover:bg-white/70'
                        }`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
            
            {/* Image Metadata */}
            <div className="space-y-3 md:space-y-5">
              <div className="bg-zinc-900/70 backdrop-blur-sm rounded-xl p-3 md:p-4 border border-zinc-800/50">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-base md:text-lg font-medium text-zinc-200">Prompt</h3>
                  <motion.button 
                    onClick={handleCopyPrompt}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="text-zinc-400 hover:text-white"
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </motion.button>
                </div>
                <p className="text-zinc-300 text-xs md:text-sm leading-relaxed">{image.positive_prompt}</p>
              </div>
              
              {image.negative_prompt && (
                <div className="bg-zinc-900/70 backdrop-blur-sm rounded-xl p-3 md:p-4 border border-zinc-800/50">
                  <h3 className="text-base md:text-lg font-medium mb-2 text-zinc-200">Negative Prompt</h3>
                  <p className="text-zinc-300 text-xs md:text-sm leading-relaxed">{image.negative_prompt}</p>
                </div>
              )}
              
              <div className="bg-zinc-900/70 backdrop-blur-sm rounded-xl p-3 md:p-4 border border-zinc-800/50">
                <h3 className="text-base md:text-lg font-medium mb-2 md:mb-3 text-zinc-200">Generation Details</h3>
                <div className="grid grid-cols-2 gap-x-4 md:gap-x-6 gap-y-3 md:gap-y-4">
                  <div>
                    <h4 className="text-xs font-medium text-zinc-400 mb-1">Model</h4>
                    <p className="text-zinc-300 text-xs md:text-sm flex items-center">
                      <Sparkles className="h-3 w-3 mr-1.5 text-indigo-400" />
                      {image.model || 'Unknown'}
                    </p>
                  </div>
                  <div>
                    <h4 className="text-xs font-medium text-zinc-400 mb-1">Sampler</h4>
                    <p className="text-zinc-300 text-xs md:text-sm">{image.sampler || 'Unknown'}</p>
                  </div>
                  <div>
                    <h4 className="text-xs font-medium text-zinc-400 mb-1">Guidance</h4>
                    <p className="text-zinc-300 text-xs md:text-sm">{image.guidance || 'Unknown'}</p>
                  </div>
                  <div>
                    <h4 className="text-xs font-medium text-zinc-400 mb-1">Seed</h4>
                    <p className="text-zinc-300 text-xs md:text-sm font-mono">{currentImage?.seed || 'Unknown'}</p>
                  </div>
                  <div>
                    <h4 className="text-xs font-medium text-zinc-400 mb-1">Created</h4>
                    <p className="text-zinc-300 text-xs md:text-sm">
                      {new Date(image.created_at).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Thumbnail Carousel */}
          {images.length > 1 && (
            <div className="mt-2 bg-zinc-900/70 backdrop-blur-sm rounded-xl p-3 md:p-4 border border-zinc-800/50">
              <h3 className="text-base md:text-lg font-medium mb-2 md:mb-3 text-zinc-200 flex items-center">
                <ImageIcon className="h-4 w-4 mr-2 text-indigo-400" />
                All Variations
              </h3>
              <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 gap-2 md:gap-3">
                {images.map((img: ImageData, index: number) => (
                  <motion.div 
                    key={img.id} 
                    className={`relative aspect-square overflow-hidden rounded-lg cursor-pointer border ${
                      index === currentImageIndex 
                        ? 'border-indigo-500 ring-2 ring-indigo-500/50' 
                        : 'border-zinc-800/50 hover:border-zinc-600'
                    }`}
                    onClick={() => selectImage(index)}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    {/* Use simple img tag for thumbnails as well */}
                    <img 
                      src={img.image_url} 
                      alt={`Thumbnail ${index + 1}`}
                      className="object-cover w-full h-full"
                      onError={(e) => {
                        console.error("Thumbnail load error:", e);
                        // Fall back to a placeholder if the thumbnail fails to load
                        e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23333'/%3E%3Ctext x='50' y='50' font-family='Arial' font-size='12' text-anchor='middle' fill='white' dominant-baseline='middle'%3EImage Error%3C/text%3E%3C/svg%3E";
                      }}
                    />
                    {index === currentImageIndex && (
                      <div className="absolute inset-0 bg-indigo-500/20 backdrop-blur-[1px]"></div>
                    )}
                  </motion.div>
                ))}
              </div>
            </div>
          )}
          
          <div className="flex flex-wrap gap-2 md:gap-3 mt-4 md:mt-6 justify-end">
            {/* Delete button - only visible if image is owned by user */}
            {isOwner && (
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button 
                  variant="destructive" 
                  onClick={() => deleteMutate()}
                  className="rounded-full px-3 md:px-5 py-1 h-8 md:h-10 text-xs md:text-sm flex items-center"
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <div className="h-3 w-3 md:h-4 md:w-4 mr-1.5 md:mr-2 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  ) : (
                    <Trash className="h-3 w-3 md:h-4 md:w-4 mr-1.5 md:mr-2" />
                  )}
                  Delete
                </Button>
              </motion.div>
            )}
            
            {/* Like Button - Different versions for logged-in vs not logged-in */}
            {!currentUserId ? (
              // User is not logged in - show login prompt on the button
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button 
                  variant="outline" 
                  onClick={() => toast.error('You must be logged in to like images')}
                  className="bg-zinc-900/80 hover:bg-zinc-800 border-zinc-800/50 rounded-full px-3 md:px-5 py-1 h-8 md:h-10 text-xs md:text-sm text-white"
                >
                  <Heart className="h-3 w-3 md:h-4 md:w-4 mr-1.5 md:mr-2" />
                  Sign in to Like
                </Button>
              </motion.div>
            ) : (
              // User is logged in - show normal like button
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button 
                  variant="outline" 
                  onClick={handleLikeToggle}
                  disabled={isLiking}
                  className={`bg-zinc-900/80 hover:bg-zinc-800 border-zinc-800/50 rounded-full px-3 md:px-5 py-1 h-8 md:h-10 text-xs md:text-sm ${
                    isLiked ? 'text-pink-500 border-pink-500/30' : 'text-white'
                  } ${isLiking ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  {isLiking ? (
                    <div className="h-3 w-3 md:h-4 md:w-4 mr-1.5 md:mr-2 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  ) : (
                    <Heart className={`h-3 w-3 md:h-4 md:w-4 mr-1.5 md:mr-2 ${isLiked ? 'fill-pink-500' : ''}`} />
                  )}
                  {isLiked ? 'Liked' : 'Like'}
                </Button>
              </motion.div>
            )}
            
            {/* Download Button */}
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Button 
                variant="outline" 
                onClick={() => handleDownload(imageUrl)}
                className="bg-zinc-900/80 hover:bg-zinc-800 border-zinc-800/50 rounded-full px-3 md:px-5 py-1 h-8 md:h-10 text-xs md:text-sm flex items-center"
                disabled={loading}
              >
                {loading ? (
                  <div className="h-3 w-3 md:h-4 md:w-4 mr-1.5 md:mr-2 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : (
                  <Download className="h-3 w-3 md:h-4 md:w-4 mr-1.5 md:mr-2" />
                )}
                Download
              </Button>
            </motion.div>
            
            {/* Close Button */}
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Button 
                variant="outline" 
                onClick={onClose}
                className="bg-zinc-900/80 hover:bg-zinc-800 border-zinc-800/50 rounded-full px-3 md:px-5 py-1 h-8 md:h-10 text-xs md:text-sm"
              >
                Close
              </Button>
            </motion.div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ImageDetailModal;
