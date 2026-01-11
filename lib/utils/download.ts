export function downloadMedia(
  mediaSrc: string,
  filename: string,
  fallbackToOpen = true
): void {
  if (!mediaSrc) return;

  try {
    if (mediaSrc.startsWith("data:")) {
      const link = document.createElement("a");
      link.href = mediaSrc;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    fetch(mediaSrc)
      .then((response) => response.blob())
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      })
      .catch((err) => {
        console.error("Download failed:", err);
        if (fallbackToOpen) {
          window.open(mediaSrc, "_blank");
        }
      });
  } catch (err) {
    console.error("Download failed:", err);
    if (fallbackToOpen) {
      window.open(mediaSrc, "_blank");
    }
  }
}

export function getMediaFilename(
  jobId: string,
  generationId?: string,
  isVideo = false
): string {
  const extension = isVideo ? "mp4" : "png";
  const id = generationId ? `${jobId}_${generationId}` : jobId;
  return `${id}.${extension}`;
}
