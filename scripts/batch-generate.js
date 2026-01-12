#!/usr/bin/env node
/**
 * Batch Image Generator for AIPG Gallery
 * Generates diverse images using variable combinations
 * Runs continuously, adding completed images to gallery
 */

const fs = require('fs');
const path = require('path');

const API_URL = 'http://localhost:4000/api';
const GRID_API = 'https://api.aipowergrid.io/api/v2';
const GALLERY_PATH = './data/gallery.json';

// Portrait settings for Lexica-style images
const PORTRAIT_PARAMS = {
  width: 832,
  height: 1216,
  steps: 28,
  cfgScale: 4,
  sampler: "euler",
  scheduler: "normal"
};

// ============ VARIABLE POOLS ============

const ANIMALS = [
  'wolf', 'fox', 'owl', 'eagle', 'dragon', 'phoenix', 'tiger', 'lion',
  'deer', 'bear', 'raven', 'hawk', 'panther', 'leopard', 'elephant',
  'horse', 'unicorn', 'griffin', 'serpent', 'butterfly', 'hummingbird',
  'whale', 'dolphin', 'octopus', 'jellyfish', 'koi fish', 'peacock',
  'crane', 'swan', 'cat', 'rabbit', 'red panda', 'arctic fox', 'snow leopard'
];

const PEOPLE = [
  'elderly man with weathered face', 'young woman with freckles',
  'child with curious expression', 'athlete in motion', 'dancer mid-leap',
  'musician playing instrument', 'craftsman at work', 'fisherman at sea',
  'farmer in fields', 'chef in kitchen', 'artist in studio',
  'scientist in lab', 'firefighter in gear', 'doctor in scrubs',
  'indigenous elder', 'street vendor', 'ballerina', 'boxer'
];

const CHARACTERS = [
  'elderly gentleman', 'young professional woman', 'rugged outdoorsman',
  'elegant lady', 'weathered fisherman', 'wise grandmother',
  'strong athlete', 'graceful dancer', 'intense musician',
  'thoughtful artist', 'confident businessperson', 'gentle nurse',
  'brave firefighter', 'curious scientist', 'skilled craftsman',
  'serene yoga instructor', 'passionate chef', 'dedicated teacher'
];

const OBJECTS = [
  'vintage camera', 'leather journal', 'antique pocket watch', 'coffee cup',
  'worn leather boots', 'musical instrument', 'garden tools', 'fishing rod',
  'paintbrushes', 'old photographs', 'handwritten letters', 'ceramic vase',
  'wooden chess set', 'telescope', 'microscope', 'vintage typewriter',
  'sports equipment', 'cooking utensils', 'medical stethoscope', 'tools'
];

const SETTINGS = [
  'African savanna', 'Amazon rainforest', 'Arctic tundra', 'mountain meadow',
  'misty forest at dawn', 'rocky coastline', 'desert dunes', 'snowy peaks',
  'autumn forest', 'tropical beach', 'redwood forest', 'alpine lake',
  'Scottish highlands', 'Japanese garden', 'Icelandic landscape', 'canyon',
  'wetlands at sunrise', 'prairie grasslands', 'bamboo grove', 'coral reef',
  'urban cityscape', 'abandoned warehouse', 'modern studio', 'vintage interior'
];

const STYLES = [
  'photorealistic', 'hyperrealistic', 'ultra realistic photograph',
  'cinematic photography', 'professional photography', 'DSLR photo',
  'National Geographic photo', 'award-winning photography',
  'studio lighting photograph', '8k UHD photograph', 'raw photo',
  'detailed realistic render', 'Unreal Engine 5 photorealism'
];

const LIGHTING = [
  'golden hour lighting', 'dramatic side lighting', 'soft natural light',
  'studio lighting', 'Rembrandt lighting', 'butterfly lighting',
  'backlit with rim light', 'overcast diffused light', 'harsh sunlight',
  'blue hour lighting', 'window light', 'three-point lighting',
  'high contrast lighting', 'cinematic lighting', 'natural ambient light'
];

const MOODS = [
  'contemplative', 'peaceful', 'intense', 'joyful', 'nostalgic',
  'melancholic', 'triumphant', 'serene', 'focused', 'candid',
  'raw', 'authentic', 'intimate', 'powerful', 'natural'
];

const COLORS = [
  'natural color palette', 'muted earth tones', 'warm golden hues',
  'cool desaturated tones', 'rich autumn colors', 'soft pastels',
  'high contrast black and white', 'warm skin tones', 'natural greens',
  'sunset warm tones', 'blue hour cool tones', 'neutral palette'
];

// ============ PROMPT TEMPLATES ============

const TEMPLATES = [
  // Realistic animal portraits
  {
    template: "wildlife photograph of a {animal}, {style}, {lighting}, sharp focus, detailed fur and eyes, nature documentary style, depth of field, 85mm lens",
    vars: ['animal', 'style', 'lighting'],
    category: 'animal'
  },
  // Realistic portraits
  {
    template: "professional portrait photograph of a {character}, {style}, {lighting}, detailed skin texture, catchlights in eyes, shallow depth of field, shot on Canon EOS R5",
    vars: ['character', 'style', 'lighting'],
    category: 'portrait'
  },
  // Cinematic scenes
  {
    template: "cinematic still of {animal} in {setting}, {style}, {lighting}, anamorphic lens flare, film grain, movie scene composition, dramatic atmosphere",
    vars: ['animal', 'setting', 'style', 'lighting'],
    category: 'cinematic'
  },
  // Nature photography
  {
    template: "{animal} in natural habitat, {setting}, {style}, {lighting}, National Geographic style, crystal clear detail, environmental portrait",
    vars: ['animal', 'setting', 'style', 'lighting'],
    category: 'nature'
  },
  // Dramatic portraits
  {
    template: "dramatic close-up portrait of {character}, {style}, {lighting}, intense eyes, detailed skin pores, Rembrandt lighting, dark moody background",
    vars: ['character', 'style', 'lighting'],
    category: 'dramatic'
  },
  // Action wildlife
  {
    template: "{animal} in motion, action shot, {style}, {lighting}, frozen movement, water droplets, dynamic pose, sports photography style",
    vars: ['animal', 'style', 'lighting'],
    category: 'action'
  },
  // Environmental portraits
  {
    template: "{character} in {setting}, environmental portrait, {style}, {lighting}, storytelling composition, authentic atmosphere, editorial photography",
    vars: ['character', 'setting', 'style', 'lighting'],
    category: 'environmental'
  },
  // Macro nature
  {
    template: "extreme close-up macro photograph of {animal}, {style}, {lighting}, intricate details, compound eyes, fine textures, studio macro photography",
    vars: ['animal', 'style', 'lighting'],
    category: 'macro'
  },
  // Golden hour
  {
    template: "{animal} silhouette at {setting}, golden hour, {style}, sun rays, lens flare, warm color palette, breathtaking landscape photography",
    vars: ['animal', 'setting', 'style'],
    category: 'golden'
  },
  // Studio portrait
  {
    template: "studio photograph of {animal}, {style}, {lighting}, clean background, professional pet photography, sharp details, rim lighting",
    vars: ['animal', 'style', 'lighting'],
    category: 'studio'
  }
];

// ============ HELPER FUNCTIONS ============

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generatePrompt() {
  const template = pickRandom(TEMPLATES);
  let prompt = template.template;
  
  const varMap = {
    'animal': ANIMALS,
    'person': PEOPLE,
    'character': CHARACTERS,
    'object': OBJECTS,
    'setting': SETTINGS,
    'style': STYLES,
    'lighting': LIGHTING,
    'mood': MOODS,
    'colors': COLORS
  };
  
  for (const varName of template.vars) {
    const pool = varMap[varName];
    if (pool) {
      prompt = prompt.replace(`{${varName}}`, pickRandom(pool));
    }
  }
  
  return { prompt, category: template.category };
}

async function submitJob(prompt, negative = 'cartoon, anime, illustration, painting, drawing, art, sketch, cgi, 3d render, unrealistic, fake, plastic, oversaturated, blurry, low quality, deformed, ugly, bad anatomy, watermark, text') {
  const payload = {
    modelId: 'flux.1-krea-dev',
    prompt: prompt,
    negativePrompt: negative,
    nsfw: false,
    public: true,
    params: PORTRAIT_PARAMS
  };

  const response = await fetch(`${API_URL}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  return await response.json();
}

async function checkJobStatus(jobId) {
  const response = await fetch(`${GRID_API}/generate/status/${jobId}`);
  return await response.json();
}

async function waitForJob(jobId, maxWait = 600000) { // 10 min max
  const start = Date.now();
  
  while (Date.now() - start < maxWait) {
    const status = await checkJobStatus(jobId);
    
    if (status.done) {
      return status;
    }
    if (status.faulted) {
      throw new Error('Job faulted');
    }
    
    // Wait 10 seconds between checks
    await new Promise(r => setTimeout(r, 10000));
  }
  
  throw new Error('Job timed out');
}

function addToGallery(jobId, prompt, generationId, category) {
  const gallery = JSON.parse(fs.readFileSync(GALLERY_PATH, 'utf8'));
  
  const item = {
    jobId: jobId,
    modelId: 'flux.1-krea-dev',
    modelName: 'FLUX.1 Krea Dev',
    prompt: prompt,
    negativePrompt: 'blurry, low quality, deformed',
    type: 'image',
    isNsfw: false,
    isPublic: true,
    walletAddress: '',
    createdAt: Date.now(),
    generationIds: [generationId],
    mediaUrls: [`https://images.aipg.art/${generationId}.webp`],
    params: PORTRAIT_PARAMS,
    tags: [category]
  };
  
  gallery.unshift(item);
  fs.writeFileSync(GALLERY_PATH, JSON.stringify(gallery, null, 2));
  
  return item;
}

async function checkWorkersOnline() {
  try {
    const response = await fetch(`${GRID_API}/status/models`);
    const models = await response.json();
    const flux = models.find(m => m.name === 'flux.1-krea-dev');
    return flux && flux.count > 0;
  } catch {
    return false;
  }
}

// ============ MAIN LOOP ============

async function generateOne() {
  const { prompt, category } = generatePrompt();
  
  console.log(`\n🎨 [${category}] Submitting: ${prompt.substring(0, 60)}...`);
  
  const submitResult = await submitJob(prompt);
  
  if (!submitResult.jobId) {
    console.error('❌ Failed to submit:', submitResult.error || submitResult.message);
    return null;
  }
  
  console.log(`📤 Job ID: ${submitResult.jobId}`);
  console.log(`⏳ Waiting for generation...`);
  
  try {
    const result = await waitForJob(submitResult.jobId);
    
    if (result.generations && result.generations.length > 0) {
      const gen = result.generations[0];
      const genId = gen.id;
      
      // Add to gallery
      addToGallery(submitResult.jobId, prompt, genId, category);
      
      console.log(`✅ Complete! https://images.aipg.art/${genId}.webp`);
      return { jobId: submitResult.jobId, generationId: genId, prompt, category };
    }
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
  }
  
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const count = parseInt(args.find(a => !a.startsWith('-')) || '0');
  const continuous = args.includes('--continuous') || args.includes('-c');
  const dryRun = args.includes('--dry-run') || args.includes('-d');
  
  console.log('🚀 AIPG Batch Image Generator');
  console.log('============================');
  console.log(`Mode: ${continuous ? 'Continuous' : count > 0 ? `${count} images` : 'Single image'}`);
  console.log(`Portrait: ${PORTRAIT_PARAMS.width}x${PORTRAIT_PARAMS.height}`);
  console.log(`Model: flux.1-krea-dev`);
  
  if (dryRun) {
    console.log('\n📋 Sample prompts (dry run):');
    for (let i = 0; i < 10; i++) {
      const { prompt, category } = generatePrompt();
      console.log(`  [${category}] ${prompt.substring(0, 80)}...`);
    }
    return;
  }
  
  // Check workers
  const workersOnline = await checkWorkersOnline();
  if (!workersOnline) {
    console.log('\n⚠️  FLUX workers are currently offline. Jobs will queue.');
  } else {
    console.log('\n🟢 FLUX workers online!');
  }
  
  let generated = 0;
  const target = continuous ? Infinity : (count || 1);
  
  while (generated < target) {
    try {
      const result = await generateOne();
      if (result) {
        generated++;
        console.log(`\n📊 Progress: ${generated}${continuous ? '' : '/' + target} images generated`);
      }
      
      // Small delay between jobs
      if (generated < target) {
        console.log('⏸️  Waiting 5s before next job...');
        await new Promise(r => setTimeout(r, 5000));
      }
      
    } catch (err) {
      console.error(`\n❌ Error in generation loop: ${err.message}`);
      console.log('⏸️  Waiting 30s before retry...');
      await new Promise(r => setTimeout(r, 30000));
    }
  }
  
  console.log(`\n🎉 Done! Generated ${generated} images.`);
}

main().catch(console.error);
