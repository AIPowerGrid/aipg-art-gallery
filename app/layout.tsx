import "./globals.css";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { ErrorBoundary } from "@/components/error-boundary";
import { AppToaster } from "@/components/app-toaster";
import { ConfirmDialogHost } from "@/components/confirm-dialog";

// Workhorse UI face (now actually loaded, not just a CSS fallback name),
// paired with a display face for headlines and a mono for parameter values.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

const title = "AI Power Grid - Art Gallery";
const description =
  "Free AI art generation powered by the community. Create stunning images with FLUX, WAN and more open-source models.";

export const metadata: Metadata = {
  title,
  description,
  metadataBase: new URL("https://aipg.art"),
  openGraph: {
    title,
    description,
    url: "https://aipg.art",
    siteName: "AI Power Grid",
    images: [
      {
        url: "/og",
        width: 1200,
        height: 630,
        alt: "AI Power Grid Art Gallery",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og"],
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Get cookies from request headers for wagmi state hydration
  const headersList = await headers();
  const cookie = headersList.get("cookie") ?? undefined;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <link rel="preconnect" href="https://images.aipg.art" />
        <link rel="dns-prefetch" href="https://images.aipg.art" />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <Providers cookie={cookie}>
          {/* Restrained, quiet atmosphere: a warm ambient light near the top over
              the near-black canvas, plus a faint grid. Never neon, never busy. */}
          <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
            <div className="absolute inset-0 bg-background" />
            <div className="absolute inset-0 bg-grid-faint opacity-[0.4]" />
            <div className="absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_100%_at_50%_-10%,hsl(var(--primary)/0.10),transparent_70%)]" />
          </div>
          <div className="min-h-screen flex flex-col">
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </div>
          <AppToaster />
          <ConfirmDialogHost />
        </Providers>
      </body>
    </html>
  );
}
