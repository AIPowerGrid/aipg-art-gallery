"use client";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";

type SearchProps = {
  onChange?: React.ChangeEventHandler<HTMLInputElement> | undefined;
  value?: string | number | readonly string[] | undefined;
  setValue?: (value: string) => void;
};

const HistorySearch = ({ value, onChange, setValue }: SearchProps) => {
  const [isFocused, setIsFocused] = useState(false);
  
  return (
    <div className="relative w-full max-w-2xl mx-auto">
      <div className="relative">
        {/* Glowing effect when focused */}
        {isFocused && (
          <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-lg blur-sm opacity-70 animate-pulse" />
        )}
        <div className="relative flex items-center">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            type="text"
            placeholder="Search your images..."
            className="w-full bg-zinc-900/80 backdrop-blur-sm border border-zinc-800/50 pl-10 pr-10 py-6 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-transparent transition-all shadow-md"
            onChange={onChange}
            value={value}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
          />
          {value && setValue && (
            <button
              onClick={() => setValue("")}
              className="absolute right-3 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default HistorySearch;
