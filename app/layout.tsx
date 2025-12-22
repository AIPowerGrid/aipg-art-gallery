import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { Providers } from "@/components/providers";
import { NavWallet } from "@/components/nav-wallet";

const title = "AIPG Art Gallery";
const description =
  "Generate cinematic images and videos with Flux and WAN directly from your browser.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    url: "https://art.aipowergrid.io",
    siteName: "AIPG Art Gallery",
    images: [
      {
        url: "https://art.aipowergrid.io/og-card.png",
        width: 1200,
        height: 630,
        alt: "AIPG Art Gallery preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-black text-white antialiased">
        <Providers>
          <div className="fixed inset-0 -z-10 bg-aipg-grid">
            <div className="absolute inset-0 bg-gradient-to-b from-black via-black/80 to-black" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,107,53,0.15),_transparent_60%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(255,215,0,0.08),_transparent_60%)]" />
          </div>
          <div className="min-h-screen flex flex-col">
            <nav className="border-b border-white/10 px-4 md:px-10 py-4">
              <div className="flex items-center justify-between">
                <Link href="/" className="text-xl font-semibold text-gradient">
                  AIPG Art Gallery
                </Link>
                <div className="flex items-center gap-6">
                  <Link
                    href="/"
                    className="text-white/70 hover:text-white transition"
                  >
                    Gallery
                  </Link>
                  <Link
                    href="/create"
                    className="text-white/70 hover:text-white transition"
                  >
                    Create
                  </Link>
                  <Link
                    href="/profile"
                    className="text-white/70 hover:text-white transition"
                  >
                    My Creations
                  </Link>
                  <NavWallet />
                </div>
              </div>
            </nav>
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}

