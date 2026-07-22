"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAccount } from "wagmi";
import { CustomConnectButton } from "./custom-connect-button";
import { ActiveJobsIndicator } from "./active-jobs-indicator";
import { GoogleAccountButton } from "./google-account-button";
import { useAuthStore } from "@/lib/stores/auth-store";

export function Header() {
  const pathname = usePathname();
  const { isConnected } = useAccount();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Use reactive auth state from store
  const { isAuthenticated, authMethod } = useAuthStore();
  const authenticated = isAuthenticated && (authMethod === 'google' || isConnected);
  const favoritesLink = authenticated ? "/favorites" : "/join";
  const favoritesLabel = authenticated ? "Favorites" : "Join";
  
  const isActive = (path: string) => {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  };

  const navItems = [
    { href: "/", label: "Gallery", active: isActive("/") },
    { href: "/create", label: "Studio", active: isActive("/create") },
    { href: "/audio", label: "Music", active: isActive("/audio") },
    ...(authMethod === 'google' ? [] : [
      { href: favoritesLink, label: favoritesLabel, active: isActive("/favorites") || isActive("/join") },
    ]),
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
          <nav className="hidden md:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
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
          <div className="hidden md:flex items-center gap-3 shrink-0">
            <ActiveJobsIndicator />
            {!authenticated && (
              <Link href="/auth/login" className="px-3 py-2 text-sm font-medium text-white/80 hover:text-white">
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
                  className="block px-4 py-3 text-white/80 hover:text-white"
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
