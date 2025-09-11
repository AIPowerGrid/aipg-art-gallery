"use client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

import Loading from "../misc-components/Loading";
import { useQuery } from "@tanstack/react-query";
import { fetchHordePerformace } from "@/app/_api/fetchHordePerformance";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogContent,
} from "../ui/dialog";
import useJobIdStore from "@/stores/jobIDStore";
import { checkImageStatus } from "@/app/_api/checkImageStatus";
import { useEffect, useState, useRef } from "react";
import { getFinishedImage } from "@/app/_api/fetchFinishedImage";
import { User } from "@supabase/supabase-js";

import useImageMetadataStore from "@/stores/ImageMetadataStore";

import { saveImageData, saveMetadata } from "@/app/_api/saveImageToSupabase";
import { Info } from "lucide-react";
import { useToast } from "../ui/use-toast";
import { Button } from "../ui/button";
import { GeneratedImage } from "@/types";
import { LoadingSpinner } from "../misc-components/LoadingSpinner";
import { FinishedImageResponse, FinishedImageResponseError } from "@/types";

// [M] Define a simpler type for the passed metadata
interface SubmittedMetadata {
  positivePrompt: string;
  negativePrompt?: string;
  sampler: string;
  model: string;
  guidance: number;
  publicView: boolean;
}

interface ImageCarouselProps {
  jobId: string;
  userId?: string;
  onImagesLoaded?: (images: GeneratedImage[]) => void;
  submittedMetadata: SubmittedMetadata | null; // [M] Use the simpler type
}

const ImageCarousel = ({ jobId, userId, onImagesLoaded, submittedMetadata }: ImageCarouselProps) => {
  const { toast } = useToast();
  // [M] Remove store usage as metadata comes from props
  // const metadata = useImageMetadataStore((state) => state.metadata);
  // const resetMetadata = useImageMetadataStore((state) => state.resetMetadata);
  // const addImg = useImageMetadataStore((state) => state.addImage);

  const [images, setImages] = useState<any>(null);
  const [finalImages, setFinalImages] = useState<any>(null);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [isPolling, setIsPolling] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Add a ref to track if images have been saved for this job
  const savedImagesRef = useRef<{[key: string]: boolean}>({});

  // Polling function to check image status
  const pollImageStatus = async () => {
    if (!jobId || isComplete) return;

    setIsPolling(true);
    try {
      // [M] Assert result type for success case
      const result: FinishedImageResponse | FinishedImageResponseError = await getFinishedImage(jobId, userId);
      
      if (result.success) {
        // [M] Type assertion needed here as TS doesn't narrow the union type effectively
        const successResult = result as FinishedImageResponse;
        if (successResult.images) {
          // We have our images
          setGeneratedImages(successResult.images);
          setIsComplete(true);
          
          // Notify parent component if callback provided
          if (onImagesLoaded) {
            onImagesLoaded(successResult.images);
          }
          
          // Check if we already saved images for this job
          const alreadySaved = savedImagesRef.current[jobId];
          
          // [M] Add logging to check why save might be skipped
          console.log("Polling success: Checking conditions for save...", {
            userId: userId,
            submittedMetadata: submittedMetadata,
            shouldSave: !!(userId && submittedMetadata),
            alreadySaved: alreadySaved
          });

          // Save images if user is logged in and we haven't saved for this job yet
          if (userId && submittedMetadata && !alreadySaved) {
            await saveImagesToDatabase(successResult.images);
            // Mark this job as saved
            savedImagesRef.current[jobId] = true;
          }
        }
      } else {
        // If still processing, continue polling
        setTimeout(pollImageStatus, 3000);
      }
    } catch (error) {
      console.error("Error polling for image status:", error);
      // Retry after a delay
      setTimeout(pollImageStatus, 5000);
    } finally {
      setIsPolling(false);
    }
  };

  // Save images to database
  const saveImagesToDatabase = async (images: GeneratedImage[]) => {
    // [M] Add log to track entry into this function
    console.log("Entering saveImagesToDatabase for job:", jobId, "with metadata:", submittedMetadata);

    if (!userId || !submittedMetadata || images.length === 0) {
      console.log("Skipping save: Missing userId, submittedMetadata, or images", { userId, submittedMetadata, images });
      return;
    }
    
    // Check if we already saved these images
    if (savedImagesRef.current[jobId]) {
      console.log("Skipping save: Images for this job have already been saved", { jobId });
      return;
    }
    
    setIsSaving(true);
    setSaveError(null);
    
    try {
      // First save metadata using the passed prop
      console.log("Saving metadata with submitted prop:", submittedMetadata);
      const metadataResult = await saveMetadata({
        positive_prompt: submittedMetadata.positivePrompt,
        negative_prompt: submittedMetadata.negativePrompt || "",
        sampler: submittedMetadata.sampler,
        model: submittedMetadata.model,
        guidance: submittedMetadata.guidance,
        public_view: submittedMetadata.publicView,
        user_id: userId,
      });
      
      if (!metadataResult.success) {
        throw new Error("Failed to save metadata");
      }
      
      const metadataId = metadataResult.id;
      
      // [M] Add check for metadataId before proceeding
      if (!metadataId) {
        throw new Error("No metadata ID returned after saving metadata");
      }
      
      // Then save each image
      const savePromises = images.map(async (image) => {
        const imageUrl = image.img_url || image.base64String;
        if (!imageUrl) return null;
        
        return saveImageData({
          image_url: imageUrl,
          // [M] Ensure seed is converted to string
          seed: image.seed ? String(image.seed) : "", 
          // [M] metadataId is guaranteed to be string here due to check above
          metadata_id: metadataId,
        });
      });
      
      const results = await Promise.all(savePromises);
      const failedSaves = results.filter(r => !r || !r.success).length;
      
      if (failedSaves > 0) {
        toast({
          title: "Warning",
          description: `${failedSaves} images failed to save to your gallery.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Success",
          description: "Images saved to your gallery!",
        });
      }
      
      // Mark this job as saved
      savedImagesRef.current[jobId] = true;
    } catch (error) {
      console.error("Error saving images:", error);
      setSaveError("Failed to save images to your gallery. Please try again later.");
      toast({
        title: "Error",
        description: "Failed to save images to your gallery.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Start polling when component mounts or jobId changes
  // But ensure we only poll once for each jobId
  useEffect(() => {
    if (jobId && !savedImagesRef.current[jobId]) {
      pollImageStatus();
    }
  }, [jobId]);

  if (!jobId) {
    return null;
  }

  return (
    <div className="w-full">
      {isPolling && !isComplete && (
        <div className="flex flex-col items-center justify-center py-10">
          <LoadingSpinner />
          <p className="text-sm text-zinc-400 mt-4">
            Generating your images... This may take a moment. Please don't refresh the page.
          </p>
        </div>
      )}

      {isComplete && generatedImages.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold">Generated Images</h2>
          
          <Carousel className="w-full">
            <CarouselContent>
              {generatedImages.map((image, index) => (
                <CarouselItem key={index} className="md:basis-1/2 lg:basis-1/3">
                  <div className="p-1">
                    <Card className="overflow-hidden border-zinc-800 bg-zinc-900/60">
                      <CardContent className="p-0 aspect-square relative">
                        {image.img_url ? (
                          image.img_url.includes('r2.cloudflarestorage.com') ? (
                            <img 
                              src={image.img_url} 
                              alt={`Generated image ${index + 1}`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <img 
                              src={image.img_url} 
                              alt={`Generated image ${index + 1}`}
                              className="w-full h-full object-cover"
                            />
                          )
                        ) : image.base64String ? (
                          <img 
                            src={image.base64String} 
                            alt={`Generated image ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-zinc-900">
                            <p className="text-zinc-500">Image not available</p>
                          </div>
                        )}
                      </CardContent>
                      <CardFooter className="p-3 bg-zinc-900/80">
                        <div className="w-full text-xs text-zinc-400">
                          <p>Seed: {image.seed || 'Unknown'}</p>
                        </div>
                      </CardFooter>
                    </Card>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className="left-2" />
            <CarouselNext className="right-2" />
          </Carousel>
          
          {saveError && (
            <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 mt-4">
              <p className="text-red-300 text-sm">{saveError}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ImageCarousel;
