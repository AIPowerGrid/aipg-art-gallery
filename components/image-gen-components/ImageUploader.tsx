"use client";

import { useState, useRef, ChangeEvent } from 'react';
import { Button } from "@/components/ui/button";
import { Upload, X, Image as ImageIcon } from 'lucide-react';
import { Card, CardContent } from "@/components/ui/card";
import { Label } from '@/components/ui/label';
import Image from 'next/image';
import { resizeImage } from '@/utils/imageUtils';

interface ImageUploaderProps {
  onImageSelect: (base64Image: string, file: File) => void;
  onClearImage: () => void;
  previewImage: string | null;
  label: string;
  maxWidth?: number;
  maxHeight?: number;
}

const ImageUploader = ({
  onImageSelect,
  onClearImage,
  previewImage,
  label,
  maxWidth = 768,
  maxHeight = 768
}: ImageUploaderProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await processFile(files[0]);
  };

  const processFile = async (file: File) => {
    try {
      const resizedImageData = await resizeImage(file, maxWidth, maxHeight);
      const reader = new FileReader();
      
      reader.onload = (e) => {
        if (e.target?.result) {
          onImageSelect(e.target.result as string, new File(
            [resizedImageData as Blob], 
            file.name, 
            { type: file.type }
          ));
        }
      };
      
      reader.readAsDataURL(resizedImageData as Blob);
    } catch (error) {
      console.error("Error processing image:", error);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    
    const file = files[0];
    if (!file.type.startsWith('image/')) return;
    
    await processFile(file);
  };

  const triggerFileInput = () => {
    inputRef.current?.click();
  };

  return (
    <div className="w-full">
      <Label className="mb-2 block">{label}</Label>
      
      {!previewImage ? (
        <Card
          className={`border-dashed border-2 cursor-pointer transition-all ${
            isDragging ? 'border-indigo-500 bg-indigo-100/10' : 'border-zinc-600 hover:border-indigo-400'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={triggerFileInput}
        >
          <CardContent className="flex flex-col items-center justify-center py-8">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              ref={inputRef}
              onChange={handleFileChange}
            />
            <Upload className="w-10 h-10 text-zinc-400 mb-2" />
            <p className="text-zinc-300 text-sm">Drag & drop an image here, or click to select</p>
            <p className="text-zinc-500 text-xs mt-1">PNG, JPG, WEBP up to 4MB</p>
          </CardContent>
        </Card>
      ) : (
        <div className="relative">
          <div className="border border-zinc-700 rounded-lg overflow-hidden aspect-square">
            <div className="w-full h-full relative">
              <Image
                src={previewImage}
                fill
                alt="Source image"
                className="object-contain"
              />
            </div>
          </div>
          <Button
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/70 hover:bg-red-600/70"
            onClick={onClearImage}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default ImageUploader; 