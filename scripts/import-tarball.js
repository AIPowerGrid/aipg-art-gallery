#!/usr/bin/env node
/**
 * Import images from extracted tarball to AIPG Gallery
 * 1. Find all images in directory
 * 2. Upload to R2
 * 3. Add to top of gallery.json
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
  return 'imported-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
}

function findAllImages(dir) {
  const images = [];
  
  function walk(currentDir) {
    const files = fs.readdirSync(currentDir);
    for (const file of files) {
      const filePath = path.join(currentDir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        walk(filePath);
      } else if (/\.(png|jpg|jpeg|webp|gif)$/i.test(file)) {
        images.push(filePath);
      }
    }
  }
  
  walk(dir);
  return images;
}

async function main() {
  const extractDir = process.argv[2] || './temp_extract';
  
  if (!fs.existsSync(extractDir)) {
    console.error(`Directory not found: ${extractDir}`);
    process.exit(1);
  }

  console.log(`Scanning for images in ${extractDir}...`);
  const imageFiles = findAllImages(extractDir);
  
  console.log(`\nFound ${imageFiles.length} images to upload...`);

  const newGalleryItems = [];
  let uploaded = 0;

  for (const filePath of imageFiles) {
    const filename = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();
    
    // Generate unique object key
    const objectKey = `public-art/${Date.now()}-${Math.random().toString(36).substr(2, 6)}${ext}`;
    
    process.stdout.write(`[${uploaded + 1}/${imageFiles.length}] ${filename}... `);
    
    try {
      const publicUrl = await uploadToR2(filePath, objectKey);
      
      // Create gallery item
      const item = {
        jobId: generateJobId(),
        modelId: 'public-art',
        modelName: 'Public AI Art',
        prompt: path.basename(filename, ext),
        negativePrompt: '',
        type: 'image',
        isNsfw: false,
        isPublic: true,
        walletAddress: '',
        createdAt: Date.now(),
        generationIds: [objectKey],
        mediaUrls: [publicUrl],
        params: {
          width: 1024,
          height: 1024,
        },
      };
      
      newGalleryItems.push(item);
      uploaded++;
      console.log('✓');
      
    } catch (err) {
      console.log(`✗ ${err.message}`);
    }
  }

  // Load existing gallery and add new items at the top
  console.log(`\nAdding ${newGalleryItems.length} items to top of gallery...`);
  const gallery = loadGallery();
  gallery.unshift(...newGalleryItems); // Add to beginning (newest first)
  saveGallery(gallery);

  console.log(`\n✅ Done! Imported ${uploaded} images.`);
  console.log(`Gallery now has ${gallery.length} total items.`);
}

main().catch(console.error);
