"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { WalletButton } from "./wallet-button";

export function Header() {
  const pathname = usePathname();
  
  const isActive = (path: string) => {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  };
  
  return (
    <header className="sticky top-0 z-40 bg-black/80 backdrop-blur-md border-b border-white/5">
      <div className="max-w-[1920px] mx-auto px-3 sm:px-6 md:px-12 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-2">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition shrink-0">
            <Image 
              src="/aipg-logo.png" 
              alt="AIPG" 
              width={32} 
              height={32}
              className="w-8 h-8 sm:w-10 sm:h-10"
            />
            <Image 
              src="/aipg-weblogo.png" 
              alt="AI Power Grid" 
              width={70} 
              height={16}
              className="h-3 sm:h-4 w-auto hidden sm:block"
            />
          </Link>

          {/* Nav - centered with search box on desktop */}
          <nav className="hidden md:flex items-center gap-6 absolute left-1/2 -translate-x-1/2">
            <Link href="/" className={`text-sm transition ${isActive("/") ? "text-white font-medium" : "text-white/60 hover:text-white"}`}>
              Gallery
            </Link>
            <Link href="/create" className={`text-sm transition ${isActive("/create") ? "text-white font-medium" : "text-white/60 hover:text-white"}`}>
              Create
            </Link>
            <Link href="/profile" className={`text-sm transition ${isActive("/profile") ? "text-white font-medium" : "text-white/60 hover:text-white"}`}>
              My Images
            </Link>
          </nav>

          {/* Nav mobile */}
          <nav className="flex md:hidden items-center gap-3 sm:gap-4">
            <Link href="/" className={`text-xs sm:text-sm transition ${isActive("/") ? "text-white font-medium" : "text-white/60 hover:text-white"}`}>
              Gallery
            </Link>
            <Link href="/create" className={`text-xs sm:text-sm transition ${isActive("/create") ? "text-white font-medium" : "text-white/60 hover:text-white"}`}>
              Create
            </Link>
            <Link href="/profile" className={`text-xs sm:text-sm transition hidden sm:block ${isActive("/profile") ? "text-white font-medium" : "text-white/60 hover:text-white"}`}>
              My Images
            </Link>
          </nav>

          {/* Wallet */}
          <div className="flex items-center shrink-0">
            <WalletButton />
          </div>
        </div>
      </div>
    </header>
  );
}
