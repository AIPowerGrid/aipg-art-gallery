import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Home, ImageIcon, LogIn, LogOut, User2Icon, Settings, Heart } from "lucide-react";

import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { AuthForm } from "../auth-components/AuthForm";
import { SignOutUser } from "@/actions/auth-actions";
import { type User as UserType } from "@supabase/supabase-js";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { motion } from "framer-motion";

export function UserNav({ user }: { user: UserType | null }) {
  return (
    <Dialog>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {user ? (
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button 
                variant="ghost" 
                className="h-10 w-10 rounded-full p-0 overflow-hidden border border-indigo-700/30 hover:border-indigo-600 hover:bg-indigo-950/30 shadow-sm shadow-indigo-500/20"
              >
                <Avatar className="h-10 w-10">
                  <AvatarImage src={user.user_metadata?.avatar_url || ""} alt={user.email || "User"} />
                  <AvatarFallback className="bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500">
                    <User2Icon className="w-5 h-5 text-white" />
                  </AvatarFallback>
                </Avatar>
              </Button>
            </motion.div>
          ) : (
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                variant="outline"
                className="px-4 py-2 rounded-full bg-indigo-600/90 border-indigo-500/50 hover:bg-indigo-500 hover:border-indigo-400 text-white shadow-sm shadow-indigo-900/20"
              >
                <span className="text-sm font-medium">Sign In</span>
              </Button>
            </motion.div>
          )}
        </DropdownMenuTrigger>
        {user ? (
          <DropdownMenuContent 
            className="w-64 bg-zinc-900/95 backdrop-blur-md border border-zinc-800/80 shadow-xl shadow-purple-900/10 rounded-xl p-1" 
            align="end" 
            forceMount
          >
            <div className="flex items-center gap-3 p-3 mb-1">
              <Avatar className="h-12 w-12 border-2 border-indigo-500/20">
                <AvatarImage src={user.user_metadata?.avatar_url || ""} alt={user.email || "User"} />
                <AvatarFallback className="bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500">
                  <User2Icon className="w-6 h-6 text-white" />
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col space-y-0.5">
                <p className="text-sm font-medium text-white">
                  {user?.email}
                </p>
                <p className="text-xs text-zinc-400">
                  {user?.user_metadata?.name || "User"}
                </p>
              </div>
            </div>
            
            <DropdownMenuSeparator className="bg-zinc-800/80 my-1" />
            
            <DropdownMenuGroup className="p-1">
              <DropdownMenuItem asChild>
                <Link href="/profile" className="cursor-pointer flex items-center gap-3 rounded-lg py-2.5 px-3 text-zinc-200 hover:bg-indigo-600 hover:text-white focus:bg-indigo-600 focus:text-white">
                  <User2Icon className="w-4 h-4" />
                  <span>Profile</span>
                </Link>
              </DropdownMenuItem>
              
              <DropdownMenuItem asChild>
                <Link href="/generate" className="cursor-pointer flex items-center gap-3 rounded-lg py-2.5 px-3 text-zinc-200 hover:bg-indigo-600 hover:text-white focus:bg-indigo-600 focus:text-white">
                  <ImageIcon className="w-4 h-4" />
                  <span>Generate Images</span>
                </Link>
              </DropdownMenuItem>
              
              <DropdownMenuItem asChild>
                <Link href="/history" className="cursor-pointer flex items-center gap-3 rounded-lg py-2.5 px-3 text-zinc-200 hover:bg-indigo-600 hover:text-white focus:bg-indigo-600 focus:text-white">
                  <Home className="w-4 h-4" />
                  <span>My History</span>
                </Link>
              </DropdownMenuItem>
              
              <DropdownMenuItem asChild>
                <Link href="/likes" className="cursor-pointer flex items-center gap-3 rounded-lg py-2.5 px-3 text-zinc-200 hover:bg-indigo-600 hover:text-white focus:bg-indigo-600 focus:text-white">
                  <Heart className="w-4 h-4" />
                  <span>My Likes</span>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            
            <DropdownMenuSeparator className="bg-zinc-800/80 my-1" />
            
            <div className="p-1">
              <DropdownMenuItem
                className="cursor-pointer flex items-center gap-3 rounded-lg py-2.5 px-3 text-zinc-200 hover:bg-red-600 hover:text-white focus:bg-red-600 focus:text-white"
                onClick={() => SignOutUser()}
              >
                <LogOut className="w-4 h-4" />
                <span>Log Out</span>
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        ) : (
          <DropdownMenuContent className="w-56 bg-zinc-900/95 backdrop-blur-md border border-zinc-800/80 shadow-xl shadow-purple-900/10 rounded-xl p-1" align="end" forceMount>
            <DialogTrigger className="w-full">
              <DropdownMenuItem className="cursor-pointer flex items-center gap-3 rounded-lg py-2.5 px-3 text-zinc-200 hover:bg-indigo-600 hover:text-white focus:bg-indigo-600 focus:text-white">
                <LogIn className="w-4 h-4" />
                <span>Log In / Sign Up</span>
              </DropdownMenuItem>
            </DialogTrigger>
          </DropdownMenuContent>
        )}
      </DropdownMenu>
      <DialogContent className="bg-zinc-900/95 backdrop-blur-md border-zinc-800/80 shadow-xl rounded-xl max-w-md w-[90%]">
        <AuthForm />
      </DialogContent>
    </Dialog>
  );
}
