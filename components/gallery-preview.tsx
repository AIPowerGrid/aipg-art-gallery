"use client";

import { useEffect, useState } from "react";
import { fetchGallery, type GalleryItem } from "@/lib/api";

/**
 * A quiet, living glimpse of the real gallery for marketing surfaces: two
 * columns of actual public images drifting slowly in opposite directions,
 * edge-masked. Renders nothing until images load, so it never shows a void.
 */
export function GalleryPreview() {
  const [images, setImages] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    fetchGallery("image", 18, 0)
      .then((res) => {
        if (!alive) return;
        const urls = (res.items ?? [])
          .map((it: GalleryItem) => it.mediaUrls?.[0])
          .filter((u): u is string => Boolean(u));
        setImages(urls);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (images.length < 6) return null;

  const colA = images.filter((_, i) => i % 2 === 0);
  const colB = images.filter((_, i) => i % 2 === 1);

  return (
    <div
      className="relative h-[520px] overflow-hidden rounded-2xl border border-border"
      style={{
        WebkitMaskImage:
          "linear-gradient(to bottom, transparent, black 12%, black 88%, transparent)",
        maskImage:
          "linear-gradient(to bottom, transparent, black 12%, black 88%, transparent)",
      }}
      aria-hidden
    >
      <div className="grid grid-cols-2 gap-3 p-3">
        <MarqueeColumn images={colA} direction="up" />
        <MarqueeColumn images={colB} direction="down" />
      </div>
      {/* Warm ambient light behind the collage */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_0%,hsl(var(--primary)/0.10),transparent_70%)]" />
    </div>
  );
}

function MarqueeColumn({
  images,
  direction,
}: {
  images: string[];
  direction: "up" | "down";
}) {
  // Duplicate the list so the vertical loop is seamless.
  const loop = [...images, ...images];
  return (
    <div
      className="flex flex-col gap-3"
      style={{
        animation: `${direction === "up" ? "marquee-up" : "marquee-down"} 46s linear infinite`,
      }}
    >
      {loop.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${src}-${i}`}
          src={src}
          alt=""
          loading="lazy"
          className="w-full rounded-xl border border-border/60 object-cover"
        />
      ))}
      <style jsx>{`
        @keyframes marquee-up {
          from { transform: translateY(0); }
          to { transform: translateY(-50%); }
        }
        @keyframes marquee-down {
          from { transform: translateY(-50%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
