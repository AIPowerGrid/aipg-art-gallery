/**
 * Center-crop + scale an uploaded image to the render aspect/size, returned as
 * a JPEG data URI. The Director recipe derives output dimensions from the
 * FIRST keyframe's aspect ratio ("maintain aspect ratio" resize), so an
 * uncropped upload silently overrides the chosen resolution. Cropping client-
 * side keeps every segment (uploads AND extracted chain frames) on the exact
 * same geometry — which is also what keeps chained joins seamless.
 */
export async function cropImageToRenderSize(
  dataUri: string,
  width: number,
  height: number
): Promise<string> {
  const img = await loadImage(dataUri);
  const srcW = img.naturalWidth || width;
  const srcH = img.naturalHeight || height;

  const targetRatio = width / height;
  const srcRatio = srcW / srcH;

  let cropW = srcW;
  let cropH = srcH;
  if (srcRatio > targetRatio) {
    cropW = Math.round(srcH * targetRatio); // too wide — trim sides
  } else {
    cropH = Math.round(srcW / targetRatio); // too tall — trim top/bottom
  }
  const sx = Math.round((srcW - cropW) / 2);
  const sy = Math.round((srcH - cropH) / 2);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d canvas context');
  ctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.92);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image decode failed'));
    img.src = src;
  });
}
