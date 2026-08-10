"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { Header } from "@/components/header";
import { GoogleSignInButton } from "@/components/google-one-tap";
import { GalleryPreview } from "@/components/gallery-preview";
import { useAuthStore } from "@/lib/stores/auth-store";

export const dynamic = "force-dynamic";

const MODELS = [
  { name: "Krea 2 Turbo", blurb: "Fast, high-quality image generation — a great all-round default for realistic and artistic prompts.", live: true },
  { name: "z-image-turbo", blurb: "Ultra-fast image generation tuned for speed and clean, coherent results.", live: true },
  { name: "FLUX.2 Klein 4B FP8", blurb: "The open FLUX.2 Klein model — strong on fine detail and prompt accuracy.", live: true },
  { name: "LTX-2.3 Video", blurb: "Text-to-video generation — turn a prompt into a short AI-generated clip.", live: true },
  { name: "More models & LoRAs", blurb: "New image and video models plus custom LoRAs are being added to the grid.", live: false },
];

const BENEFITS = [
  { title: "Unlimited generations", body: "Create as much as you want while AIPG is in preview." },
  { title: "Save your work", body: "Every creation is stored in your profile." },
  { title: "Video generation", body: "Turn prompts into short clips with LTX-2.3 video." },
];

function triggerWallet() {
  document
    .querySelector<HTMLButtonElement>("button[data-wallet-button]")
    ?.click();
}

export default function JoinPage() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const { isAuthenticated, authMethod } = useAuthStore();
  const hasSession = isAuthenticated && (authMethod === "google" || isConnected);

  useEffect(() => {
    if (hasSession) router.replace("/create");
  }, [hasSession, router]);

  if (hasSession) {
    return (
      <main className="flex-1 w-full min-h-screen">
        <Header />
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 w-full min-h-screen">
      <Header />

      <div className="mx-auto max-w-6xl px-6 py-14 md:px-10">
        {/* Hero: copy + weighted sign-in on the left, living gallery on the right */}
        <section className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="animate-rise-in">
            <span className="eyebrow">AI Power Grid</span>
            <h1 className="mt-3 font-display text-4xl font-bold leading-[1.05] tracking-tight text-foreground md:text-[3.25rem]">
              Create on the{" "}
              <span className="text-gradient">open AI grid</span>
            </h1>
            <p className="mt-4 max-w-lg text-lg text-muted-foreground">
              Generate images and video on community hardware. Sign in to save
              your creations, track credits and unlock every model.
            </p>

            {/* Weighted sign-in: Google primary, wallet secondary, guest tertiary */}
            <div className="mt-8 max-w-sm space-y-3">
              <GoogleSignInButton />
              <button onClick={triggerWallet} className="btn btn-outline w-full">
                Connect a wallet
              </button>
              <div className="pt-1 text-center">
                <Link
                  href="/create"
                  className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                >
                  or try the studio as a guest →
                </Link>
              </div>
            </div>
          </div>

          <div className="hidden lg:block">
            <GalleryPreview />
          </div>
        </section>

        {/* Models */}
        <section className="mt-20">
          <div className="mb-5 flex items-end justify-between">
            <h2 className="font-display text-xl font-semibold text-foreground">
              Models on the grid
            </h2>
            <span className="text-sm text-muted-foreground">Free during preview</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {MODELS.map((m) => (
              <div
                key={m.name}
                className="surface-raised p-5 transition-colors hover:border-edge"
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="font-medium text-foreground">{m.name}</h3>
                  <span className={`badge ${m.live ? "badge-success" : "badge-muted"}`}>
                    {m.live ? "Available now" : "Coming soon"}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{m.blurb}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Benefits */}
        <section className="mt-14 rounded-2xl border border-border bg-card/60 p-8">
          <div className="grid gap-8 md:grid-cols-3">
            {BENEFITS.map((b) => (
              <div key={b.title}>
                <h3 className="mb-1.5 font-medium text-foreground">{b.title}</h3>
                <p className="text-sm text-muted-foreground">{b.body}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
