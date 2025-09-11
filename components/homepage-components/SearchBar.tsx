"use client";

import { Search, X, Sparkles } from "lucide-react";
import { Dispatch, SetStateAction, useState } from "react";
import { motion } from "framer-motion";

interface SearchBarProps {
  value: string;
  setValue: Dispatch<SetStateAction<string>>;
}

const SearchBar = ({ value, setValue }: SearchBarProps) => {
  const [isFocused, setIsFocused] = useState(false);
  const popularTags = ["Landscape", "Portrait", "Abstract", "Animals", "Cyberpunk", "Space", "Futuristic"];
  
  return (
    <div className="relative">
      <div className="relative">
        {/* Glowing effect when focused */}
        {isFocused && (
          <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full blur-sm opacity-70 animate-pulse" />
        )}
        <div className="relative flex items-center">
          <div className="absolute left-4 text-zinc-400">
            <Search className="h-5 w-5" />
          </div>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Search images..."
            className="w-full bg-zinc-900/80 backdrop-blur-sm border border-zinc-800/50 rounded-full py-4 pl-12 pr-12 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-transparent transition-all shadow-lg"
          />
          {value && (
            <button
              onClick={() => setValue("")}
              className="absolute right-4 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
      
      <motion.div 
        className="flex flex-wrap gap-2 mt-4 justify-center"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.3 }}
      >
        {popularTags.map((tag, index) => (
          <motion.button
            key={tag}
            onClick={() => setValue(tag)}
            className="px-4 py-1.5 text-sm bg-zinc-900/60 hover:bg-indigo-500/80 text-zinc-300 hover:text-white rounded-full transition-all border border-zinc-800/40 hover:border-indigo-400/30 backdrop-blur-sm shadow-md flex items-center space-x-1 hover:scale-105"
            whileHover={{ 
              y: -2,
              transition: { duration: 0.2 }
            }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 * index, duration: 0.3 }}
          >
            {index === 0 && <Sparkles className="h-3 w-3 mr-1 text-indigo-400" />}
            <span>{tag}</span>
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
};

export default SearchBar;
