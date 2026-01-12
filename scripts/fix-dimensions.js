#!/usr/bin/env node
/**
 * Fix dimensions for imported images by reading actual image dimensions
 */

const fs = require('fs');
const https = require('https');
const sizeOf = require('image-size');

const GALLERY_PATH = './data/gallery.json';

async function getImageDimensions(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      const chunks = [];
      let totalLength = 0;
      
      response.on('data', (chunk) => {
        chunks.push(chunk);
        totalLength += chunk.length;
        
        // Try to get dimensions once we have enough data (first 50KB should be enough)
        if (totalLength > 50000) {
          response.destroy();
          const buffer = Buffer.concat(chunks);
          try {
            const dimensions = sizeOf.default ? sizeOf.default(buffer) : sizeOf(buffer);
            resolve(dimensions);
          } catch (err) {
            reject(err);
          }
        }
      });
      
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        try {
          const dimensions = sizeOf.default ? sizeOf.default(buffer) : sizeOf(buffer);
          resolve(dimensions);
        } catch (err) {
          reject(err);
        }
      });
      
      response.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  console.log('Loading gallery...');
  const gallery = JSON.parse(fs.readFileSync(GALLERY_PATH, 'utf8'));
  
  // Find all public-art items with default 1024x1024 dimensions
  const itemsToFix = gallery.filter(item => 
    item.modelId === 'public-art' && 
    item.params?.width === 1024 && 
    item.params?.height === 1024
  );
  
  console.log(`Found ${itemsToFix.length} items to fix`);
  
  let fixed = 0;
  let failed = 0;
  
  for (let i = 0; i < itemsToFix.length; i++) {
    const item = itemsToFix[i];
    const url = item.mediaUrls?.[0];
    
    if (!url) {
      failed++;
      continue;
    }
    
    try {
      process.stdout.write(`[${i + 1}/${itemsToFix.length}] Checking ${item.jobId}... `);
      const dimensions = await getImageDimensions(url);
      
      // Update the item in the gallery
      const index = gallery.findIndex(g => g.jobId === item.jobId);
      if (index !== -1) {
        gallery[index].params = {
          ...gallery[index].params,
          width: dimensions.width,
          height: dimensions.height,
        };
        fixed++;
        console.log(`✓ ${dimensions.width}x${dimensions.height}`);
      }
    } catch (err) {
      console.log(`✗ ${err.message}`);
      failed++;
    }
  }
  
  // Backup
  const backupPath = GALLERY_PATH + '.backup-dimensions-' + Date.now();
  fs.writeFileSync(backupPath, fs.readFileSync(GALLERY_PATH, 'utf8'));
  console.log(`\nBackup saved to ${backupPath}`);
  
  // Save
  fs.writeFileSync(GALLERY_PATH, JSON.stringify(gallery, null, 2));
  
  console.log(`\n✅ Fixed ${fixed} items, ${failed} failed`);
  console.log('Restart API: pm2 restart aipg-api');
}

main().catch(console.error);
