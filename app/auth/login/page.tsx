"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthPanel } from "@/components/auth-panel";
import { useAuthStore } from "@/lib/stores/auth-store";

// Disable SSR for this page since it uses wagmi hooks
export const dynamic = 'force-dynamic';

// Wrapper component to ensure we only use wagmi after mounting
export default function LoginPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <main className="flex-1 w-full px-4 py-16 flex items-center justify-center">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card/80 p-8">
          <div className="flex items-center justify-center h-40">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
          </div>
        </div>
      </main>
    );
  }

  return <LoginPageClient />;
}

function LoginPageClient() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();

  // Both wallet SIWE and Google issue the same server session.
  useEffect(() => {
    if (isAuthenticated) {
      router.push("/create");
    }
  }, [isAuthenticated, router]);

  return (
    <main className="relative flex-1 w-full overflow-hidden px-4 py-16 flex items-center justify-center">
      {/* Same atmosphere as Join, so the two surfaces feel like one product. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-1/4 h-[420px] w-[620px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,hsl(var(--primary)/0.12),transparent_70%)] blur-2xl" />
      </div>

      <div className="w-full max-w-md space-y-6 animate-rise-in">
        <AuthPanel
          title="Sign in"
          subtitle="Continue with Google or verify a Base wallet to save your creations."
          walletMode="inline"
          onSuccess={() => router.push("/profile")}
          onError={(error) => console.error("Social auth error:", error)}
        />

        <div className="text-center">
          <Link
            href="/"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Back to gallery
          </Link>
        </div>
      </div>
    </main>
  );
}
