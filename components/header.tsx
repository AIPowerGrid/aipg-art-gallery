"use client";

import Link from "next/link";
import { WalletButton } from "./wallet-button";

export function Header() {
  return (
    <header className="sticky top-0 z-40 bg-black/80 backdrop-blur-md border-b border-white/5">
      <div className="max-w-[1920px] mx-auto px-6 md:px-12 py-4 flex items-center justify-between">
        <Link href="/" className="text-white text-xl font-semibold">
          AIPG Art Gallery
        </Link>
        <nav className="flex items-center gap-6">
          <Link
            href="/"
            className="text-white/80 hover:text-white text-sm transition"
          >
            Gallery
          </Link>
          <Link
            href="/create"
            className="text-white/80 hover:text-white text-sm transition"
          >
            Create
          </Link>
          <Link
            href="/profile"
            className="text-white/80 hover:text-white text-sm transition"
          >
            My Creations
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
