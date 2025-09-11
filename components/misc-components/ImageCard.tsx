"use client";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

import { motion } from "framer-motion";
import { Heart } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchLikedStatus, likeorUnlikeImages } from "@/app/_api/likeImages";

import { Button } from "../ui/button";
import { deleteUserImages } from "@/app/_api/deleteImage";
import CarouselComponent from "./CarouselComponent";
import { LoadingSpinner } from "./LoadingSpinner";
import Image from "next/image";

// Add forModal prop which controls whether the card should use its own dialog or be used with external modal
const ImageCard = ({ item, user, forModal = false }: any) => {
  const { data: isLiked, refetch } = useQuery({
    queryKey: ["imageLikeStatus", item.id, user], // Unique query key
    queryFn: () => fetchLikedStatus(item.id, user),
    enabled: !!user,
  });

  const { mutate: likeMutate } = useMutation({
    mutationKey: ["likeMutation", item.id, user],
    mutationFn: () => likeorUnlikeImages(user, item.id),
    onSuccess: async () => await refetch(),
    onError: (error) => console.error(error.message),
  });

  const { mutate: deleteMutate, isPending } = useMutation({
    mutationKey: ["deleteImages", item.id, user],
    mutationFn: () => deleteUserImages(item.id),
  });

  const toggleLike = (e?: React.MouseEvent) => {
    // Stop event propagation if an event is provided
    if (e) e.stopPropagation();
    
    if (!user) {
      return;
    }
    
    // Call likeMutate without parameters
    likeMutate();
  };

  // Check for valid image URL
  const imageUrl = item.image_data?.[0]?.image_url;
  const hasValidImage = !!imageUrl;

  // The thumbnail card content that's common between modal and dialog versions
  const thumbnailCard = (
    <div className="cursor-pointer relative rounded-sm overflow-hidden group bg-white">
      {hasValidImage ? (
        // Use Next Image directly with unoptimized prop for external URLs
        <Image
          src={imageUrl} // Use direct URL
          alt={item.positive_prompt}
          height={0}
          width={0}
          loading="lazy"
          className="w-full h-auto object-cover rounded-sm hover:scale-105 transition ease-in-out duration-200"
          quality={75} // Default Next.js quality, can adjust
          layout="responsive"
          unoptimized={true} // Important: Tells Next.js not to optimize this external image
        />
      ) : (
        // Fallback for missing images
        <div className="w-full h-64 flex items-center justify-center bg-zinc-800">
          <p className="text-zinc-400">Image not available</p>
        </div>
      )}
      {user && (
        <button
          onClick={toggleLike}
          className="absolute top-2 right-2 bg-gray-900 bg-opacity-70 p-1 rounded-full opacity-0 group-hover:opacity-100 outline-none"
        >
          {isLiked ? (
            <Heart className="w-6 h-6 fill-red-500" />
          ) : (
            <Heart className="w-6 h-6" />
          )}
        </button>
      )}
      <div className="absolute bottom-0 left-0 right-0 bg-zinc-950 bg-opacity-45 p-2 text-white flex items-center justify-between transition-opacity duration-300 opacity-0 group-hover:opacity-100">
        <p className="truncate text-sm font-medium text-center">
          {item.positive_prompt}
        </p>
      </div>
    </div>
  );

  // If used with external modal, just return the card without dialog wrapper
  if (forModal) {
    return <div className="z-50">{thumbnailCard}</div>;
  }

  // Otherwise use the existing dialog implementation
  return (
    <div className="z-50">
      <Dialog key={item.id}>
        <DialogTrigger asChild>
          {thumbnailCard}
        </DialogTrigger>
        <DialogContent className="md:min-w-[70%] overflow-y-scroll bg-transaprent max-h-[80vh] md:max-h-[95vh] no-scrollbar backdrop-blur-md">
          <div className="p-4 flex flex-col-reverse md:flex-row bg-transparent items-center justify-center gap-6 relative backdrop-blur-lg">
            {/* <div className="p-4 grid grid-flow-row md:grid-flow-col bg-transparent items-center justify-center gap-4 relative backdrop-blur-lg"> */}
            <div className="flex flex-col items-start h-full justify-start gap-2 text-white md:w-[80%] ">
              <div className="p-4 my-4 bg-opacity-40 bg-gray-800/50 rounded-lg flex flex-col items-start justify-start w-full">
                <p className="text-sm text-gray-300">Positive Prompt</p>
                <p className="text-md font-medium">{item.positive_prompt}</p>
              </div>
              <div className="grid grid-cols-2 gap-1 p-4 bg-gray-800/50 rounded-lg bg-opacity-40 w-full space-y-2">
                <div className="flex flex-col justify-start items-start gap-1 w-full">
                  <p className="text-sm text-gray-300">Model</p>
                  <p className="text-sm font-medium">{item.model}</p>
                </div>
                <div className="flex flex-col justify-start items-start gap-1">
                  <p className="text-sm text-gray-300">Sampler</p>
                  <p className="text-sm font-medium">{item.sampler}</p>
                </div>
                <div className="flex flex-col justify-start items-start gap-1">
                  <p className="text-sm text-gray-300">Guidance</p>
                  <p className="text-sm font-medium">{item.guidance}</p>
                </div>
                <div className="flex flex-col justify-start items-start gap-1">
                  <p className="text-sm text-gray-300">Seed</p>
                  <p className="text-sm font-medium">
                    {item.image_data[0]?.seed}
                  </p>
                </div>
              </div>

              <div className="p-4 my-4 bg-opacity-40 bg-gray-800/50 rounded-lg flex flex-col items-start justify-start ">
                <p className="text-sm text-gray-300">Negative Prompt</p>
                <p className="text-md font-medium tracking-tight">
                  {item.negative_prompt}
                </p>
              </div>

              {user === item.user_id && (
                <Button
                  variant="destructive"
                  onClick={() => deleteMutate(item.id)}
                >
                  Delete {isPending && <LoadingSpinner />}
                </Button>
              )}
            </div>

            <CarouselComponent
              images={item.image_data}
              isLiked={isLiked}
              toggleLike={toggleLike}
              userID={user}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ImageCard;
