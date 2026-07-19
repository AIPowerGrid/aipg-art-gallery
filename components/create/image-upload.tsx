"use client";

import { useRef } from "react";
import { toast } from "sonner";

interface ImageUploadProps {
  /** data: URI of the source image, or null. */
  value: string | null;
  onChange: (dataUri: string | null) => void;
}

const MAX_BYTES = 12 * 1024 * 1024; // 12MB — matches nginx client_max_body_size headroom

/** Source-image dropzone for img2img / img2video. Reads a file to a data URI. */
export function ImageUpload({ value, onChange }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file?: File) => {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error("Image too large (max 12MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  };

  return (
    <div className="border border-zinc-700 rounded-2xl p-5 bg-zinc-800/30">
      <div className="flex items-center gap-2 text-xs text-zinc-400 mb-3">
        <span>Source image</span>
        <span className="text-zinc-600">— optional, turns this into image-to-image</span>
      </div>
      {value ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="source" className="h-20 w-20 object-cover rounded-lg border border-zinc-700" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="px-3 py-1.5 rounded-lg text-sm border border-zinc-700 text-zinc-300 hover:border-zinc-500"
          >
            Remove
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="px-4 py-2 rounded-lg text-sm border border-dashed border-zinc-600 text-zinc-300 hover:border-zinc-400"
        >
          Upload image
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
