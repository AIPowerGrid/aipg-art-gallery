import ImageGeneratorComponent from "@/components/image-gen-components/ImageGenForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const page = async () => {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="w-full min-h-screen bg-gradient-to-b from-zinc-950 to-black bg-dot-white/[0.2]">
      <div className="absolute top-0 left-0 right-0 h-[30vh] bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10 blur-3xl opacity-30 pointer-events-none"></div>
      
      <div className="container mx-auto px-4 py-12 relative z-10">
        <div className="w-full flex flex-col items-center justify-center">
          <div className="w-full max-w-7xl bg-zinc-950/70 backdrop-blur-lg rounded-3xl border border-zinc-800/40 shadow-2xl overflow-hidden transition-all hover:border-zinc-700/40">
            <div className="p-1">
              <div className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 h-1 w-full rounded-t-xl"></div>
              <ImageGeneratorComponent user={user} />
            </div>
          </div>
          
          <div className="mt-8 text-center text-zinc-400 text-sm max-w-2xl mx-auto bg-zinc-900/30 backdrop-blur-sm rounded-xl p-4 border border-zinc-800/20">
            <p className="mb-1">Images are generated using the distributed image workers.</p>
            <p>Please be patient as generation times may vary based on network load.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default page;
