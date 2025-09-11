"use client";
import Link from "next/link";
import { UserNav } from "../homepage-components/UserNav";
import { User } from "@supabase/supabase-js";
import { Home, ImageIcon, History, Heart, User2Icon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const FloatingNavbar = ({ user }: { user: User | null }) => {
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
    { name: "Home", path: "/", icon: <Home className="w-4 h-4" /> },
    { name: "Generate", path: "/generate", icon: <ImageIcon className="w-4 h-4" /> },
    { name: "History", path: "/history", icon: <History className="w-4 h-4" /> },
    { name: "Likes", path: "/likes", icon: <Heart className="w-4 h-4" /> },
    { name: "Profile", path: "/profile", icon: <User2Icon className="w-4 h-4" /> },
  ];

  return (
    <>
      {/* Top Navbar */}
      <header 
        className={cn(
          "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
          scrolled 
            ? "bg-black/85 backdrop-blur-md shadow-lg border-b border-zinc-800/50" 
            : "bg-transparent"
        )}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Link href="/" className="flex items-center gap-2">
                <img
                  src="/aipgweblogo.webp"
                  alt="AI Gallery"
                  className="w-auto h-6 sm:h-8"
                />
                <span className="font-medium text-lg bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 hidden sm:inline-block">
                  AI Gallery
                </span>
              </Link>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-1">
              {navItems.map((item) => (
                <Link 
                  key={item.path} 
                  href={item.path}
                  className={cn(
                    "px-3 py-2 rounded-md flex items-center transition-colors text-sm font-medium",
                    pathname === item.path 
                      ? "bg-white/10 text-white" 
                      : "text-zinc-400 hover:text-white hover:bg-white/5"
                  )}
                >
                  <span className="mr-2">{item.icon}</span>
                  <span>{item.name}</span>
                </Link>
              ))}
            </div>

            {/* User Menu and Mobile Menu Button */}
            <div className="flex items-center gap-2">
              <UserNav user={user} />
              <Sheet>
                <SheetTrigger asChild className="md:hidden">
                  <Button variant="ghost" size="icon" className="md:hidden text-zinc-400 hover:text-white">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="bg-zinc-900/95 backdrop-blur-lg border-zinc-800">
                  <div className="flex flex-col gap-6 mt-8">
                    {navItems.map((item) => (
                      <Link 
                        key={item.path} 
                        href={item.path}
                        className={cn(
                          "flex items-center py-2 px-4 rounded-lg transition-colors",
                          pathname === item.path 
                            ? "bg-white/10 text-white" 
                            : "text-zinc-400 hover:text-white hover:bg-white/5"
                        )}
                      >
                        <span className="mr-3">{item.icon}</span>
                        <span className="font-medium">{item.name}</span>
                      </Link>
                    ))}
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </header>

      {/* Floating Dock (visible on scroll) */}
      <div 
        className={cn(
          "fixed bottom-8 left-1/2 transform -translate-x-1/2 transition-all duration-300 ease-in-out z-50",
          scrolled ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10 pointer-events-none"
        )}
      >
        <div className="bg-zinc-900/90 backdrop-blur-xl px-4 py-2 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-zinc-800/50 flex items-center gap-1">
          {navItems.map((item) => (
            <Link 
              key={item.path} 
              href={item.path}
              className={cn(
                "p-2 rounded-full transition-colors",
                pathname === item.path 
                  ? "bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white" 
                  : "text-zinc-400 hover:text-white hover:bg-white/10"
              )}
              aria-label={item.name}
            >
              {item.icon}
            </Link>
          ))}
        </div>
      </div>
    </>
  );
};

export default FloatingNavbar;
