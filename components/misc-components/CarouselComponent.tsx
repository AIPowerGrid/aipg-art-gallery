"use client";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";

import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { AuthForm } from "@/components/auth-components/AuthForm";
import { useState, useCallback, useEffect } from "react";
import DownloadBtnComponent from "./DownloadBtn";
import { Heart } from "lucide-react";
import Image from "next/image";

const CarouselComponent = ({ images, userID, isLiked, toggleLike }: any) => {
  const [api, setApi] = useState<CarouselApi>();
  const [thumbsapi, setThumbsApi] = useState<CarouselApi>();
  const [selectedIndex, setSelectedIndex] = useState(0);

  const onThumbClick = useCallback(
    (index: number) => {
      if (!api || !thumbsapi) {
        return;
      }

      api.scrollTo(index);
    },
    [api, thumbsapi]
  );

  const onSelect = useCallback(() => {
    if (!api || !thumbsapi) {
      return;
    }

    setSelectedIndex(api.selectedScrollSnap());
    thumbsapi.scrollTo(api.selectedScrollSnap());
  }, [api, thumbsapi, setSelectedIndex]);

  useEffect(() => {
    if (!api || !thumbsapi) {
      return;
    }
    onSelect();
    api.on("select", onSelect);
    api.on("reInit", onSelect);
  }, [api]);

  // Helper function to check URL type
  const getImageType = (url: string) => {
    if (!url) return 'unknown';
    if (url.startsWith('data:image')) return 'base64';
    if (url.includes('cloudflarestorage.com')) return 'cloudflare';
    if (url.startsWith('http')) return 'external';
    return 'unknown';
  };

  const imageKitLoader = ({ src, width, quality }: any) => {
    // Skip ImageKit processing for specific URL types
    const imageType = getImageType(src);
    
    // For base64 or unknown format, return the original source
    if (imageType === 'base64' || imageType === 'unknown') {
      return src;
    }
    
    // For Cloudflare URLs, return as is
    if (imageType === 'cloudflare') {
      return src;
    }

    try {
      // For regular URLs, apply ImageKit transformation
      // Extract the image filename from the full URL
      const imageFilename = src.split("/").pop();
      if (!imageFilename) return src;

      // Define the transformation parameters
      const params = [`w-${width}`];
      if (quality) {
        params.push(`q-${quality}`);
      }
      const paramsString = params.join(",");

      // Construct the ImageKit URL
      let urlEndpoint = "https://ik.imagekit.io/tkafllsgm";
      if (urlEndpoint[urlEndpoint.length - 1] === "/") {
        urlEndpoint = urlEndpoint.substring(0, urlEndpoint.length - 1);
      }
      return `${urlEndpoint}/${imageFilename}?tr=${paramsString},f-jpg`;
    } catch (error) {
      console.error("Error in imageKitLoader:", error);
      return src; // Return original source if there's an error
    }
  };

  // Function to render the appropriate image component based on type
  const renderImage = (image: any, isThumb = false) => {
    if (!image.image_url) {
      return (
        <div className={`w-full ${isThumb ? 'h-[75px]' : 'h-[400px]'} flex items-center justify-center bg-zinc-800`}>
          <p className="text-zinc-400">Image not available</p>
        </div>
      );
    }

    const imageType = getImageType(image.image_url);
    
    if (imageType === 'base64') {
      return (
        <img
          src={image.image_url}
          className={`w-full ${isThumb ? 'h-[75px]' : 'h-auto'} object-cover`}
          alt={image.seed || 'Generated image'}
        />
      );
    } else {
      return (
        <Image
          loader={imageKitLoader}
          height={isThumb ? 75 : 400}
          width={isThumb ? 75 : 400}
          loading={isThumb ? "eager" : "lazy"}
          src={image.image_url}
          className={`w-full h-auto object-cover`}
          alt={image.seed || 'Generated image'}
          quality={isThumb ? 60 : 80}
          sizes="100vw"
          unoptimized={imageType === 'cloudflare'}
        />
      );
    }
  };

  // Wrapper for toggleLike to handle event if present or not
  const handleToggleLike = (e: React.MouseEvent | undefined) => {
    if (e) {
      e.stopPropagation();
    }
    toggleLike();
  };

  return (
    <div className="flex flex-col gap-2 max-w-[60%] ">
      <Carousel
        className="w-full mx-auto my-6 md:my-0 relative"
        setApi={setApi}
      >
        <CarouselContent>
          {images.map((image: any) => (
            <CarouselItem key={image.id}>
              <div className="p-0 bg-white relative">
                {renderImage(image)}
                <DownloadBtnComponent photo={image} />
              </div>
              <div className="absolute hover:bg-black/50 border rounded-xl p-2 items-center top-5 right-5 bg-black/80">
                {userID ? (
                  <button onClick={handleToggleLike}>
                    {isLiked ? (
                      <Heart className="w-6 h-6 fill-red-500" />
                    ) : (
                      <Heart className="w-6 h-6 text-gray-300" /> /* Dimmed heart when not liked */
                    )}
                  </button>
                ) : (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Heart className="w-6 h-6 text-gray-300 cursor-pointer " />
                    </DialogTrigger>
                    <DialogContent>
                      <AuthForm />
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="absolute top-1/2 left-3" />
        <CarouselNext className="absolute top-1/2 right-3" />
      </Carousel>

      <Carousel
        setApi={setThumbsApi}
        opts={{ dragFree: true, containScroll: "keepSnaps" }}
      >
        <CarouselContent className="-ml-1 flex flex-row items-center justify-center">
          {images.map((image: any, index: number) => (
            <div
              className={`${index === selectedIndex ? "" : "opacity-50"} pl-1`}
              key={index}
              onClick={() => onThumbClick(index)}
            >
              <div className="w-[75px] h-[75px] object-cover rounded-lg overflow-hidden">
                {renderImage(image, true)}
              </div>
            </div>
          ))}
        </CarouselContent>
      </Carousel>
    </div>
  );
};

export default CarouselComponent;
