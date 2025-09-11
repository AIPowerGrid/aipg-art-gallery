"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { LoadingSpinner } from "@/components/misc-components/LoadingSpinner";
import { User } from "@supabase/supabase-js";
import { motion, AnimatePresence } from "framer-motion";
import { fetchUserLikedImages } from "@/app/_api/fetchUserLikedImages";
import ImageCard from "../misc-components/ImageCard";
import ImageDetailModal from "@/components/homepage-components/ImageDetailModal";
import { Heart } from "lucide-react";

// Define proper types for our data
interface ImageData {
  id: string;
  image_url: string;
  seed?: string;
}

interface ImageMetadata {
  id: string;
  positive_prompt: string;
  negative_prompt: string;
  model: string;
  sampler: string;
  guidance: number;
  public_view: boolean;
  user_id: string;
  created_at: string;
  image_data: ImageData[];
}

interface LikedImage {
  image_metadata: ImageMetadata;
}

const LikesPage = ({ user }: { user: User | null }) => {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [selectedImage, setSelectedImage] = useState<ImageMetadata | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Use a more generic typing approach to avoid type errors with the API
  const { isLoading, data, hasNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: ["userLikedImages", user?.id],
    // @ts-ignore - The fetchUserLikedImages function returns a compatible format but TypeScript can't infer it correctly
    queryFn: ({ pageParam }) => fetchUserLikedImages(user?.id, pageParam as number),
    initialPageParam: 1,
    getNextPageParam: (lastPage: any[], allPages: any[][]) => {
      if (lastPage.length === 0) return undefined;
      return allPages.length + 1;
    },
    enabled: !!user,
  });

  // We'll cast the data to our expected format
  const photos = (data?.pages.flat() || []) as LikedImage[];

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.5 }
    );

    if (sentinelRef.current) {
      observer.observe(sentinelRef.current);
    }
    return () => {
      if (sentinelRef.current) {
        observer.unobserve(sentinelRef.current);
      }
    };
  }, [hasNextPage, fetchNextPage]);
  
  const handleImageClick = (image: ImageMetadata) => {
    setSelectedImage(image);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    // Small delay to avoid visual glitches when closing modal
    setTimeout(() => setSelectedImage(null), 300);
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-900 to-black pb-12">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-pink-500/20 blur-3xl opacity-30" />
        <div className="relative container mx-auto px-4 py-16 md:py-24 flex flex-col items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-3xl mx-auto"
          >
            <div className="flex items-center justify-center mb-6">
              <Heart className="text-pink-500 w-8 h-8 mr-3 fill-pink-500" />
              <h1 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
                Your Liked Gallery
              </h1>
            </div>
            <p className="text-zinc-400 text-lg mb-8">
              Your personal collection of AI-generated images that caught your eye
            </p>
          </motion.div>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="container mx-auto px-4">
        <div className="w-full">
          {!user && (
            <div className="flex flex-col items-center justify-center min-h-[50vh] bg-zinc-900/50 backdrop-blur-sm rounded-xl p-8 border border-zinc-800/50">
              <Heart className="text-zinc-600 w-16 h-16 mb-6" />
              <p className="text-xl font-medium text-zinc-300 mb-2">
                Sign in to view your liked images
              </p>
              <p className="text-zinc-500 text-center max-w-md">
                Create an account or sign in to start collecting your favorite AI-generated artwork
              </p>
            </div>
          )}
          
          {isLoading ? (
            <div className="flex justify-center my-12">
              <LoadingSpinner />
            </div>
          ) : photos && photos.length < 1 ? (
            <div className="flex flex-col items-center justify-center min-h-[50vh] bg-zinc-900/50 backdrop-blur-sm rounded-xl p-8 border border-zinc-800/50">
              <Heart className="text-zinc-600 w-16 h-16 mb-6" />
              <p className="text-xl font-medium text-zinc-300 mb-2">
                No liked images yet
              </p>
              <p className="text-zinc-500 text-center max-w-md">
                Explore the gallery and like some images to add them to your collection
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
              <AnimatePresence>
                {photos.map((photo: LikedImage, idx: number) => (
                  <motion.div
                    key={photo.image_metadata.id || idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4, delay: idx * 0.05 }}
                    className="group"
                    onClick={() => handleImageClick(photo.image_metadata)}
                  >
                    <div className="overflow-hidden rounded-xl border border-zinc-800/40 shadow-lg hover:shadow-xl transition-all duration-300 hover:border-pink-500/30 hover:scale-[1.01] bg-gradient-to-b from-zinc-900 to-zinc-950">
                      <ImageCard 
                        item={photo.image_metadata} 
                        user={user?.id}
                        forModal={true} // This tells ImageCard to not use its own dialog
                      />
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
          
          {hasNextPage && (
            <div ref={sentinelRef} className="flex justify-center my-8">
              <LoadingSpinner />
            </div>
          )}
        </div>
      </div>
      
      {/* Image Detail Modal */}
      {selectedImage && (
        <ImageDetailModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          image={selectedImage}
          currentUserId={user?.id || ''}
          isUserOwned={selectedImage?.user_id === user?.id}
        />
      )}
    </div>
  );
};

export default LikesPage;
