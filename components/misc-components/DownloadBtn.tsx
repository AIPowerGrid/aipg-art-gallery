"use client";

import { useState } from "react";
import { Button } from "../ui/button";
import { DownloadCloudIcon } from "lucide-react";
import { saveAs } from "file-saver";
import Loading from "./Loading";

function DownloadBtnComponent({ photo }: any) {
  const [downloading, setIsDownloading] = useState(false);
  
  // Helper function to check URL type
  const getImageType = (url: string) => {
    if (!url) return 'unknown';
    if (url.startsWith('data:image')) return 'base64';
    if (url.includes('cloudflarestorage.com')) return 'cloudflare';
    if (url.startsWith('http')) return 'external';
    return 'unknown';
  };
  
  async function downloadImage(image_url: string, imageName: string) {
    try {
      setIsDownloading(true);
      
      const imageType = getImageType(image_url);
      
      if (imageType === 'base64') {
        // For base64 images, decode directly
        const base64Data = image_url.split(',')[1];
        if (base64Data) {
          const byteCharacters = atob(base64Data);
          const byteArrays = [];
          
          for (let offset = 0; offset < byteCharacters.length; offset += 512) {
            const slice = byteCharacters.slice(offset, offset + 512);
            
            const byteNumbers = new Array(slice.length);
            for (let i = 0; i < slice.length; i++) {
              byteNumbers[i] = slice.charCodeAt(i);
            }
            
            const byteArray = new Uint8Array(byteNumbers);
            byteArrays.push(byteArray);
          }
          
          const blob = new Blob(byteArrays, {type: 'image/png'});
          saveAs(blob, `${imageName}.png`);
        } else {
          console.error("Invalid base64 data");
        }
      } else {
        // For other URLs (cloudflare, external), fetch the image
        const response = await fetch(image_url);
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
        }
        const blob = await response.blob();
        saveAs(blob, `${imageName}.jpg`);
      }
    } catch (err) {
      console.error("Error downloading image:", err);
      alert("Failed to download image. Please try again later.");
    } finally {
      setIsDownloading(false);
    }
  }
  
  // Check if image URL exists
  if (!photo || !photo.image_url) {
    return null;
  }
  
  return (
    <Button
      variant="outline"
      className="bg-black/80 bottom-5 rounded-full hover:bg-black/50 right-3 absolute p-2 border"
      onClick={() => downloadImage(photo.image_url, photo.id)}
    >
      {" "}
      {downloading ? <Loading /> : <DownloadCloudIcon className="w-6 h-6" />}
    </Button>
  );
}
export default DownloadBtnComponent;
