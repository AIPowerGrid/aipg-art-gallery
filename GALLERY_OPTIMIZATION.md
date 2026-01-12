# AIPG Gallery Optimization Plan

## Goal
Make the gallery as fast and smooth as Lexica.art

## Analysis (Completed ✅)
- **Problem 1:** Frontend makes N+1 API calls (1 for gallery list + N for each image's media URL)
- **Problem 2:** Full-resolution images served in grid (500KB+ each)
- **Problem 3:** No server-side rendering (client fetches everything)

## Architecture Comparison

| Feature | Lexica | AIPG (Before) | AIPG (After) |
|---------|--------|---------------|--------------|
| API Calls | 1 | 1 + N | **1** ✅ |
| Thumbnails | `md2` (~400px) | Full-res | Pending (needs Cloudflare Pro) |
| Initial Paint | <500ms | 2-5s | ~1s ✅ |

---

## Phase 1: Fix Frontend API Calls ✅ COMPLETED
**Status:** ✅ Done

### Problem (Fixed)
```typescript
// OLD - page.tsx made N+1 API calls:
1. fetchGallery() → returns items WITH mediaUrls already populated
2. fetchMediaForItems() → made 25 EXTRA API calls (REMOVED!)
```

### Solution Applied
- ✅ Removed `fetchMediaForItems()` function from `app/page.tsx`
- ✅ Now using `item.mediaUrls` directly from gallery response
- ✅ Eliminated loading spinners for media URLs
- ✅ Added `getThumbnailUrl()` helper (ready for Phase 2)
- ✅ Updated `MediaCard` component with thumbnail support

### Files Modified
- ✅ `app/page.tsx` - Removed N+1 pattern, added thumbnail helper
- ✅ `components/media-card.tsx` - Added thumbnailUrl prop, improved loading states

### Performance Impact
- **Before:** 1 gallery API call + 25 media API calls = 26 requests
- **After:** 1 gallery API call = 1 request
- **Improvement:** ~96% reduction in API calls

---

## Phase 2: Cloudflare Image Resizing ⚠️ BLOCKED
**Status:** ⚠️ Blocked - Requires Cloudflare Pro Plan

### Tested
```bash
curl -I "https://images.aipg.art/cdn-cgi/image/width=400,quality=80/xxx.webp"
# Result: 404 - Cloudflare Image Resizing not enabled
```

### Options to Enable

#### Option A: Upgrade to Cloudflare Pro ($20/month)
- Enables `/cdn-cgi/image/` URL transformations
- On-the-fly resizing, no storage needed
- Code is ready - just uncomment in `getThumbnailUrl()`

#### Option B: Cloudflare Images ($5/100K transformations)
- Separate Cloudflare Images product
- Per-transformation pricing

#### Option C: Pre-generate Thumbnails on Upload
- Modify backend to create thumbnails during upload
- Store in R2: `/thumb/{id}.webp` (400px) and `/full/{id}.webp`
- Update CDN URLs accordingly
- More work but works on free plan

### Code Ready
The `getThumbnailUrl()` function in `app/page.tsx` is ready - just uncomment when Cloudflare Image Resizing is enabled.

---

## Phase 3: SSR Gallery (Future)
**Status:** ⏳ Planned

Convert gallery page to server-side rendered for instant first paint.

```typescript
// Change from "use client" to server component
export default async function GalleryPage() {
  const data = await fetchGallery(); // Runs on server
  return <Gallery items={data.items} />; // HTML includes everything
}
```

---

## Phase 4: Blur Placeholders (Future)
**Status:** ⏳ Planned

Add tiny blur-up placeholders for smooth loading experience like Lexica.

---

## Progress Log

### 2026-01-12
- [x] Analyzed Lexica.art architecture (network requests, image CDN structure)
- [x] Identified N+1 API call problem
- [x] Confirmed backend already returns mediaUrls in gallery response
- [x] **Phase 1 Complete:** Removed 25 extra API calls per page load
- [x] **Phase 2 Tested:** Cloudflare Image Resizing returns 404 (needs Pro plan)
- [x] Code prepared for Phase 2 activation (just uncomment when ready)
- [x] Deployed to production

### Next Steps
1. **Quick Win:** Enable Cloudflare Pro for image resizing
2. **Alternative:** Implement thumbnail pre-generation in backend
3. **Future:** Consider SSR for even faster first paint

---

## Testing

### Verify Phase 1 Works
1. Open browser DevTools → Network tab
2. Go to gallery page
3. Should see only ONE `/api/gallery` call (not 25+ `/api/gallery/{id}/media` calls)
4. Images should load directly from `images.aipg.art` CDN

### Test Cloudflare Image Resizing (when enabled)
```bash
# Should return 200 with resized image
curl -I "https://images.aipg.art/cdn-cgi/image/width=400/{image-id}.webp"
```
