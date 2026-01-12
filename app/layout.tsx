import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { Providers } from "@/components/providers";
import { NavWallet } from "@/components/nav-wallet";

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://images.aipg.art" />
        <link rel="dns-prefetch" href="https://images.aipg.art" />
      </head>
      <body className="bg-black text-white antialiased">
        <Providers>
          <div className="fixed inset-0 -z-10 bg-aipg-grid">
            <div className="absolute inset-0 bg-gradient-to-b from-black via-black/80 to-black" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_60%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(6,182,212,0.06),_transparent_60%)]" />
          </div>
          <div className="min-h-screen flex flex-col">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}

