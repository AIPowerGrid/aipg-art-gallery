/**
 * Generate a thumbnail URL from a full-size image URL
 * Uses Cloudflare Image Resizing when available
 */
export function getThumbnailUrl(url: string, width: number = 400): string {
  if (!url) return url;
  
  // If it's a data URL, return as-is
  if (url.startsWith('data:')) {
    return url;
  }
  
  // If it's already a Cloudflare thumbnail, return as-is
  if (url.includes('/cdn-cgi/image/')) {
    return url;
  }
  
  // For R2/Cloudflare URLs, use Cloudflare Image Resizing
  if (url.includes('r2.cloudflarestorage.com') || url.includes('aipg')) {
    try {
      const urlObj = new URL(url);
      // Use Cloudflare Image Resizing format
      return `${urlObj.origin}/cdn-cgi/image/width=${width},quality=80,format=auto${urlObj.pathname}`;
    } catch {
      return url;
    }
  }
  
  // For other URLs, return as-is
  return url;
}
