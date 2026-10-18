// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid

export type DurableVideoMode = "text" | "audio" | "video";

const resolutions = [
  { shape: "Landscape", size: "768x448", motionSize: "768x448" },
  { shape: "Landscape", size: "960x544", motionSize: "960x512" },
  { shape: "Portrait", size: "448x768", motionSize: "448x768" },
  { shape: "Portrait", size: "544x960", motionSize: "512x960" },
  { shape: "Square", size: "512x512", motionSize: "512x512" },
  { shape: "Square", size: "704x704", motionSize: "704x704" },
] as const;

export function durableVideoResolutions(mode: DurableVideoMode) {
  return resolutions.map(({ shape, size, motionSize }) => ({
    shape,
    size: mode === "video" ? motionSize : size,
  }));
}

/** Keep shape and size tier when switching source alignment requirements. */
export function durableVideoSizeForMode(size: string, mode: DurableVideoMode): string {
  const preset = resolutions.find((item) => item.size === size || item.motionSize === size);
  if (!preset) return size;
  return mode === "video" ? preset.motionSize : preset.size;
}
