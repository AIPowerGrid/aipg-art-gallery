"use client";

import { Aperture, BookHeart, Home, ImageIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

const FooterNav = () => {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const isScrolled = window.scrollY > 20;
      if (isScrolled !== scrolled) {
        setScrolled(isScrolled);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [scrolled]);

  const navItems = [
    { path: "/", icon: <Home className="w-5 h-5" />, label: "Home" },
    { path: "/generate", icon: <ImageIcon className="w-5 h-5" />, label: "Generate" },
    { path: "/history", icon: <Aperture className="w-5 h-5" />, label: "History" },
    { path: "/likes", icon: <BookHeart className="w-5 h-5" />, label: "Likes" },
  ];

  return (
    <div className={cn(
      "md:hidden fixed bottom-0 left-0 right-0 z-40 transition-all duration-300",
      scrolled ? "opacity-0 translate-y-full pointer-events-none" : "opacity-100"
    )}>
      <div className="bg-zinc-900/90 backdrop-blur-lg border-t border-zinc-800/50">
        <div className="flex justify-around items-center px-2 py-2">
          {navItems.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              className="flex flex-col items-center gap-1 py-1"
            >
              <div className={cn(
                "p-2 rounded-full transition-colors",
                pathname === item.path
                  ? "bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white"
                  : "bg-zinc-800/50 text-zinc-400"
              )}>
                {item.icon}
              </div>
              <span className={cn(
                "text-xs font-medium",
                pathname === item.path ? "text-white" : "text-zinc-400"
              )}>
                {item.label}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FooterNav;
