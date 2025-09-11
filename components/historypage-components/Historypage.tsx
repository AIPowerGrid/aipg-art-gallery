"use client";
import React, { useCallback, useState } from "react";
import HistorySearch from "./search-bar";
import { useInfiniteQuery } from "@tanstack/react-query";
import ImageCard from "../misc-components/ImageCard";
import { motion } from "framer-motion";
import { User } from "@supabase/supabase-js";
import { fetchUserGeneratedImages } from "@/app/_api/getUserGeneratedImages";
import ImageDetailModal from "../homepage-components/ImageDetailModal";

export default function HistoryPage({ user }: { user: User | null }) {
  const [value, setValue] = useState("");
  const [selectedImage, setSelectedImage] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    status,
    isFetching,
  } = useInfiniteQuery({
    queryKey: ["usergeneratedImages", value, user?.id],
    queryFn: ({ pageParam = 1 }) =>
      fetchUserGeneratedImages(user?.id, Number(pageParam), value),
    getNextPageParam: (lastPage, allPages) => {
      const nextPage = lastPage?.length ? allPages.length + 1 : undefined;
      return nextPage;
    },
    initialPageParam: 1,
    refetchOnWindowFocus: false,
  });

  const handleImageClick = (image: any) => {
    setSelectedImage(image);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage]
  );

  React.useEffect(() => {
    const option = {
      root: null,
      rootMargin: "0px",
      threshold: 0.5,
    };
    const observer = new IntersectionObserver(handleObserver, option);
    if (loadMoreRef.current) observer.observe(loadMoreRef.current);
    return () => {
      if (loadMoreRef.current) observer.unobserve(loadMoreRef.current);
    };
  }, [handleObserver]);

  const loadMoreRef = React.useRef(null);

  if (!user) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center">
        <h1 className="text-4xl font-bold text-white">Please Log in to view your history</h1>
      </div>
    );
  }

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-black via-zinc-950 to-black">
      <div className="container mx-auto px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-12 text-center"
        >
          <h1 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
            Your Image History
          </h1>
          <p className="mt-4 text-zinc-400 max-w-2xl mx-auto">
            View, download, and manage all your previously generated images
          </p>
        </motion.div>

        <div className="mb-8">
          <HistorySearch value={value} onChange={(e) => setValue(e.target.value)} setValue={setValue} />
        </div>

        {status === "pending" ? (
          <div className="flex justify-center items-center min-h-[400px]">
            <div className="h-12 w-12 rounded-full border-4 border-t-indigo-500 border-r-transparent border-b-indigo-700 border-l-transparent animate-spin"></div>
          </div>
        ) : status === "error" ? (
          <div className="text-center py-12">
            <p className="text-red-500">Error fetching images</p>
          </div>
        ) : (
          <>
            {!data || data?.pages.flatMap((page) => page).length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center min-h-[400px] text-center"
              >
                <div className="mb-4 p-4 rounded-full bg-zinc-900/60 backdrop-blur-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-white">No images found</h3>
                <p className="mt-2 text-zinc-400 max-w-md">
                  {value 
                    ? `No images matching "${value}" were found in your history` 
                    : "You haven't generated any images yet. Try creating some amazing images first!"}
                </p>
              </motion.div>
            ) : (
              <motion.div
                variants={container}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6"
              >
                {data?.pages.flatMap((page) =>
                  page.map((image) => (
                    <motion.div
                      key={image.id}
                      variants={item}
                      className="backdrop-blur-sm bg-zinc-900/40 rounded-xl overflow-hidden shadow-lg border border-zinc-800/50 transition-all hover:shadow-xl hover:shadow-indigo-900/20 hover:border-indigo-800/30 cursor-pointer"
                      onClick={() => handleImageClick(image)}
                    >
                      <ImageCard 
                        item={image}
                        user={user?.id}
                        forModal={true}
                      />
                    </motion.div>
                  ))
                )}
              </motion.div>
            )}

            <div ref={loadMoreRef} className="py-8 flex justify-center">
              {isFetchingNextPage && hasNextPage && (
                <div className="flex flex-col items-center gap-2">
                  <div className="h-8 w-8 rounded-full border-2 border-t-indigo-500 border-r-transparent border-b-indigo-700 border-l-transparent animate-spin"></div>
                  <p className="text-sm text-zinc-400">Loading more images...</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Image Detail Modal */}
      {selectedImage && (
        <ImageDetailModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          image={selectedImage}
          isUserOwned={true}
          currentUserId={user?.id}
        />
      )}
    </div>
  );
}
