"use client";
import { useState, useEffect } from "react";
import { User } from "@supabase/supabase-js";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchUserGeneratedImages } from "@/app/_api/getUserGeneratedImages";
import { supabase } from "@/lib/supabase";
import { fetchApikey } from "@/app/_api/fetchApiKey";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, CopyIcon, ImageIcon, HeartIcon, KeyIcon, SaveIcon, User2Icon, UserIcon, Settings, Code, Sparkles, PlusCircle, Shield } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { LoadingSpinner } from "@/components/misc-components/LoadingSpinner";
import { motion } from "framer-motion";
import Link from "next/link";

interface UserStats {
  totalImages: number;
  totalLikes: number;
}

const ProfilePage = ({ user }: { user: User | null }) => {
  const [apiKey, setApiKey] = useState("");
  const [isHovered, setIsHovered] = useState(false);
  const queryClient = useQueryClient();

  // Fetch user's API key
  const { data: userApiKey, isLoading: isLoadingApiKey } = useQuery({
    queryKey: ["userApiKey", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      return fetchApikey(user.id);
    },
    enabled: !!user,
  });

  // Fetch user stats
  const { data: userStats, isLoading: isLoadingStats } = useQuery({
    queryKey: ["userStats", user?.id],
    queryFn: async () => {
      if (!user?.id) return { totalImages: 0, totalLikes: 0 };

      // Get total images
      const { count: totalImages, error: imagesError } = await supabase
        .from("image_metadata")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);

      // Get total likes
      const { count: totalLikes, error: likesError } = await supabase
        .from("image_likes")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);

      if (imagesError) console.error("Error fetching image count:", imagesError);
      if (likesError) console.error("Error fetching likes count:", likesError);

      return {
        totalImages: totalImages || 0,
        totalLikes: totalLikes || 0,
      };
    },
    enabled: !!user,
  });

  // Update API key mutation
  const updateApiKey = useMutation({
    mutationFn: async (newApiKey: string) => {
      if (!user?.id) throw new Error("User not logged in");

      const { data: existingKey } = await supabase
        .from("user_api_keys")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingKey) {
        // Update existing key
        const { error } = await supabase
          .from("user_api_keys")
          .update({ api_key: newApiKey, updated_at: new Date().toISOString() })
          .eq("user_id", user.id);

        if (error) throw error;
      } else {
        // Insert new key
        const { error } = await supabase
          .from("user_api_keys")
          .insert({ user_id: user.id, api_key: newApiKey });

        if (error) throw error;
      }

      return newApiKey;
    },
    onSuccess: () => {
      toast({
        title: "API Key Updated",
        description: "Your API key has been successfully updated.",
        variant: "default",
      });
      queryClient.invalidateQueries({ queryKey: ["userApiKey", user?.id] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to update API key: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const copyApiKey = () => {
    if (!apiKey) return;
    navigator.clipboard.writeText(apiKey);
    toast({
      title: "Copied to clipboard",
      description: "API key has been copied to your clipboard",
      variant: "default",
    });
  };

  // Set API key input value when userApiKey is loaded
  useEffect(() => {
    if (userApiKey) {
      setApiKey(userApiKey);
    }
  }, [userApiKey]);

  const handleSaveApiKey = () => {
    if (apiKey.trim()) {
      updateApiKey.mutate(apiKey.trim());
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen w-full bg-gradient-to-b from-black via-zinc-950 to-black">
        <div className="container mx-auto px-4 py-16">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center justify-center min-h-[60vh]"
          >
            <div className="w-24 h-24 bg-zinc-900/60 rounded-full flex items-center justify-center mb-6 border border-zinc-800/50 shadow-xl">
              <UserIcon className="w-10 h-10 text-zinc-500" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-4">Login Required</h1>
            <p className="text-zinc-400 max-w-md text-center mb-8">
              Please log in to view and manage your profile settings
            </p>
            <Link href="/login">
              <Button className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-medium py-6 px-8 rounded-full">
                Log In
              </Button>
            </Link>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-black via-zinc-950 to-black">
      <div className="container mx-auto px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-5xl mx-auto"
        >
          {/* Profile Header */}
          <Card className="w-full bg-zinc-900/40 backdrop-blur-lg border border-zinc-800/50 shadow-2xl overflow-hidden mb-8">
            <div className="h-48 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 relative overflow-hidden">
              <div className="absolute inset-0 bg-[url('/noise.svg')] opacity-20"></div>
              <div className="absolute bottom-0 left-0 w-full h-24 bg-gradient-to-t from-zinc-900/90 to-transparent"></div>
            </div>
            <div className="px-8 pb-8">
              <div className="flex flex-col md:flex-row gap-6 items-center md:items-end -mt-16 relative">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  transition={{ duration: 0.2 }}
                >
                  <Avatar className="h-32 w-32 border-4 border-zinc-900 bg-zinc-800 shadow-xl">
                    <AvatarImage src={user.user_metadata?.avatar_url || ""} alt={user.email || "User"} />
                    <AvatarFallback className="bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500">
                      <User2Icon className="w-16 h-16 text-white" />
                    </AvatarFallback>
                  </Avatar>
                </motion.div>
                <div className="flex-1 text-center md:text-left">
                  <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
                    {user.email}
                  </h1>
                  <p className="text-zinc-400 mb-2">
                    Member since {new Date(user.created_at).toLocaleDateString()}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2 justify-center md:justify-start">
                    <div className="px-3 py-1 bg-zinc-800/70 rounded-full text-sm text-zinc-300 flex items-center">
                      <ImageIcon className="w-3 h-3 mr-1 text-indigo-400" />
                      <span>{isLoadingStats ? "..." : userStats?.totalImages || 0} Images</span>
                    </div>
                    <div className="px-3 py-1 bg-zinc-800/70 rounded-full text-sm text-zinc-300 flex items-center">
                      <HeartIcon className="w-3 h-3 mr-1 text-pink-400" />
                      <span>{isLoadingStats ? "..." : userStats?.totalLikes || 0} Likes</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Tabs Content */}
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="bg-zinc-900/40 border border-zinc-800/50 p-1 mb-8">
              <TabsTrigger value="overview" className="data-[state=active]:bg-indigo-600">
                <UserIcon className="w-4 h-4 mr-2" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="settings" className="data-[state=active]:bg-indigo-600">
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </TabsTrigger>
              <TabsTrigger value="api" className="data-[state=active]:bg-indigo-600">
                <Code className="w-4 h-4 mr-2" />
                API
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-0">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Stats Card */}
                <motion.div
                  whileHover={{ y: -5 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card className="bg-zinc-900/40 backdrop-blur-lg border border-zinc-800/50 hover:border-zinc-700/50 transition-all shadow-lg h-full">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xl text-zinc-200 flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center">
                          <ImageIcon className="w-4 h-4 text-indigo-400" />
                        </div>
                        Images Generated
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {isLoadingStats ? (
                        <LoadingSpinner />
                      ) : (
                        <div className="flex items-baseline">
                          <p className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
                            {userStats?.totalImages || 0}
                          </p>
                          <p className="ml-2 text-zinc-500 text-sm">total images</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>

                {/* Likes Card */}
                <motion.div
                  whileHover={{ y: -5 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card className="bg-zinc-900/40 backdrop-blur-lg border border-zinc-800/50 hover:border-zinc-700/50 transition-all shadow-lg h-full">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xl text-zinc-200 flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-pink-500/20 flex items-center justify-center">
                          <HeartIcon className="w-4 h-4 text-pink-400" />
                        </div>
                        Total Likes
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {isLoadingStats ? (
                        <LoadingSpinner />
                      ) : (
                        <div className="flex items-baseline">
                          <p className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-pink-400 to-purple-400">
                            {userStats?.totalLikes || 0}
                          </p>
                          <p className="ml-2 text-zinc-500 text-sm">likes received</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>

                {/* Quick Actions */}
                <motion.div
                  whileHover={{ y: -5 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card className="bg-zinc-900/40 backdrop-blur-lg border border-zinc-800/50 hover:border-zinc-700/50 transition-all shadow-lg h-full">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xl text-zinc-200 flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                          <Sparkles className="w-4 h-4 text-purple-400" />
                        </div>
                        Quick Actions
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                      <Link href="/generate">
                        <Button variant="outline" className="w-full justify-start text-left hover:bg-indigo-600 hover:text-white border-zinc-800 group">
                          <PlusCircle className="mr-2 h-4 w-4 text-indigo-400 group-hover:text-white" />
                          Generate New Image
                        </Button>
                      </Link>
                      <Link href="/history">
                        <Button variant="outline" className="w-full justify-start text-left hover:bg-indigo-600 hover:text-white border-zinc-800 group">
                          <ImageIcon className="mr-2 h-4 w-4 text-indigo-400 group-hover:text-white" />
                          View History
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>
                </motion.div>
              </div>
            </TabsContent>

            <TabsContent value="settings" className="mt-0">
              <Card className="bg-zinc-900/40 backdrop-blur-lg border border-zinc-800/50 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-xl text-zinc-200 flex items-center gap-2">
                    <Shield className="w-5 h-5 text-purple-400" />
                    Account Settings
                  </CardTitle>
                  <CardDescription className="text-zinc-400">
                    Manage your account preferences and security settings
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-zinc-300 mb-4">Account settings are coming soon. This section will allow you to:</p>
                  <ul className="space-y-2 text-zinc-400 list-disc pl-5">
                    <li>Update your profile information</li>
                    <li>Change password and security settings</li>
                    <li>Manage email preferences</li>
                    <li>Configure privacy settings</li>
                  </ul>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="api" className="mt-0">
              {/* API Key Card */}
              <Card className="bg-zinc-900/40 backdrop-blur-lg border border-zinc-800/50 shadow-lg">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xl text-zinc-200 flex items-center gap-2">
                      <KeyIcon className="w-5 h-5 text-yellow-400" />
                      AI Horde API Key
                    </CardTitle>
                    <div className="bg-indigo-900/30 text-indigo-300 text-xs px-3 py-1 rounded-full border border-indigo-800/50">
                      Optional
                    </div>
                  </div>
                  <CardDescription className="text-zinc-400">
                    Enter your custom AI Horde API key for image generation
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="rounded-lg border border-zinc-800 p-4 bg-zinc-950/50">
                      <div className="flex items-center gap-2 mb-3">
                        <AlertCircle className="w-4 h-4 text-amber-400" />
                        <p className="text-sm text-zinc-300">A custom API key improves your priority in image generation queue</p>
                      </div>
                      <p className="text-sm text-zinc-400">
                        You can get an API key by registering at{" "}
                        <a
                          href="https://api.aipowergrid.io/register"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
                        >
                          AI Power Grid
                        </a>
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="apiKey" className="text-zinc-300">
                        Your API Key
                      </Label>
                      <div className="relative">
                        <Input
                          id="apiKey"
                          type="text"
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          placeholder="Enter your AI Horde API key"
                          className="bg-zinc-900/60 border-zinc-800 text-white pr-10 focus-visible:ring-indigo-500"
                        />
                        {apiKey && (
                          <button 
                            onClick={copyApiKey}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-white"
                            title="Copy to clipboard"
                          >
                            <CopyIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="border-t border-zinc-800/50 pt-4">
                  <Button 
                    onClick={handleSaveApiKey} 
                    disabled={updateApiKey.isPending}
                    className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white"
                  >
                    {updateApiKey.isPending ? (
                      <>
                        <LoadingSpinner size="sm" />
                        <span className="ml-2">Saving...</span>
                      </>
                    ) : (
                      <>
                        <SaveIcon className="w-4 h-4 mr-2" />
                        Save API Key
                      </>
                    )}
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </div>
  );
};

export default ProfilePage;
