import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  try {
    // Fetch recent gallery images
    const galleryUrl = process.env.NEXT_PUBLIC_GALLERY_API || 'http://localhost:4000/api';
    let images: string[] = [];
    
    try {
      // Try to fetch from gallery API
      const res = await fetch(`${galleryUrl}/gallery?limit=6`, {
        next: { revalidate: 3600 } // Cache for 1 hour
      });
      if (res.ok) {
        const data = await res.json();
        images = data.items
          ?.filter((item: any) => item.mediaUrls?.[0])
          ?.slice(0, 6)
          ?.map((item: any) => item.mediaUrls[0]) || [];
      }
    } catch {
      // Use fallback images if API fails
    }

    // Fallback to placeholder if no images
    if (images.length === 0) {
      images = [
        'https://images.aipg.art/1e9d95cb-6314-423c-8ef5-81a4b3c64242.webp',
        'https://images.aipg.art/1c96069a-249b-473c-9417-f8bb80d400d4.webp',
        'https://images.aipg.art/58854300-1af1-4b34-81ce-9d485dde1900.webp',
      ];
    }

    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#000',
            position: 'relative',
          }}
        >
          {/* Image Grid */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              width: '100%',
              height: '100%',
              position: 'absolute',
              top: 0,
              left: 0,
            }}
          >
            {images.slice(0, 6).map((url, i) => (
              <div
                key={i}
                style={{
                  width: '33.33%',
                  height: '50%',
                  display: 'flex',
                  overflow: 'hidden',
                }}
              >
                <img
                  src={url}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
              </div>
            ))}
          </div>

          {/* Gradient Overlay */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '50%',
              background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.7) 50%, transparent 100%)',
              display: 'flex',
            }}
          />

          {/* Logo and Title */}
          <div
            style={{
              position: 'absolute',
              bottom: 40,
              left: 60,
              display: 'flex',
              alignItems: 'center',
              gap: 24,
            }}
          >
            <img
              src="https://aipg.art/aipg-logo.png"
              width={80}
              height={80}
              style={{ borderRadius: 12 }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div
                style={{
                  fontSize: 52,
                  fontWeight: 700,
                  color: '#fff',
                  letterSpacing: '-1px',
                }}
              >
                AI POWER GRID
              </div>
              <div
                style={{
                  fontSize: 28,
                  color: 'rgba(255,255,255,0.7)',
                }}
              >
                Community-Powered AI Art Gallery
              </div>
            </div>
          </div>

          {/* Badge */}
          <div
            style={{
              position: 'absolute',
              top: 30,
              right: 40,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 20px',
              background: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
              borderRadius: 50,
              fontSize: 20,
              fontWeight: 600,
              color: '#000',
            }}
          >
            🎨 Free AI Art Generation
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (e) {
    console.error('OG Image generation failed:', e);
    return new Response('Failed to generate image', { status: 500 });
  }
}
