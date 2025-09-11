"use client";
import { useEffect, useState, useTransition } from "react";
import { Textarea } from "@/components/ui/textarea";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import MultipleSelector, { Option } from "@/components/ui/multiple-selector";
import { Switch } from "@/components/ui/switch";
import { toast, useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";

import ToolTipComponent from "./ToolTipComponent";
import SliderWithCounter from "./SliderComponent";

import { Card, CardContent } from "@/components/ui/card";

import ImageCarousel from "@/components/image-gen-components/ImageCarousel";
import ActiveJobsPanel from "@/components/image-gen-components/ActiveJobsPanel";

import fetchAvailableModels from "@/app/_api/fetchModels";
import { Model, GeneratedImage } from "@/types";
import { useQuery } from "@tanstack/react-query";
import { transformFormData } from "@/utils/validationUtils";
import { createImage } from "@/app/_api/createImage";
import useJobIdStore from "@/stores/jobIDStore";
import { User } from "@supabase/supabase-js";
import { createSupabaseClient } from "@/lib/supabase/client";
import useImageMetadataStore from "@/stores/ImageMetadataStore";
import { LoadingSpinner } from "@/components/misc-components/LoadingSpinner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getFinishedImage } from "@/app/_api/fetchFinishedImage";
import { saveImageData, saveMetadata } from "@/app/_api/saveImageToSupabase";
import { Eye, Save, Sparkles, Badge, Settings, Sliders, Rocket, GalleryHorizontal, PenTool, Download } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import ImageUploader from "./ImageUploader";
import MaskCanvas from "./MaskCanvas";
import { blobToBase64 } from "@/utils/imageUtils";
import { isBase64UrlImage, base64toBlob, dataUrlToFile } from "@/utils/imageUtils";
import { FormSchema } from "@/types";
import { AnimatePresence, motion } from "framer-motion";
import stylesData from "@/constants/styles.json";

// Define a basic interface for the style objects
interface ImageStyle {
  name: string;
  model?: string; // Assuming styles.json might have a 'model' field
  models?: string[]; // Or a 'models' field
  prompt?: string;
  negative_prompt?: string;
  sampler?: string;
  seed?: string;
  cfg_scale?: number;
  steps?: number;
  // Add other potential fields from styles.json as needed
  // e.g., width, height, clip_skip, etc.
  width?: number;
  height?: number;
  clip_skip?: number;
  loras?: Array<{ name: string; model?: number; clip?: number; is_version?: boolean }>;
  // Fields from the "fantasy" example in styles.json
  "fantasy-high-fantasy"?: { // This structure is a bit unusual, might need to flatten/normalize
    prompt: string;
    negative_prompt: string;
    model: string;
    // ... other specific properties
  };
  // Catch-all for other properties
  [key: string]: any;
}

const optionSchema = z.object({
  label: z.string(),
  value: z.string(),
  disable: z.boolean().optional(),
});

// Form schema for validation
const formSchema = z.object({
  positivePrompt: z.string().min(2, {
    message: "Prompt must be at least 2 characters.",
  }),
  negativePrompt: z.string().optional(),
  seed: z.string().optional(),
  sampler: z.string(),
  batchSize: z.number().min(1).max(4),
  steps: z.number().min(1).max(50),
  width: z.number().min(256).max(1024),
  height: z.number().min(256).max(1024),
  guidance: z.number().min(1).max(30),
  clipskip: z.number().min(1).max(12),
  model: z.string(),
  karras: z.boolean(),
  nsfw: z.boolean(),
  hires_fix: z.boolean(),
  tiling: z.boolean(),
  publicView: z.boolean(),
  post_processors: z.array(z.string()).default([]),
  restore_faces: z.boolean(),
  controlType: z.string().default("none"),
  xysType: z.boolean().default(false),
  createVideo: z.boolean().default(false),
  multiSelect: z.boolean().default(false),
  multiModel: z.boolean().default(false),
  multiSampler: z.boolean().default(false),
  multiClipSkip: z.boolean().default(false),
  multiSteps: z.boolean().default(false),
  multiHiresFix: z.boolean().default(false),
  multiKarras: z.boolean().default(false),
  multiControlType: z.boolean().default(false),
  generationMode: z.enum(["text-to-image", "image-to-image", "inpainting"]).default("text-to-image"),
  sourceImage: z.string().optional(),
  sourceMask: z.string().optional(),
  denoising_strength: z.number().min(0.01).max(1).default(0.75),
  selectedStyle: z.string().optional(),
});

const samplerListLite = [
  "k_lms",
  "k_heun",
  "k_euler",
  "k_euler_a",
  "k_dpm_2",
  "k_dpm_2_a",
  "DDIM",
];
const dpmSamplers = [
  "k_dpm_fast",
  "k_dpm_adaptive",
  "k_dpmpp_2m",
  "k_dpmpp_2s_a",
  "k_dpmpp_sde",
];

const PostProcessorOptions: Option[] = [
  { value: "animesharp", label: "4xAnimeSharp" },
  { value: "ersgran_x4plus", label: "RealESRGAN_x4plus" },
  { value: "ersgran_x4plus_anime_6b", label: "RealESRGAN_x4plus_anime_6b" },
  { value: "strip_background", label: "Strip Background" },
];
type MetaData = {
  positivePrompt: string;
  negativePrompt: string;
  sampler: string;
  model: string;
  guidance: number;
  publicView: boolean;
};

const ImageGeneratorComponent = ({ user }: { user: User | null }) => {
  const [generateDisabled, setGenerateDisable] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [jobID, setJob] = useState("");
  const { toast } = useToast();
  const [generationHistory, setGenerationHistory] = useState<string[]>([]);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [submittedFormData, setSubmittedFormData] = useState<z.infer<typeof formSchema> | null>(null);
  // Source image states for image-to-image and inpainting
  const [sourceImageFile, setSourceImageFile] = useState<File | null>(null);
  const [sourceImagePreview, setSourceImagePreview] = useState<string | null>(null);
  const [maskImagePreview, setMaskImagePreview] = useState<string | null>(null);
  const [isDrawingMask, setIsDrawingMask] = useState(false);
  
  // State for styles
  const [styles, setStyles] = useState<ImageStyle[]>([]);
  const [selectedStyleName, setSelectedStyleName] = useState<string>("_NONE_");

  // Initialize Supabase client
  const supabase = createSupabaseClient();

  const [metadata, setMetadata] = useState<MetaData>({
    positivePrompt: "",
    negativePrompt: "",
    sampler: "",
    model: "",
    guidance: 1,
    publicView: false,
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      positivePrompt: "",
      negativePrompt: "",
      seed: "",
      sampler: "k_lms",
      batchSize: 4,
      steps: 15,
      width: 512,
      height: 512,
      guidance: 7,
      clipskip: 1,
      model: "",
      karras: false,
      nsfw: false,
      hires_fix: false,
      tiling: false,
      publicView: false,
      post_processors: [],
      restore_faces: false,
      xysType: false,
      createVideo: false,
      generationMode: "text-to-image",
      sourceImage: undefined,
      sourceMask: undefined,
      denoising_strength: 0.75,
      multiSelect: false,
      multiModel: false,
      multiSampler: false,
      multiClipSkip: false,
      multiSteps: false,
      multiHiresFix: false,
      multiKarras: false,
      multiControlType: false,
      selectedStyle: "",
    },
  });

  const {
    data: models,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["models"],
    queryFn: () => fetchAvailableModels(),
    refetchInterval: 60000,
  });

  useEffect(() => {
    // No need to toggle generate disabled anymore
    // Just make sure we have a user
    if (!user) {
      setGenerateDisable(true);
    }
  }, [user]);

  // Load styles from JSON
  useEffect(() => {
    // The styles.json is structured with top-level keys (e.g., "flux", "sdxl") acting as names,
    // and the style configuration object as their value.
    // We need to iterate over entries to preserve these names.
    console.log("Attempting to load stylesData:", stylesData); // Log the raw import
    
    const loadedStyles = Object.entries(stylesData).map(([name, styleProps]) => ({
      name: name, // The key from stylesData is the style name
      ...(styleProps as Omit<ImageStyle, 'name'>) // Spread the rest of the properties
    }));
    
    console.log("Loaded styles after Object.entries and mapping:", loadedStyles); // Log the processed styles
    setStyles(loadedStyles);
  }, []);

  // Effect to apply selected style to the form
  useEffect(() => {
    if (selectedStyleName === "_NONE_" || !selectedStyleName) {
      // If "None (Custom)" is selected, or no style is selected initially,
      // you might want to reset to default values or do nothing,
      // allowing manual input. For now, we'll just log it.
      // Consider if form.reset() or specific field resets are needed here.
      // If you want to clear fields when selecting "None", you could do:
      // form.reset(form.formState.defaultValues); // or specific fields
      // Be mindful of not creating an infinite loop with form.watch or other useEffects.
      // If you want to clear fields when selecting "None", you could do:
      // form.reset(form.formState.defaultValues); // or specific fields
      return;
    }

    const style = styles.find(s => s.name === selectedStyleName);
    if (style) {
      // Helper to safely set value if property exists in style
      const setFormValue = (fieldName: keyof z.infer<typeof formSchema>, value: any) => {
        if (value !== undefined && value !== null) {
          form.setValue(fieldName, value, { shouldValidate: true, shouldDirty: true });
        }
      };

      // Normalize potential nested style structures (like the "fantasy-high-fantasy" example)
      let effectiveStyle = style;
      if (style[style.name] && typeof style[style.name] === 'object') {
        // If the style object has a key that is its own name and contains the actual properties
        effectiveStyle = { ...style, ...style[style.name] };
      }

      // Apply common fields (prompts handled specially)
      let currentPositivePrompt = form.getValues("positivePrompt") || "";
      let currentNegativePrompt = form.getValues("negativePrompt") || "";

      if (effectiveStyle.prompt) {
        let stylePositivePrompt = effectiveStyle.prompt;
        if (stylePositivePrompt.includes("{p}")) {
          stylePositivePrompt = stylePositivePrompt.replace("{p}", currentPositivePrompt).trim();
        } else {
          // If no {p}, decide behavior: prepend, append, or replace.
          // For now, let's assume it's a base prompt to which user input might have been part of {p} or is cleared.
          // If user types AFTER applying style, their text becomes the new {p} if they re-apply or change style.
          // This behavior might need refinement based on desired UX.
          // For a simple approach, if {p} isn't there, the style prompt *is* the new prompt.
        }
        // Replace {np} in positive prompt with current negative prompt
        if (stylePositivePrompt.includes("{np}")) {
          stylePositivePrompt = stylePositivePrompt.replace("{np}", currentNegativePrompt).trim();
        }
        setFormValue("positivePrompt", stylePositivePrompt);
      }

      if (effectiveStyle.negative_prompt) {
        let styleNegativePrompt = effectiveStyle.negative_prompt;
        if (styleNegativePrompt.includes("{np}")) {
          styleNegativePrompt = styleNegativePrompt.replace("{np}", currentNegativePrompt).trim();
        } else {
          // Similar to positive: if no {np}, style's negative prompt is the new base.
        }
        // Replace {p} in negative prompt with current positive prompt (less common, but possible)
        if (styleNegativePrompt.includes("{p}")) {
          styleNegativePrompt = styleNegativePrompt.replace("{p}", currentPositivePrompt).trim();
        }
        setFormValue("negativePrompt", styleNegativePrompt);
      } else if (effectiveStyle.prompt && effectiveStyle.prompt.includes("{np}")) {
        // If the positive prompt from the style used {np} but the style itself doesn't have a dedicated negative_prompt field,
        // it implies the negative part was meant to be extracted. The code above already put currentNegativePrompt into {np}.
        // If currentNegativePrompt was empty, {np} would be replaced by empty string.
        // We might want to explicitly set the negative prompt field if the style prompt suggests one.
        // For example, if style prompt is "good stuff {p} ### bad stuff {np}" and user's NP is empty,
        // then NP field should become "bad stuff". This is a bit complex with current structure.
        // The current logic replaces {np} in the positive prompt string with form's current negative_prompt.
        // If style.negative_prompt is MISSING, but style.prompt had {np}, the NP field won't be separately populated from the style itself.
        // This is tricky. Let's refine based on styles.json structure.
        // A common pattern is `prompt_text###negative_prompt_text`
        if (typeof effectiveStyle.prompt === 'string' && effectiveStyle.prompt.includes('###')) {
          const parts = effectiveStyle.prompt.split('###');
          // Positive part was already processed above (including {p} and {np} replacement)
          // Now, let's see if the second part (intended as negative) exists and set it if NP field is empty or was part of {np}
          if (parts.length > 1 && parts[1].trim() !== "") {
            let potentialNegativeFromSplit = parts[1].trim();
            // If this potential negative contains {np}, replace it with user's current NP
            if (potentialNegativeFromSplit.includes("{np}")){
                potentialNegativeFromSplit = potentialNegativeFromSplit.replace("{np}", currentNegativePrompt).trim();
            }
             // If it contains {p}, replace it with user's current PP
            if (potentialNegativeFromSplit.includes("{p}")){
                potentialNegativeFromSplit = potentialNegativeFromSplit.replace("{p}", currentPositivePrompt).trim();
            }
            // Only set if the style didn't explicitly have a negative_prompt field or if that field was empty
            if (!effectiveStyle.negative_prompt) {
                 setFormValue("negativePrompt", potentialNegativeFromSplit);
            }
          }
        }
      }

      // Model selection logic:
      // styles.json can have 'model' (string) or 'models' (array of strings)
      // We need to pick one that exists in the fetched 'models' list.
      let modelToSet = form.getValues("model"); // Default to current or initial model
      const availableModelNames = models?.map((m: Model) => m.name) || [];

      if (effectiveStyle.model && typeof effectiveStyle.model === 'string') {
        if (availableModelNames.includes(effectiveStyle.model)) {
          modelToSet = effectiveStyle.model;
        } else {
          console.warn(`Style model "${effectiveStyle.model}" not found in available models.`);
        }
      } else if (effectiveStyle.models && Array.isArray(effectiveStyle.models) && effectiveStyle.models.length > 0) {
        // If multiple models are specified in the style, try to find the first one available
        const foundModel = effectiveStyle.models.find(m => availableModelNames.includes(m));
        if (foundModel) {
          modelToSet = foundModel;
        } else {
          console.warn(`None of the style models "${effectiveStyle.models.join(', ')}" found in available models.`);
        }
      }
      setFormValue("model", modelToSet);
      
      // Use effectiveStyle.sampler_name if that's the field in styles.json
      if (effectiveStyle.sampler_name) setFormValue("sampler", effectiveStyle.sampler_name);
      else if (effectiveStyle.sampler) setFormValue("sampler", effectiveStyle.sampler); // Fallback to .sampler

      if (effectiveStyle.seed) setFormValue("seed", String(effectiveStyle.seed)); // Ensure seed is a string
      
      // Ensure numeric values and handle potential strings from JSON
      if (effectiveStyle.steps) setFormValue("steps", Number(effectiveStyle.steps)); 
      if (effectiveStyle.width) setFormValue("width", Number(effectiveStyle.width));
      if (effectiveStyle.height) setFormValue("height", Number(effectiveStyle.height));
      if (effectiveStyle.cfg_scale) setFormValue("guidance", Number(effectiveStyle.cfg_scale)); // Map cfg_scale to guidance
      if (effectiveStyle.clip_skip) setFormValue("clipskip", Number(effectiveStyle.clip_skip)); // Map clip_skip to clipskip

      // For boolean fields, ensure they are explicitly set if present in the style
      if (effectiveStyle.karras !== undefined) setFormValue("karras", effectiveStyle.karras);
      if (effectiveStyle.nsfw !== undefined) setFormValue("nsfw", effectiveStyle.nsfw);
      if (effectiveStyle.hires_fix !== undefined) setFormValue("hires_fix", effectiveStyle.hires_fix);
      if (effectiveStyle.tiling !== undefined) setFormValue("tiling", effectiveStyle.tiling);
      
      // If loras are defined, you might want to append them to the prompt or handle them separately
      if (effectiveStyle.loras && Array.isArray(effectiveStyle.loras)) {
        let promptValue = form.getValues("positivePrompt") || "";
        effectiveStyle.loras.forEach(lora => {
          const loraString = `<lora:${lora.name}:${lora.model || 1}>`; // Assuming lora.model is weight
          if (!promptValue.includes(loraString)) {
            promptValue += ` ${loraString}`;
          }
        });
        setFormValue("positivePrompt", promptValue.trim());
      }

      toast({
        title: "Style Applied",
        description: `"${style.name}" preset has been applied.`,
      });
    }
  }, [selectedStyleName, styles, form, models, toast]); // Added models and toast to dependency array

  const updateMetadata = useImageMetadataStore(
    (state) => state.initializeMetadata
  );

  const resetForm = () => {
    form.reset({
      positivePrompt: "",
      negativePrompt: "",
      seed: "",
      sampler: "k_lms",
      batchSize: 4,
      steps: 15,
      width: 512,
      height: 512,
      guidance: 7,
      clipskip: 1,
      model: form.getValues("model"), // Keep the selected model
      karras: false,
      nsfw: false,
      hires_fix: false,
      tiling: false,
      publicView: false,
      post_processors: [],
      restore_faces: false,
      xysType: false,
      createVideo: false,
      generationMode: "text-to-image",
      sourceImage: undefined,
      sourceMask: undefined,
      denoising_strength: 0.75,
      multiSelect: false,
      multiModel: false,
      multiSampler: false,
      multiClipSkip: false,
      multiSteps: false,
      multiHiresFix: false,
      multiKarras: false,
      multiControlType: false,
      selectedStyle: "",
    });
  };

  const handleSubmit = async (data: z.infer<typeof formSchema>) => {
    console.log("Form submitted with dimensions:", { width: data.width, height: data.height, types: { width: typeof data.width, height: typeof data.height }});
    
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to generate images.",
        variant: "destructive",
      });
      return;
    }

    // Check if sourceImage is required but missing for img2img or inpainting
    if ((data.generationMode === "image-to-image" || data.generationMode === "inpainting") && !data.sourceImage) {
      toast({
        title: "Source Image Required",
        description: `Please upload a source image for ${data.generationMode} mode.`,
        variant: "destructive",
      });
      return;
    }

    // Check if mask is required but missing for inpainting
    if (data.generationMode === "inpainting" && !data.sourceMask) {
      toast({
        title: "Mask Required",
        description: "Please draw a mask on the image for inpainting.",
        variant: "destructive",
      });
      return;
    }

    startTransition(() => {
      setJob('');
      setGeneratedImages([]);
    });

    try {
      // Transform form data for the API
      const imageDetails = transformFormData(data as FormSchema);

      // Set metadata for the image
      setMetadata({
        positivePrompt: data.positivePrompt,
        negativePrompt: data.negativePrompt || "",
        sampler: data.sampler,
        model: data.model,
        guidance: data.guidance,
        publicView: data.publicView,
      });

      // Check if we have kudos to generate
      const kudosResponse = await createImage(
        {
          ...imageDetails,
          dry_run: true,
        },
        user?.id
      );

      if (!kudosResponse.success) {
        toast({
          title: "Error",
          description: kudosResponse.message || "Failed to check kudos.",
          variant: "destructive",
        });
        return;
      }

      if (kudosResponse.kudos && kudosResponse.kudos > 0) {
        // Handle kudos logic
      }

      // Create image generation job
      const response = await createImage(imageDetails, user?.id);

      if (!response.success) {
        if (response.message) {
          toast({
            title: "Error",
            description: response.message,
            variant: "destructive",
          });
        } else {
          console.error("Failed to create image generation job:", response);
          toast({
            title: "Error",
            description: "Failed to start image generation. Please try again.",
            variant: "destructive",
          });
        }
        return;
      }

      if (response.jobId) {
        const jobId = response.jobId;
        setSubmittedFormData(data);
        setJob(jobId);
        toast({
          title: "Success",
          description: "Image generation started. Please wait...",
        });
      }

      // Save the submitted prompt to history
      const promptKey = `prompt_${Date.now()}`;
      localStorage.setItem(promptKey, JSON.stringify(data));
    } catch (error) {
      console.error("Error submitting form:", error);
      toast({
        title: "Error",
        description: "An error occurred while submitting the form.",
        variant: "destructive",
      });
    }
  };

  const handleImagesLoaded = (images: GeneratedImage[]) => {
    // Potentially update UI or state when images are loaded by the carousel
  };

  return (
    <div className="flex flex-col items-center justify-center w-full">
      <Card className="bg-transparent border-0 w-full">
        <CardContent className="flex flex-col items-center justify-center w-full p-0">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="w-full">
              <div className="bg-zinc-900/60 rounded-xl border border-zinc-800/60 p-5 shadow-md mb-6">
                <h3 className="text-lg font-medium text-zinc-200 mb-4 flex items-center">
                  <span className="mr-2">🔄</span> Generation Mode
                </h3>
                
                <FormField
                  control={form.control}
                  name="generationMode"
                  render={({ field }) => (
                    <FormItem>
                      <div className="grid grid-cols-3 gap-4 mt-2">
                        <Button
                          type="button"
                          variant={field.value === "text-to-image" ? "default" : "outline"}
                          className={`flex flex-col items-center justify-center p-3 h-auto ${
                            field.value === "text-to-image" ? "border-2 border-indigo-500" : ""
                          }`}
                          onClick={() => field.onChange("text-to-image")}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-2"><path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z"></path><path d="m2 14 2.5-2.5 3 3"></path><path d="m18 10-3-3-6 6"></path></svg>
                          <span className="text-sm">Text to Image</span>
                        </Button>
                        <Button
                          type="button"
                          variant={field.value === "image-to-image" ? "default" : "outline"}
                          className={`flex flex-col items-center justify-center p-3 h-auto ${
                            field.value === "image-to-image" ? "border-2 border-indigo-500" : ""
                          }`}
                          onClick={() => field.onChange("image-to-image")}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-2"><path d="M21 9v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h10"></path><path d="m21 2-9 9"></path><path d="m15 5 6-6"></path></svg>
                          <span className="text-sm">Image to Image</span>
                        </Button>
                        <Button
                          type="button"
                          variant={field.value === "inpainting" ? "default" : "outline"}
                          className={`flex flex-col items-center justify-center p-3 h-auto ${
                            field.value === "inpainting" ? "border-2 border-indigo-500" : ""
                          }`}
                          onClick={() => field.onChange("inpainting")}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-2"><path d="M19 15V9c0-3.3-2.7-6-6-6H9a6 6 0 0 0-6 6v6"></path><path d="M19 15a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h14Z"></path><path d="M12 7v6"></path><path d="M9 10h6"></path></svg>
                          <span className="text-sm">Inpainting</span>
                        </Button>
                      </div>
                    </FormItem>
                  )}
                />
              </div>
              
              {/* Style Selector */}
              {styles && styles.length > 0 && (
                <div className="bg-zinc-900/60 rounded-xl border border-zinc-800/60 p-5 shadow-md mb-6">
                  <h3 className="text-lg font-medium text-zinc-200 mb-4 flex items-center">
                    <Sparkles className="w-5 h-5 mr-2 text-indigo-400" /> Style Preset
                    {selectedStyleName !== "_NONE_" && (
                      <span className="ml-2 text-xs bg-purple-500/20 text-purple-300 px-2 py-1 rounded">
                        Active - Parameters Locked
                      </span>
                    )}
                  </h3>
                  <FormField
                    control={form.control}
                    name="selectedStyle" // This name is temporary for the Select, actual form fields are updated by useEffect
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="sr-only">Style Preset</FormLabel>
                        <Select
                          onValueChange={(value) => setSelectedStyleName(value)}
                          value={selectedStyleName}
                        >
                          <FormControl>
                            <SelectTrigger className="bg-zinc-950/50 border-zinc-800 focus:border-purple-500 transition-colors">
                              <SelectValue placeholder="Select a style preset..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-zinc-950 border-zinc-800">
                            <SelectItem value="_NONE_">None (Custom)</SelectItem>
                            {styles.map((style, index) => {
                              console.log("Rendering SelectItem for style:", style.name, "Type:", typeof style.name, "Value to be used:", style.name);
                              return (
                                <SelectItem key={style.name || index} value={style.name}>
                                  {style.name}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        <FormDescription className="mt-2 text-zinc-400">
                          Apply predefined settings from a style template.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {(form.watch("generationMode") === "image-to-image" || form.watch("generationMode") === "inpainting") && (
                <div className="bg-zinc-900/60 rounded-xl border border-zinc-800/60 p-5 shadow-md mb-6">
                  <h3 className="text-lg font-medium text-zinc-200 mb-4 flex items-center">
                    <span className="mr-2">🖼️</span> Source Image
                  </h3>
                  
                  {!sourceImagePreview ? (
                    <ImageUploader
                      onImageSelect={(base64Image, file) => {
                        setSourceImageFile(file);
                        setSourceImagePreview(base64Image);
                        form.setValue("sourceImage", base64Image);
                      }}
                      onClearImage={() => {
                        setSourceImageFile(null);
                        setSourceImagePreview(null);
                        form.setValue("sourceImage", undefined);
                        setMaskImagePreview(null);
                        form.setValue("sourceMask", undefined);
                      }}
                      previewImage={sourceImagePreview}
                      label="Upload or drop an image"
                    />
                  ) : form.watch("generationMode") === "inpainting" && !maskImagePreview ? (
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-medium">Draw Mask</h3>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            setSourceImagePreview(null);
                            form.setValue("sourceImage", undefined);
                          }}
                        >
                          Change Image
                        </Button>
                      </div>
                      <div className="bg-zinc-950 rounded-lg p-4">
                        <MaskCanvas
                          sourceImage={sourceImagePreview}
                          onSaveMask={(maskDataUrl) => {
                            setMaskImagePreview(maskDataUrl);
                            form.setValue("sourceMask", maskDataUrl);
                          }}
                          width={512}
                          height={512}
                        />
                      </div>
                    </div>
                  ) : form.watch("generationMode") === "inpainting" ? (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-medium">Masked Image</h3>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            setMaskImagePreview(null);
                            form.setValue("sourceMask", undefined);
                          }}
                        >
                          Redraw Mask
                        </Button>
                      </div>
                      <div className="relative border border-zinc-700 rounded-lg overflow-hidden aspect-square">
                        <div className="absolute inset-0">
                          <img 
                            src={sourceImagePreview} 
                            alt="Source" 
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <div className="absolute inset-0 mix-blend-overlay">
                          <img 
                            src={maskImagePreview || ""} 
                            alt="Mask" 
                            className="w-full h-full object-contain"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-medium">Source Image</h3>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            setSourceImagePreview(null);
                            form.setValue("sourceImage", undefined);
                          }}
                        >
                          Change Image
                        </Button>
                      </div>
                      <div className="border border-zinc-700 rounded-lg overflow-hidden">
                        <div className="aspect-square relative">
                          <img 
                            src={sourceImagePreview} 
                            alt="Source" 
                            className="w-full h-full object-contain"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {(sourceImagePreview && (form.watch("generationMode") === "image-to-image" || 
                     (form.watch("generationMode") === "inpainting" && maskImagePreview))) && (
                    <div className="mt-4">
                      <FormField
                        control={form.control}
                        name="denoising_strength"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-zinc-300">Denoising Strength</FormLabel>
                            <div className="flex items-center space-x-2">
                              <FormControl>
                                <Slider
                                  value={[field.value]}
                                  min={0.01}
                                  max={1}
                                  step={0.01}
                                  onValueChange={(vals) => field.onChange(vals[0])}
                                />
                              </FormControl>
                              <span className="w-12 text-center">{field.value.toFixed(2)}</span>
                            </div>
                            <FormDescription>
                              {form.watch("generationMode") === "image-to-image" 
                                ? "Lower values preserve more of the original image. Higher values allow more creativity." 
                                : "Controls how much the masked area will be changed"}
                            </FormDescription>
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-6">
                  {user && (
                    <div className="mb-6">
                      <ActiveJobsPanel onJobComplete={setGeneratedImages} />
                    </div>
                  )}
                  
                  <div className="bg-zinc-900/60 rounded-xl border border-zinc-800/60 p-5 shadow-md">
                    <h3 className="text-lg font-medium text-zinc-200 mb-4 flex items-center">
                      <span className="mr-2">✨</span> Prompt
                    </h3>
                    
                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="positivePrompt"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-zinc-300">Positive Prompt</FormLabel>
                            <FormControl>
                              <Textarea 
                                placeholder="Describe what you want to see in the image..." 
                                className="min-h-24 bg-zinc-950/50 border-zinc-800 focus:border-purple-500 transition-colors" 
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="negativePrompt"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-zinc-300 flex items-center gap-2">
                              Negative Prompt
                              <ToolTipComponent tooltipText="Specify what you don't want to see in the image" />
                            </FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Elements to exclude from the image..."
                                className="bg-zinc-950/50 border-zinc-800 focus:border-purple-500 transition-colors"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="seed"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-zinc-300 flex items-center gap-2">
                              Seed
                              <ToolTipComponent tooltipText="Use a specific seed for reproducible results" />
                            </FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Leave empty for random seed"
                                className="bg-zinc-950/50 border-zinc-800 focus:border-purple-500 transition-colors"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                  
                  <div className="bg-zinc-900/60 rounded-xl border border-zinc-800/60 p-5 shadow-md">
                    <h3 className="text-lg font-medium text-zinc-200 mb-4 flex items-center">
                      <span className="mr-2">⚙️</span> Advanced Settings
                    </h3>
                    
                    <Accordion type="single" collapsible className="w-full">
                      <AccordionItem value="model" className="border-zinc-800">
                        <AccordionTrigger className="text-zinc-300 hover:text-white">
                          <span className="mr-2">🧠</span> Model Selection
                          {selectedStyleName !== "_NONE_" && (
                            <span className="ml-2 text-xs bg-purple-500/20 text-purple-300 px-2 py-1 rounded">
                              Locked by Style
                            </span>
                          )}
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-4 mt-2">
                            <FormField
                              control={form.control}
                              name="model"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-zinc-300">Model</FormLabel>
                                  <Select
                                    onValueChange={field.onChange}
                                    value={field.value}
                                    disabled={selectedStyleName !== "_NONE_"}
                                  >
                                    <FormControl>
                                      <SelectTrigger className="bg-zinc-950/50 border-zinc-800 focus:border-purple-500 transition-colors disabled:opacity-50">
                                        <SelectValue placeholder="Select a model" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent className="bg-zinc-950 border-zinc-800">
                                      <SelectGroup>
                                        <SelectLabel>Available Models</SelectLabel>
                                        {models?.map((model: Model) => (
                                          <SelectItem
                                            key={model.name}
                                            value={model.name}
                                            disabled={model.count === 0}
                                          >
                                            {model.name} ({model.count} workers)
                                          </SelectItem>
                                        ))}
                                      </SelectGroup>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                      
                      <AccordionItem value="dimensions" className="border-zinc-800">
                        <AccordionTrigger className="text-zinc-300 hover:text-white">Dimensions</AccordionTrigger>
                        <AccordionContent>
                          <div className="grid grid-cols-2 gap-4 mt-2">
                            <FormField
                              control={form.control}
                              name="width"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-zinc-300">Width</FormLabel>
                                  <Select
                                    onValueChange={(value) => {
                                      const numValue = parseInt(value, 10);
                                      console.log("Width changed to:", numValue, typeof numValue);
                                      field.onChange(numValue);
                                    }}
                                    value={field.value.toString()}
                                    disabled={selectedStyleName !== "_NONE_"}
                                  >
                                    <FormControl>
                                      <SelectTrigger className="bg-zinc-950/50 border-zinc-800 disabled:opacity-50">
                                        <SelectValue placeholder="Width" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent className="bg-zinc-950 border-zinc-800">
                                      <SelectItem value="512">512px</SelectItem>
                                      <SelectItem value="768">768px</SelectItem>
                                      <SelectItem value="1024">1024px</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            
                            <FormField
                              control={form.control}
                              name="height"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-zinc-300">Height</FormLabel>
                                  <Select
                                    onValueChange={(value) => field.onChange(parseInt(value, 10))}
                                    value={field.value.toString()}
                                    disabled={selectedStyleName !== "_NONE_"}
                                  >
                                    <FormControl>
                                      <SelectTrigger className="bg-zinc-950/50 border-zinc-800 disabled:opacity-50">
                                        <SelectValue placeholder="Height" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent className="bg-zinc-950 border-zinc-800">
                                      <SelectItem value="512">512px</SelectItem>
                                      <SelectItem value="768">768px</SelectItem>
                                      <SelectItem value="1024">1024px</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                      
                      <AccordionItem value="quality" className="border-zinc-800">
                        <AccordionTrigger className="text-zinc-300 hover:text-white">Quality Settings</AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-4 mt-2">
                            <FormField
                              control={form.control}
                              name="steps"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-zinc-300 flex items-center gap-2">
                                    Steps
                                    <ToolTipComponent tooltipText="Higher values produce more detailed images but take longer" />
                                  </FormLabel>
                                  <FormControl>
                                    <SliderWithCounter
                                      min={1}
                                      max={50}
                                      step={1}
                                      value={field.value}
                                      onValueChange={field.onChange}
                                      disabled={selectedStyleName !== "_NONE_"}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            
                            <FormField
                              control={form.control}
                              name="guidance"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-zinc-300 flex items-center gap-2">
                                    Guidance Scale
                                    <ToolTipComponent tooltipText="How closely to follow your prompt (higher = more faithful)" />
                                  </FormLabel>
                                  <FormControl>
                                    <SliderWithCounter
                                      min={1}
                                      max={20}
                                      step={0.5}
                                      value={field.value}
                                      onValueChange={field.onChange}
                                      disabled={selectedStyleName !== "_NONE_"}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            
                            <FormField
                              control={form.control}
                              name="batchSize"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-zinc-300 flex items-center gap-2">
                                    Batch Size
                                    <ToolTipComponent tooltipText="Number of images to generate at once" />
                                  </FormLabel>
                                  <FormControl>
                                    <SliderWithCounter
                                      min={1}
                                      max={4}
                                      step={1}
                                      value={field.value}
                                      onValueChange={field.onChange}
                                      disabled={selectedStyleName !== "_NONE_"}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                      
                      <AccordionItem value="sampler" className="border-zinc-800">
                        <AccordionTrigger className="text-zinc-300 hover:text-white">Sampler</AccordionTrigger>
                        <AccordionContent>
                          <FormField
                            control={form.control}
                            name="sampler"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-zinc-300 text-xs">Sampler</FormLabel>
                                <Select
                                  onValueChange={field.onChange}
                                  value={field.value}
                                  disabled={selectedStyleName !== "_NONE_"}
                                >
                                  <FormControl>
                                    <SelectTrigger className="bg-zinc-950/50 border-zinc-800/50 focus:border-indigo-500/50 focus:ring-indigo-500/10 placeholder-zinc-600 text-white disabled:opacity-50">
                                      <SelectValue placeholder="Select a sampler" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent className="bg-zinc-900 border-zinc-800">
                                    <SelectItem value="k_euler">k_euler</SelectItem>
                                    <SelectItem value="k_euler_ancestral">k_euler_ancestral</SelectItem>
                                    <SelectItem value="k_heun">k_heun</SelectItem>
                                    <SelectItem value="k_lms">k_lms</SelectItem>
                                    <SelectItem value="k_dpm_2">k_dpm_2</SelectItem>
                                    <SelectItem value="k_dpm_2_ancestral">k_dpm_2_ancestral</SelectItem>
                                    <SelectItem value="k_dpmpp_2s_ancestral">k_dpmpp_2s_ancestral</SelectItem>
                                    <SelectItem value="k_dpmpp_2m">k_dpmpp_2m</SelectItem>
                                    <SelectItem value="k_dpmpp_sde">k_dpmpp_sde</SelectItem>
                                    <SelectItem value="DDIM">DDIM</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </AccordionContent>
                      </AccordionItem>
                      
                      <AccordionItem value="options" className="border-zinc-800/50">
                        <AccordionTrigger className="text-white py-3 hover:text-indigo-300 transition-colors">
                          <div className="flex items-center">
                            <Settings className="h-4 w-4 mr-2 text-indigo-400" />
                            Additional Options
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4 pb-2">
                            <FormField
                              control={form.control}
                              name="karras"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border border-zinc-800/50 bg-zinc-950/30 p-3 transition-all hover:border-zinc-700/50">
                                  <div className="space-y-0.5">
                                    <FormLabel className="text-zinc-300">Karras</FormLabel>
                                    <FormDescription className="text-xs text-zinc-500">
                                      Use Karras noise scheduling
                                    </FormDescription>
                                  </div>
                                  <FormControl>
                                    <Switch
                                      checked={field.value}
                                      onCheckedChange={field.onChange}
                                      disabled={selectedStyleName !== "_NONE_"}
                                      className="data-[state=checked]:bg-indigo-500 disabled:opacity-50"
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                            
                            <FormField
                              control={form.control}
                              name="hires_fix"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border border-zinc-800/50 bg-zinc-950/30 p-3 transition-all hover:border-zinc-700/50">
                                  <div className="space-y-0.5">
                                    <FormLabel className="text-zinc-300">Hires Fix</FormLabel>
                                    <FormDescription className="text-xs text-zinc-500">
                                      Improve high-resolution image quality
                                    </FormDescription>
                                  </div>
                                  <FormControl>
                                    <Switch
                                      checked={field.value}
                                      onCheckedChange={field.onChange}
                                      className="data-[state=checked]:bg-indigo-500"
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                            
                            <FormField
                              control={form.control}
                              name="tiling"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border border-zinc-800/50 bg-zinc-950/30 p-3 transition-all hover:border-zinc-700/50">
                                  <div className="space-y-0.5">
                                    <FormLabel className="text-zinc-300">Tiling</FormLabel>
                                    <FormDescription className="text-xs text-zinc-500">
                                      Generate seamless tileable images
                                    </FormDescription>
                                  </div>
                                  <FormControl>
                                    <Switch
                                      checked={field.value}
                                      onCheckedChange={field.onChange}
                                      className="data-[state=checked]:bg-indigo-500"
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          
                            <FormField
                              control={form.control}
                              name="nsfw"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border border-zinc-800/50 bg-zinc-950/30 p-3 transition-all hover:border-zinc-700/50">
                                  <div className="space-y-0.5">
                                    <FormLabel className="text-zinc-300">NSFW</FormLabel>
                                    <FormDescription className="text-xs text-zinc-500">
                                      Allow NSFW content generation
                                    </FormDescription>
                                  </div>
                                  <FormControl>
                                    <Switch
                                      checked={field.value}
                                      onCheckedChange={field.onChange}
                                      className="data-[state=checked]:bg-indigo-500"
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                            
                            <FormField
                              control={form.control}
                              name="restore_faces"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border border-zinc-800/50 bg-zinc-950/30 p-3 transition-all hover:border-zinc-700/50">
                                  <div className="space-y-0.5">
                                    <FormLabel className="text-zinc-300">Restore Faces</FormLabel>
                                    <FormDescription className="text-xs text-zinc-500">
                                      Enhance facial features in generated images
                                    </FormDescription>
                                  </div>
                                  <FormControl>
                                    <Switch
                                      checked={field.value}
                                      onCheckedChange={field.onChange}
                                      className="data-[state=checked]:bg-indigo-500"
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                            
                            <FormField
                              control={form.control}
                              name="publicView"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border border-zinc-800/50 bg-zinc-950/30 p-3 transition-all hover:border-zinc-700/50">
                                  <div className="space-y-0.5">
                                    <FormLabel className="text-zinc-300">Public View</FormLabel>
                                    <FormDescription className="text-xs text-zinc-500">
                                      Allow others to see your generated images
                                    </FormDescription>
                                  </div>
                                  <FormControl>
                                    <Switch
                                      checked={field.value}
                                      onCheckedChange={field.onChange}
                                      className="data-[state=checked]:bg-indigo-500"
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </div>
                        </AccordionContent>
                      </AccordionItem>

                      <AccordionItem value="postprocessors" className="border-zinc-800">
                        <AccordionTrigger className="text-zinc-300 hover:text-white">Post-processors</AccordionTrigger>
                        <AccordionContent>
                          <FormField
                            control={form.control}
                            name="post_processors"
                            render={({ field }) => (
                              <FormItem className="mt-2">
                                <FormLabel className="text-zinc-300">Post-processors</FormLabel>
                                <Select
                                  onValueChange={(value) => field.onChange([...field.value, value])}
                                >
                                  <FormControl>
                                    <SelectTrigger className="bg-zinc-950/50 border-zinc-800">
                                      <SelectValue placeholder="Select post-processors" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent className="bg-zinc-950 border-zinc-800">
                                    <SelectItem value="GFPGAN">GFPGAN</SelectItem>
                                    <SelectItem value="CodeFormers">CodeFormers</SelectItem>
                                    <SelectItem value="RealESRGAN_x4plus">RealESRGAN x4plus</SelectItem>
                                    <SelectItem value="RealESRGAN_x2plus">RealESRGAN x2plus</SelectItem>
                                    <SelectItem value="NMKD_Siax">NMKD Siax</SelectItem>
                                    <SelectItem value="4x_AnimeSharp">4x AnimeSharp</SelectItem>
                                  </SelectContent>
                                </Select>
                                {field.value.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {field.value.map((processor, index) => (
                                      <div key={index} className="flex items-center bg-zinc-800 rounded-md px-2 py-1">
                                        <span className="text-xs text-zinc-300">{processor}</span>
                                        <button
                                          type="button"
                                          className="ml-2 text-zinc-400 hover:text-zinc-200"
                                          onClick={() => {
                                            const newProcessors = [...field.value];
                                            newProcessors.splice(index, 1);
                                            field.onChange(newProcessors);
                                          }}
                                        >
                                          ×
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </AccordionContent>
                      </AccordionItem>

                      <AccordionItem value="multi" className="border-zinc-800">
                        <AccordionTrigger className="text-zinc-300 hover:text-white">Multi-Select Options</AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-4 mt-2">
                            <FormField
                              control={form.control}
                              name="multiSelect"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border border-zinc-800 p-3">
                                  <div className="space-y-0.5">
                                    <FormLabel className="text-zinc-300">Multi Select</FormLabel>
                                    <FormDescription className="text-xs text-zinc-500">
                                      Enable multiple selection options
                                    </FormDescription>
                                  </div>
                                  <FormControl>
                                    <Switch
                                      checked={field.value}
                                      onCheckedChange={field.onChange}
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="multiModel"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border border-zinc-800 p-3">
                                  <div className="space-y-0.5">
                                    <FormLabel className="text-zinc-300">Multi Model</FormLabel>
                                    <FormDescription className="text-xs text-zinc-500">
                                      Use multiple models for generation
                                    </FormDescription>
                                  </div>
                                  <FormControl>
                                    <Switch
                                      checked={field.value}
                                      onCheckedChange={field.onChange}
                                      disabled={!form.getValues("multiSelect")}
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="multiSampler"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border border-zinc-800 p-3">
                                  <div className="space-y-0.5">
                                    <FormLabel className="text-zinc-300">Multi Sampler</FormLabel>
                                    <FormDescription className="text-xs text-zinc-500">
                                      Use multiple samplers for generation
                                    </FormDescription>
                                  </div>
                                  <FormControl>
                                    <Switch
                                      checked={field.value}
                                      onCheckedChange={field.onChange}
                                      disabled={!form.getValues("multiSelect")}
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="multiClipSkip"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border border-zinc-800 p-3">
                                  <div className="space-y-0.5">
                                    <FormLabel className="text-zinc-300">Multi CLIP Skip</FormLabel>
                                    <FormDescription className="text-xs text-zinc-500">
                                      Use multiple CLIP skip values
                                    </FormDescription>
                                  </div>
                                  <FormControl>
                                    <Switch
                                      checked={field.value}
                                      onCheckedChange={field.onChange}
                                      disabled={!form.getValues("multiSelect")}
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="multiSteps"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border border-zinc-800 p-3">
                                  <div className="space-y-0.5">
                                    <FormLabel className="text-zinc-300">Multi Steps</FormLabel>
                                    <FormDescription className="text-xs text-zinc-500">
                                      Use multiple step values
                                    </FormDescription>
                                  </div>
                                  <FormControl>
                                    <Switch
                                      checked={field.value}
                                      onCheckedChange={field.onChange}
                                      disabled={!form.getValues("multiSelect")}
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </div>
                  
                  <div className="flex justify-center mt-8">
                    <Button
                      type="submit"
                      disabled={isPending || !form.formState.isValid}
                      className="w-full md:w-auto px-8 py-6 text-lg font-medium bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:from-indigo-600 hover:via-purple-600 hover:to-pink-600 text-white rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl"
                    >
                      {isPending ? (
                        <div className="flex items-center gap-2">
                          <LoadingSpinner size="sm" />
                          <span>Generating...</span>
                        </div>
                      ) : (
                        "Generate Image"
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {jobID && (
        <div className="w-full mt-8">
          <ImageCarousel
            jobId={jobID}
            userId={user?.id}
            submittedMetadata={submittedFormData}
            onImagesLoaded={handleImagesLoaded}
          />
        </div>
      )}
      
      {!jobID && generatedImages.length > 0 && (
        <div className="w-full mt-8">
          <h2 className="text-xl font-semibold mb-4">Generated Images</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {generatedImages.map((image, index) => (
              <div key={index} className="relative aspect-square rounded-lg overflow-hidden border border-zinc-800">
                {image.img_url ? (
                  <img 
                    src={image.img_url} 
                    alt={`Generated image ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                ) : image.base64String ? (
                  <img 
                    src={image.base64String} 
                    alt={`Generated image ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-zinc-900">
                    <p className="text-zinc-500">Image not available</p>
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-2 text-xs">
                  Seed: {image.seed || 'Unknown'}
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <button className="absolute top-2 right-2 text-zinc-400 hover:text-zinc-200">
                      <Eye size={20} />
                    </button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <img 
                      src={image.img_url || image.base64String} 
                      alt={`Generated image ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </DialogContent>
                </Dialog>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageGeneratorComponent;
