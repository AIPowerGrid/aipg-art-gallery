"use client";

/**
 * /create/director owns assembly; /create?type=video owns clip generation.
 * The editor stays below the shared Gallery header.
 *
 * The console tree pulls in wagmi/RainbowKit, so it loads with ssr:false
 * (same rule as Providers in the root layout) — wallet libs must never touch
 * indexedDB during prerender.
 */

import dynamic from "next/dynamic";

const DirectorPageContent = dynamic(
  () => import("./director-page-content").then((m) => m.DirectorPageContent),
  {
    ssr: false,
    loading: () => (
      <main className="fixed inset-0 flex items-center justify-center bg-[#0a0a0c]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
      </main>
    ),
  }
);

export default function DirectorPage() {
  return <DirectorPageContent />;
}
