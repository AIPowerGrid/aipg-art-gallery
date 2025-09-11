"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchPublicImages } from "@/app/_api/fetchPublicImages";
import { useState, useMemo, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Download, Heart, ImageIcon, ArrowRight, Search } from "lucide-react";
import SearchBar from "./SearchBar";
import ImageDetailModal from "./ImageDetailModal";
import { motion } from "framer-motion";
import { createSupabaseClient } from '@/lib/supabase/client';
import { User } from '@supabase/supabase-js';
import Masonry, { ResponsiveMasonry } from "react-responsive-masonry";

interface HomePageProps {
  user?: User | null;
}

export default function HomePage({ user }: HomePageProps) {
  // Force rebuild - hero section removed
  console.log("HomePage component loaded - hero section removed");
  const [value, setValue] = useState("");
  const [selectedImage, setSelectedImage] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  
  // For SSR compatibility
  useEffect(() => {
    setMounted(true);
  }, []);
  
  useEffect(() => {
    // If user is provided via props, use it
    if (user) {
      console.log("[HomePage] User provided from props:", user);
      setCurrentUserId(user.id || '');
    } else {
      // Otherwise fetch from client-side
      const fetchUser = async () => {
        const supabase = createSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        console.log("[HomePage] Current user from client:", user);
        setCurrentUserId(user?.id || '');
      };
      
      fetchUser();
    }
  }, [user]);
  
  const { isLoading, data, hasNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: ["images", value],
    queryFn: ({ pageParam = 1 }) => fetchPublicImages(pageParam as number, value),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage || lastPage.length === 0) return undefined; // Halt if the last page was empty or undefined
      const nextPage = allPages.length + 1;
      return nextPage;
    },
  });

  const flattenedData = useMemo(() => {
    return data?.pages.flatMap((page) => page) || [];
  }, [data]);
  
  const handleImageClick = (image: any) => {
    setSelectedImage(image);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  // Animation variants for staggered animations
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };
  
  const item = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1 }
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black relative">
      {/* Subtle gradient overlays */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-0 right-0 w-full h-[70vh] bg-gradient-to-bl from-indigo-500/10 via-purple-500/5 to-transparent blur-3xl opacity-30"></div>
        <div className="absolute bottom-0 left-0 w-full h-[50vh] bg-gradient-to-tr from-violet-600/5 via-fuchsia-700/5 to-transparent blur-3xl opacity-20"></div>
      </div>
      
      <div className="container mx-auto px-4 py-12 relative z-10">
        <div className="max-w-6xl mx-auto">
          <div className="space-y-10">
            {/* Search Section */}
            <motion.div 
              className="max-w-2xl mx-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <SearchBar value={value} setValue={setValue} />
            </motion.div>

            {/* Gallery Section with masonry layout */}
            <motion.div 
              className="mt-16"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              {isLoading ? (
                <div className="flex justify-center items-center min-h-[300px]">
                  <div className="relative w-16 h-16">
                    <div className="absolute inset-0 rounded-full border-t-2 border-indigo-500 animate-spin"></div>
                    <div className="absolute inset-2 rounded-full border-t-2 border-pink-500 animate-spin-slow"></div>
                  </div>
                </div>
              ) : flattenedData.length > 0 ? (
                <motion.div
                  variants={container}
                  initial="hidden"
                  animate="show"
                >
                  <ResponsiveMasonry
                    columnsCountBreakPoints={{ 350: 1, 640: 2, 768: 3, 1024: 4 }}
                  >
                    <Masonry gutter="24px">
                      {flattenedData.map((image, index) => (
                        <motion.div
                          key={image.id}
                          variants={item}
                          className="mb-0 group relative overflow-hidden rounded-xl bg-gradient-to-b from-zinc-800/80 to-zinc-900/90 backdrop-blur-sm border border-zinc-800/50 hover:border-zinc-700/80 transition-all duration-300 shadow-lg hover:shadow-2xl cursor-pointer"
                          onClick={() => handleImageClick(image)}
                          whileHover={{ y: -5 }}
                        >
                          <div className="overflow-hidden">
                            {image.image_data && image.image_data.length > 0 ? (
                              <img
                                src={image.image_data[0].image_url}
                                alt={image.positive_prompt || "AI generated image"}
                                className="object-cover w-full h-full transition-transform duration-500 ease-out group-hover:scale-110"
                                onError={(e) => {
                                  console.error("Image load error:", e);
                                  // Fall back to a placeholder if the image fails to load
                                  e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23333'/%3E%3Ctext x='50' y='50' font-family='Arial' font-size='12' text-anchor='middle' fill='white' dominant-baseline='middle'%3EImage Error%3C/text%3E%3C/svg%3E";
                                }}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-zinc-800/50 backdrop-blur-sm">
                                <p className="text-zinc-400">Image not available</p>
                              </div>
                            )}
                          </div>
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-5">
                            <p className="text-white text-sm font-medium line-clamp-3 mb-3">
                              {image.positive_prompt}
                            </p>
                            {image.image_data && image.image_data.length > 1 && (
                              <div className="bg-black/60 text-white text-xs px-2 py-1 rounded-full absolute top-3 right-3 backdrop-blur-sm border border-white/10">
                                +{image.image_data.length - 1} more
                              </div>
                            )}
                            <div className="flex justify-between items-center">
                              <span className="text-xs text-zinc-300 font-medium">
                                {new Date(image.created_at).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}
                              </span>
                              <div className="flex gap-2">
                                <button className="p-2 rounded-full bg-white/10 text-white hover:bg-indigo-500 transition-colors backdrop-blur-sm">
                                  <Heart className="w-4 h-4" />
                                </button>
                                <button className="p-2 rounded-full bg-white/10 text-white hover:bg-indigo-500 transition-colors backdrop-blur-sm">
                                  <Download className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </Masonry>
                  </ResponsiveMasonry>

                  {/* Load More Button */}
                  {hasNextPage && (
                    <div className="flex justify-center mt-16">
                      <Button
                        onClick={() => fetchNextPage()}
                        variant="outline"
                        className="px-8 py-6 rounded-full bg-zinc-900/50 border border-zinc-800/50 hover:bg-zinc-800/50 hover:border-zinc-700 text-white shadow-xl shadow-purple-950/5 transition-all hover:scale-105"
                      >
                        Load More
                      </Button>
                    </div>
                  )}
                </motion.div>
              ) : (
                <div className="text-center py-20">
                  <div className="relative">
                    <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full blur-md opacity-25"></div>
                    <div className="relative inline-flex items-center justify-center w-24 h-24 rounded-full bg-zinc-900/80 backdrop-blur-sm mb-6">
                      <Search className="w-10 h-10 text-zinc-400" />
                    </div>
                  </div>
                  <h3 className="text-2xl font-semibold text-white mb-3">No images found</h3>
                  <p className="text-zinc-400 max-w-md mx-auto">
                    {value
                      ? `No images matching "${value}" were found. Try a different search term.`
                      : "There are no images to display yet. Try generating some!"}
                  </p>
                  <Link 
                    href="/generate" 
                    className="mt-8 inline-flex items-center px-6 py-3 rounded-full bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white font-medium hover:from-indigo-700 hover:via-purple-700 hover:to-pink-700 transition-all shadow-lg"
                  >
                    <ImageIcon className="w-5 h-5 mr-2" />
                    Generate Images
                  </Link>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </div>
      
      {/* Image Detail Modal */}
      <ImageDetailModal 
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        image={selectedImage}
        currentUserId={currentUserId}
      />
    </div>
  );
}
