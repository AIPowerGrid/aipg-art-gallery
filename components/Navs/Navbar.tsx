"use client";
import { useState, useEffect } from "react";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import Link from "next/link";
import { UserNav } from "../homepage-components/UserNav";
import { User } from "@supabase/supabase-js";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Home, ImageIcon, Clock, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

const Navbar = ({ user }: { user: User | null }) => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  // Track scroll position for navbar styling
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close mobile menu when route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const navItems = [
    { href: "/", label: "Home", icon: <Home className="w-4 h-4" /> },
    { href: "/generate", label: "Generate", icon: <ImageIcon className="w-4 h-4" /> },
    { href: "/history", label: "History", icon: <Clock className="w-4 h-4" /> },
    { href: "/likes", label: "Likes", icon: <Heart className="w-4 h-4" /> },
  ];

  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      <motion.div 
        className="absolute inset-0 w-full"
        style={{
          background: scrolled 
            ? "linear-gradient(to right, rgba(79, 70, 229, 0.2) 0%, rgba(109, 40, 217, 0.2) 50%, rgba(219, 39, 119, 0.2) 100%)" 
            : "transparent"
        }}
      />
      
      <motion.header 
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.4, type: "spring", stiffness: 300, damping: 20 }}
        className={cn(
          "py-4 px-6 flex items-center justify-between transition-all duration-300 relative",
          scrolled 
            ? "bg-black/80 backdrop-blur-xl border-b border-white/10 shadow-lg shadow-indigo-500/10" 
            : "bg-transparent"
        )}
      >
        {/* Logo */}
        <Link href="/" className="relative z-50 flex items-center gap-2">
          <motion.div 
            whileHover={{ scale: 1.05, rotate: 2 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 10 }}
            className="relative"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full blur-xl opacity-50 group-hover:opacity-75 transition-opacity animate-pulse" style={{ animationDuration: '4s' }}></div>
            <img
              src="/aipgweblogo.webp"
              alt="AI Power Grid"
              className="w-auto h-10 relative z-10 drop-shadow-lg"
            />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2, duration: 0.3 }}
            className="hidden sm:block font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400"
          >
            AI Power Grid
          </motion.div>
        </Link>

        {/* Desktop Navigation */}
        <NavigationMenu className="hidden md:flex relative z-10">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.3 }}
          >
            <NavigationMenuList className="flex gap-2">
              {navItems.map((item, index) => (
                <NavigationMenuItem key={item.href}>
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 * (index + 1), duration: 0.3 }}
                  >
                    <Link href={item.href} passHref>
                      <NavigationMenuLink asChild>
                        <motion.div
                          whileHover={{ y: -2 }}
                          whileTap={{ y: 1 }}
                          className={cn(
                            "px-4 py-2 rounded-full flex items-center gap-2 text-sm font-medium transition-all duration-200",
                            pathname === item.href
                              ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/20" 
                              : "text-zinc-300 hover:text-white hover:bg-white/10 backdrop-blur-lg"
                          )}
                        >
                          {item.icon}
                          <span>{item.label}</span>
                          {pathname === item.href && (
                            <motion.div
                              layoutId="nav-pill"
                              className="absolute inset-0 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 -z-10"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.2 }}
                            />
                          )}
                        </motion.div>
                      </NavigationMenuLink>
                    </Link>
                  </motion.div>
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </motion.div>
        </NavigationMenu>

        {/* Mobile Menu Toggle */}
        <div className="flex items-center gap-4 relative z-10">
          <UserNav user={user} />

          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="md:hidden relative p-2 rounded-full text-white bg-gradient-to-r from-indigo-500 to-purple-600 shadow-md shadow-indigo-500/20"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={mobileMenuOpen ? "close" : "menu"}
                initial={{ opacity: 0, rotate: -90 }}
                animate={{ opacity: 1, rotate: 0 }}
                exit={{ opacity: 0, rotate: 90 }}
                transition={{ duration: 0.2 }}
              >
                {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
              </motion.div>
            </AnimatePresence>
          </motion.button>
        </div>
      </motion.header>

      {/* Mobile Navigation Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "100vh" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="md:hidden fixed inset-0 top-[72px] bg-gradient-to-b from-black via-zinc-900/98 to-black backdrop-blur-xl z-40 overflow-hidden"
          >
            <motion.div 
              className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/10 rounded-full filter blur-3xl opacity-30"
              animate={{ 
                x: [100, -100, 100], 
                y: [-100, 100, -100],
                scale: [1, 1.2, 1]
              }}
              transition={{ 
                duration: 15, 
                repeat: Infinity,
                repeatType: "reverse"
              }}
            />
            
            <motion.div 
              className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-purple-500/10 rounded-full filter blur-3xl opacity-30"
              animate={{ 
                x: [-50, 100, -50], 
                y: [100, -100, 100],
                scale: [1.2, 1, 1.2]
              }}
              transition={{ 
                duration: 18, 
                repeat: Infinity,
                repeatType: "reverse" 
              }}
            />
            
            <div className="flex flex-col items-center justify-center h-full relative z-10">
              <nav className="flex flex-col items-center gap-6 w-full px-6 py-10">
                {navItems.map((item, index) => (
                  <motion.div
                    key={item.href}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 * index, duration: 0.3 }}
                    className="w-full"
                  >
                    <Link href={item.href}>
                      <Button
                        variant={pathname === item.href ? "default" : "ghost"}
                        size="lg"
                        className={cn(
                          "w-full h-16 rounded-xl text-lg flex items-center justify-center gap-3 transition-all",
                          pathname === item.href
                            ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/20 border border-white/10" 
                            : "text-zinc-300 hover:text-white hover:bg-white/5 border border-white/5"
                        )}
                      >
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center",
                          pathname === item.href
                            ? "bg-white/20" 
                            : "bg-white/5"
                        )}>
                          {item.icon}
                        </div>
                        <span>{item.label}</span>
                      </Button>
                    </Link>
                  </motion.div>
                ))}
              </nav>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Navbar;
