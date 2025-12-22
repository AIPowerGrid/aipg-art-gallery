"use client";

import { useEffect, useState } from "react";
import { supabase, Generation, User } from "@/lib/supabase";
import { useAccount } from "wagmi";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [loading, setLoading] = useState(true);
  const [supabaseConfigured, setSupabaseConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { address, isConnected } = useAccount();

  useEffect(() => {
    // Check if Supabase is configured
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl || supabaseUrl.trim() === '') {
      setSupabaseConfigured(false);
      setLoading(false);
      return;
    }
    checkUser();
  }, []);

  useEffect(() => {
    if (user) {
      loadUserGenerations();
    }
  }, [user]);

  async function checkUser() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth/login");
        return;
      }
      setUser(user);
    } catch (err: any) {
      console.error("Error checking user:", err);
      setError("Unable to connect to authentication service");
      setLoading(false);
    }
  }

  async function loadUserGenerations() {
    if (!user) return;
    try {
      setLoading(true);
      const { data, error: queryError } = await supabase
        .from("generations")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (queryError) throw queryError;
      setGenerations(data || []);
    } catch (err: any) {
      console.error("Error loading generations:", err);
      setError("Unable to load your creations");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/");
  }

  // Show wallet-based profile when Supabase is not configured
  if (!supabaseConfigured) {
    return (
      <main className="flex-1 w-full px-4 md:px-10 py-8 space-y-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl md:text-5xl font-semibold text-gradient">
              My Creations
            </h1>
            <p className="text-white/70 mt-2">
              View and manage your generated images and videos
            </p>
          </div>
          <div className="flex gap-4">
            <Link
              href="/"
              className="px-6 py-2 rounded-full border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition"
            >
              Generate
            </Link>
          </div>
        </header>

        <div className="text-center py-20">
          <div className="panel max-w-md mx-auto space-y-4">
            <div className="text-4xl">👤</div>
            <h2 className="text-xl font-semibold text-white">Profile Unavailable</h2>
            {isConnected ? (
              <>
                <p className="text-white/70">Connected as</p>
                <p className="font-mono text-sm text-orange-400 break-all">{address}</p>
                <p className="text-white/50 text-sm">
                  Generation history requires a database connection. Your images are generated on-demand through the Grid network.
                </p>
              </>
            ) : (
              <>
                <p className="text-white/70">Connect your wallet to get started.</p>
                <p className="text-white/50 text-sm">
                  You can generate images and videos without signing in.
                </p>
              </>
            )}
            <Link 
              href="/"
              className="inline-block px-6 py-2 rounded-full bg-gradient-to-r from-orange-500 to-yellow-400 text-black font-semibold hover:opacity-90 transition"
            >
              Start Creating
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex-1 w-full px-4 md:px-10 py-8 space-y-8">
        <div className="text-center py-20">
          <div className="panel max-w-md mx-auto space-y-4">
            <div className="text-4xl">⚠️</div>
            <h2 className="text-xl font-semibold text-white">Error</h2>
            <p className="text-white/70">{error}</p>
            <Link 
              href="/"
              className="inline-block px-6 py-2 rounded-full bg-gradient-to-r from-orange-500 to-yellow-400 text-black font-semibold hover:opacity-90 transition"
            >
              Go Home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <main className="flex-1 w-full px-4 md:px-10 py-8 space-y-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl md:text-5xl font-semibold text-gradient">
            My Creations
          </h1>
          <p className="text-white/70 mt-2">
            View and manage your generated images and videos
          </p>
        </div>
        <div className="flex gap-4">
          <Link
            href="/"
            className="px-6 py-2 rounded-full border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition"
          >
            Generate
          </Link>
          <Link
            href="/gallery"
            className="px-6 py-2 rounded-full border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition"
          >
            Public Gallery
          </Link>
          <button
            onClick={handleSignOut}
            className="px-6 py-2 rounded-full border border-red-500/40 text-red-300 hover:bg-red-500/20 transition"
          >
            Sign Out
          </button>
        </div>
      </header>

      <div className="panel p-6">
        <div className="flex items-center gap-4">
          {user.user_metadata?.avatar_url && (
            <img
              src={user.user_metadata.avatar_url}
              alt={user.user_metadata?.full_name || "User"}
              className="w-16 h-16 rounded-full"
            />
          )}
          <div>
            <h2 className="text-xl font-semibold">
              {user.user_metadata?.full_name || user.user_metadata?.preferred_username || user.email}
            </h2>
            <p className="text-white/50 text-sm">{user.email}</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-white/50 py-20">
          Loading your creations...
        </div>
      ) : generations.length === 0 ? (
        <div className="text-center text-white/50 py-20">
          <p className="mb-4">You haven't created anything yet.</p>
          <Link
            href="/"
            className="inline-block px-6 py-2 rounded-full bg-gradient-to-r from-orange-500 to-yellow-400 text-black font-semibold hover:opacity-90 transition"
          >
            Start Creating
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {generations.map((gen) => (
            <ProfileItem key={gen.id} generation={gen} onUpdate={loadUserGenerations} />
          ))}
        </div>
      )}
    </main>
  );
}

function ProfileItem({ generation, onUpdate }: { generation: Generation; onUpdate: () => void }) {
  const [imageError, setImageError] = useState(false);

  async function togglePublic() {
    const { error } = await supabase
      .from("generations")
      .update({ is_public: !generation.is_public })
      .eq("id", generation.id);

    if (!error) {
      onUpdate();
    }
  }

  async function handleDelete() {
    if (!confirm("Are you sure you want to delete this generation?")) return;
    
    const { error } = await supabase
      .from("generations")
      .delete()
      .eq("id", generation.id);

    if (!error) {
      onUpdate();
    }
  }

  return (
    <div className="panel group">
      <div className="relative aspect-square rounded-xl overflow-hidden bg-black/40">
        {generation.generation_type === "video" ? (
          <video
            src={generation.media_url || undefined}
            className="w-full h-full object-cover"
            controls
            muted
            onError={() => setImageError(true)}
          />
        ) : generation.media_base64 ? (
          <img
            src={generation.media_base64}
            alt={generation.prompt}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : generation.media_url ? (
          <img
            src={generation.media_url}
            alt={generation.prompt}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/30">
            No preview
          </div>
        )}
        {generation.is_nsfw && (
          <div className="absolute top-2 right-2 px-2 py-1 bg-red-500/80 text-white text-xs rounded">
            NSFW
          </div>
        )}
      </div>
      <div className="p-4 space-y-3">
        <p className="text-sm text-white/90 line-clamp-2">{generation.prompt}</p>
        <div className="flex items-center justify-between text-xs text-white/50">
          <span>{generation.model_id}</span>
          <span>{new Date(generation.created_at).toLocaleDateString()}</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={togglePublic}
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs transition ${
              generation.is_public
                ? "bg-green-500/20 text-green-300 border border-green-500/40"
                : "bg-white/10 text-white/70 border border-white/20"
            }`}
          >
            {generation.is_public ? "Public" : "Private"}
          </button>
          <button
            onClick={handleDelete}
            className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-300 border border-red-500/40 text-xs hover:bg-red-500/30 transition"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

