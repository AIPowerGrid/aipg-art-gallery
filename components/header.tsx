"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { CustomConnectButton } from "./custom-connect-button";
import { ActiveJobsIndicator } from "./active-jobs-indicator";
import { GoogleAccountButton } from "./google-account-button";
import { useAuthStore } from "@/lib/stores/auth-store";

export function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Use reactive auth state from store. The session cookie is the source of truth,
  // so we do NOT gate on the live wallet connection (isConnected) — otherwise a
  // reload flashes "Sign in" until wagmi finishes reconnecting.
  const { isAuthenticated, authMethod } = useAuthStore();
  const authenticated = isAuthenticated;
  const favoritesLink = authenticated ? "/favorites" : "/join";
  const favoritesLabel = authenticated ? "Favorites" : "Join";
  
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
    ] : []),
    // Favorites now work for every login type (wallet and Google), so the link is
    // shown for all authenticated users instead of being hidden from Google users.
    { href: favoritesLink, label: favoritesLabel, active: isActive("/favorites") || isActive("/join") },
  ];
  
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="w-full px-4 md:px-7 py-3 md:py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-90 shrink-0">
            <Image
              src="/aipg-logo.png"
              alt="AIPG"
              width={32}
              height={32}
              className="w-8 h-8 md:w-9 md:h-9"
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

          {/* Desktop Nav - centered, editorial */}
          <nav className="hidden md:flex items-center gap-7 absolute left-1/2 -translate-x-1/2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                data-active={item.active}
                className="nav-link"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Desktop: Jobs + auth. One clear primary CTA when signed out. */}
          <div className="hidden md:flex items-center gap-3 shrink-0">
            <ActiveJobsIndicator />
            {!authenticated && (
              <Link href="/auth/login" className="btn btn-primary btn-sm">
                Sign in
              </Link>
            )}
            {authMethod === 'google' ? <GoogleAccountButton /> : <CustomConnectButton />}
          </div>

          {/* Mobile: Hamburger Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden flex flex-col justify-center items-center w-10 h-10 rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Toggle menu"
          >
            <span className={`block w-5 h-0.5 bg-white transition-all duration-300 ${mobileMenuOpen ? 'rotate-45 translate-y-1' : ''}`} />
            <span className={`block w-5 h-0.5 bg-white mt-1 transition-all duration-300 ${mobileMenuOpen ? 'opacity-0' : ''}`} />
            <span className={`block w-5 h-0.5 bg-white mt-1 transition-all duration-300 ${mobileMenuOpen ? '-rotate-45 -translate-y-1.5' : ''}`} />
          </button>
        </div>

        {/* Mobile Menu Dropdown */}
        <div
          className={`md:hidden transition-all duration-300 ease-in-out ${
            mobileMenuOpen ? 'max-h-[500px] opacity-100 mt-4' : 'max-h-0 opacity-0 overflow-hidden'
          }`}
        >
          <nav className="flex flex-col gap-1 pb-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`rounded-lg px-4 py-3 text-base font-medium transition-colors ${
                  item.active
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            ))}
            <div className="pt-3 mt-2 border-t border-border">
              {!authenticated && (
                <Link
                  href="/auth/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="btn btn-primary w-full mb-3"
                >
                  Sign in with Google or wallet
                </Link>
              )}
              {authMethod === 'google' ? <GoogleAccountButton /> : <CustomConnectButton />}
            </div>
        </nav>
        </div>
      </div>
    </header>
  );
}
