import ImageGeneratorComponent from "@/components/image-gen-components/ImageGenForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Sparkles, PencilRuler, Zap } from "lucide-react";

const page = async () => {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="w-full min-h-screen bg-gradient-to-b from-zinc-950 to-black bg-dot-white/[0.2]">
      <div className="absolute top-0 left-0 right-0 h-[30vh] bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10 blur-3xl opacity-30 pointer-events-none"></div>
      
      <div className="container mx-auto px-4 py-12 relative z-10">
        <div className="flex flex-col items-center justify-center mb-12">
          <div className="inline-block mb-6 relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full blur opacity-70"></div>
            <div className="relative bg-zinc-900/80 backdrop-blur-sm rounded-full p-4 border border-zinc-800/50 shadow-xl">
              <PencilRuler className="w-10 h-10 text-white" />
            </div>
          </div>
          
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500">
              AI Image Generator
            </span>
          </h1>
          
          <p className="text-zinc-300 mt-6 max-w-2xl mx-auto text-lg md:text-xl font-light text-center">
            Create stunning AI-generated images with powerful customization options
          </p>
          
          <div className="flex flex-wrap items-center justify-center mt-6 gap-3">
            <div className="flex items-center space-x-2 bg-zinc-900/60 backdrop-blur-sm rounded-full px-5 py-2 border border-zinc-800/30 shadow-lg">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
              <span className="text-zinc-300 text-sm font-medium">Distributed Image Workers</span>
            </div>
            <div className="flex items-center space-x-2 bg-zinc-900/60 backdrop-blur-sm rounded-full px-5 py-2 border border-zinc-800/30 shadow-lg">
              <Sparkles className="w-4 h-4 text-indigo-400 mr-1" />
              <span className="text-zinc-300 text-sm font-medium">Multiple Models</span>
            </div>
            <div className="flex items-center space-x-2 bg-zinc-900/60 backdrop-blur-sm rounded-full px-5 py-2 border border-zinc-800/30 shadow-lg">
              <Zap className="w-4 h-4 text-indigo-400 mr-1" />
              <span className="text-zinc-300 text-sm font-medium">Free to Use</span>
            </div>
          </div>
        </div>
        
        <div className="w-full flex flex-col items-center justify-center">
          <div className="w-full max-w-7xl bg-zinc-950/70 backdrop-blur-lg rounded-3xl border border-zinc-800/40 shadow-2xl overflow-hidden transition-all hover:border-zinc-700/40">
            <div className="p-1">
              <div className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 h-1 w-full rounded-t-xl"></div>
              <ImageGeneratorComponent user={user} />
            </div>
          </div>
          
          <div className="mt-8 text-center text-zinc-400 text-sm max-w-2xl mx-auto bg-zinc-900/30 backdrop-blur-sm rounded-xl p-4 border border-zinc-800/20">
            <p className="mb-1">Images are generated using the AI Power Grid distributed network.</p>
            <p>Please be patient as generation times may vary based on network load.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default page;
