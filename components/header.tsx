"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LogIn } from "lucide-react";
import { ActiveJobsIndicator } from "./active-jobs-indicator";
import { AccountControl } from "./account-control";
import { useAuthStore } from "@/lib/stores/auth-store";

export function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);
  
  // Use reactive auth state from store. The session cookie is the source of truth,
  // so we do NOT gate on the live wallet connection (isConnected) — otherwise a
  // reload flashes "Sign in" until wagmi finishes reconnecting.
  const { isAuthenticated } = useAuthStore();
  const authenticated = isAuthenticated;
  
  const isActive = (path: string) => {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  };

  const navItems = [
    { href: "/", label: "Gallery", active: isActive("/") },
    { href: "/create", label: "Studio", active: pathname === "/create" },
    { href: "/create/director", label: "Director", active: isActive("/create/director") },
    ...(authenticated ? [
      { href: "/profile", label: "My Creations", active: isActive("/profile") },
      { href: "/favorites", label: "Favorites", active: isActive("/favorites") },
    ] : []),
  ];
  
  return (
    <header className="sticky top-0 z-40 bg-black/90 backdrop-blur-md border-b border-white/10">
      <div className="w-full px-4 md:px-7 py-3 md:py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition shrink-0">
            <Image 
              src="/aipg-logo.png" 
              alt="AIPG" 
              width={32} 
              height={32}
              className="w-8 h-8 md:w-10 md:h-10"
            />
            <Image
              src="/aipg-weblogo.png"
              alt="AI Power Grid"
              width={70}
              height={16}
              className="h-4 w-auto hidden sm:block"
              style={{ width: 'auto' }}
            />
          </Link>

          {/* Desktop Nav - centered */}
          <nav className="hidden xl:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
            {navItems.map((item) => (
          <Link
                key={item.href}
                href={item.href}
                className={`px-5 py-2 rounded-full text-base font-medium transition-all ${
                  item.active 
                    ? "text-white bg-[#1a1a1a] border border-[#333]" 
                    : "text-white/70 hover:text-white hover:bg-white/5"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Desktop: Jobs + Wallet */}
          <div className="hidden xl:flex items-center gap-3 shrink-0">
            <ActiveJobsIndicator />
            {!authenticated ? (
              <Link href="/auth/login" className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500">
                <LogIn className="h-4 w-4" aria-hidden="true" />
                Sign in
              </Link>
            ) : (
              <AccountControl />
            )}
          </div>

          {/* Mobile: Hamburger Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            disabled={!hydrated}
            className="xl:hidden flex flex-col justify-center items-center w-10 h-10 rounded-lg hover:bg-white/10 transition-colors disabled:cursor-wait disabled:opacity-50"
            aria-label="Toggle menu"
            aria-expanded={mobileMenuOpen}
          >
            <span className={`block w-5 h-0.5 bg-white transition-all duration-300 ${mobileMenuOpen ? 'rotate-45 translate-y-1' : ''}`} />
            <span className={`block w-5 h-0.5 bg-white mt-1 transition-all duration-300 ${mobileMenuOpen ? 'opacity-0' : ''}`} />
            <span className={`block w-5 h-0.5 bg-white mt-1 transition-all duration-300 ${mobileMenuOpen ? '-rotate-45 -translate-y-1.5' : ''}`} />
          </button>
        </div>

        {/* Mobile navigation overlays page content and scrolls independently. */}
        {mobileMenuOpen && (
          <div className="absolute inset-x-0 top-full z-50 max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-white/10 bg-black/95 px-4 pb-4 shadow-2xl xl:hidden">
            <nav className="flex flex-col gap-1 pt-3">
            {navItems.map((item) => (
          <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`px-4 py-3 rounded-full text-base font-medium transition-all ${
                  item.active 
                    ? "text-white bg-[#1a1a1a] border border-[#333]" 
                    : "text-white/70 hover:text-white hover:bg-white/5"
                }`}
              >
                {item.label}
          </Link>
            ))}
            <div className="pt-2 mt-2 border-t border-white/10">
              {!authenticated && (
                <Link
                  href="/auth/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-3 text-white/80 hover:text-white"
                >
                  <LogIn className="h-4 w-4" aria-hidden="true" />
                  Sign in
                </Link>
              )}
              {authenticated && (
                <div className="px-2">
                  <AccountControl mobile />
                </div>
              )}
            </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
