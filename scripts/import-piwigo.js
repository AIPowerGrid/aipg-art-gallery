#!/usr/bin/env node
/**
 * Import Piwigo images to AIPG Gallery
 * 1. Extract zip files
 * 2. Upload to R2
 * 3. Add to gallery.json
 */

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// R2 Configuration from .env
const R2_ENDPOINT = 'https://a9b7416008b496f49b0f021099cc4128.r2.cloudflarestorage.com';
const R2_BUCKET = 'aipgcoregen';
const R2_ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID || '60692db35d5f2d82657bc34373a9ff47';
const R2_SECRET_KEY = process.env.AWS_SECRET_ACCESS_KEY || 'e17c054d255dc6991da3a238e7be45989778066cbba0894be40fe8f199e62a73';
const PUBLIC_URL_BASE = 'https://images.aipg.art';

// Gallery store path
const GALLERY_PATH = './data/gallery.json';

// Initialize S3 client for R2
const s3 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY,
    secretAccessKey: R2_SECRET_KEY,
  },
});

async function uploadToR2(filePath, objectKey) {
  const fileContent = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  
  const contentType = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  }[ext] || 'application/octet-stream';

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: objectKey,
    Body: fileContent,
    ContentType: contentType,
  });

  await s3.send(command);
  return `${PUBLIC_URL_BASE}/${objectKey}`;
}

function loadGallery() {
  if (!fs.existsSync(GALLERY_PATH)) {
    return [];
  }
  const data = fs.readFileSync(GALLERY_PATH, 'utf8');
  return JSON.parse(data);
}

function saveGallery(items) {
  const dir = path.dirname(GALLERY_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(GALLERY_PATH, JSON.stringify(items, null, 2));
}

function generateJobId() {
  return 'piwigo-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
}

function parseFilename(filename) {
  // Format: 436_Enchanted Unicorn Kingdo_688x918.png
  // or: 973_aipg V2 (1)_515x918.webp
  const match = filename.match(/^(\d+)_(.+?)_(\d+)x(\d+)\.(png|webp|jpg|jpeg)$/i);
  if (match) {
    return {
      id: match[1],
      title: match[2].replace(/&#039;/g, "'").trim(),
      width: parseInt(match[3]),
      height: parseInt(match[4]),
      ext: match[5].toLowerCase(),
    };
  }
  return null;
}

async function main() {
  const zipFiles = process.argv.slice(2);
  
  if (zipFiles.length === 0) {
    // Default to finding piwigo zips in current directory
    const files = fs.readdirSync('.').filter(f => f.includes('piwigo') && f.endsWith('.zip'));
    if (files.length === 0) {
      console.error('Usage: node scripts/import-piwigo.js [zip files...]');
      console.error('Or place piwigo*.zip files in the current directory');
      process.exit(1);
    }
    zipFiles.push(...files);
  }

  console.log(`Processing ${zipFiles.length} zip file(s)...`);

  // Create temp directory for extraction
  const tempDir = '/tmp/piwigo-import-' + Date.now();
  fs.mkdirSync(tempDir, { recursive: true });

  let totalImages = 0;
  const newGalleryItems = [];

  for (const zipFile of zipFiles) {
    console.log(`\nExtracting ${zipFile}...`);
    execSync(`unzip -o "${zipFile}" -d "${tempDir}"`, { stdio: 'inherit' });
  }

  // Get all image files
  const imageFiles = fs.readdirSync(tempDir).filter(f => 
    /\.(png|jpg|jpeg|webp|gif)$/i.test(f)
  );

  console.log(`\nFound ${imageFiles.length} images to upload...`);

  for (const imageFile of imageFiles) {
    const parsed = parseFilename(imageFile);
    const filePath = path.join(tempDir, imageFile);
    
    // Generate unique object key
    const ext = path.extname(imageFile).toLowerCase();
    const objectKey = `piwigo/${Date.now()}-${Math.random().toString(36).substr(2, 6)}${ext}`;
    
    console.log(`Uploading: ${imageFile} -> ${objectKey}`);
    
    try {
      const publicUrl = await uploadToR2(filePath, objectKey);
      
      // Create gallery item
      const item = {
        jobId: generateJobId(),
        modelId: 'piwigo-import',
        modelName: 'Piwigo Import',
        prompt: parsed?.title || path.basename(imageFile, ext),
        negativePrompt: '',
        type: 'image',
        isNsfw: false,
        isPublic: true,
        walletAddress: '',
        createdAt: Date.now(),
        generationIds: [objectKey],
        mediaUrls: [publicUrl],
        params: parsed ? {
          width: parsed.width,
          height: parsed.height,
        } : null,
      };
      
      newGalleryItems.push(item);
      totalImages++;
      
    } catch (err) {
      console.error(`Failed to upload ${imageFile}:`, err.message);
    }
  }

  // Load existing gallery and add new items
  console.log(`\nAdding ${newGalleryItems.length} items to gallery...`);
  const gallery = loadGallery();
  gallery.unshift(...newGalleryItems); // Add to beginning (newest first)
  saveGallery(gallery);

  // Cleanup temp directory
  fs.rmSync(tempDir, { recursive: true, force: true });

  console.log(`\n✅ Done! Imported ${totalImages} images.`);
  console.log(`Gallery now has ${gallery.length} total items.`);
}

main().catch(console.error);
