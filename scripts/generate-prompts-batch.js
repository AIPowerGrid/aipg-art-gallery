#!/usr/bin/env node
/**
 * Batch generate prompts for all imported images using Qwen3-VL-2B-Instruct
 */

const fs = require('fs');
const https = require('https');

const GALLERY_PATH = './data/gallery.json';
const VISION_API = 'https://combined-devoted-ultram-fabrics.trycloudflare.com/v1/chat/completions';
const MODEL = 'Qwen/Qwen3-VL-2B-Instruct';

async function generatePrompt(imageUrl) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      model: MODEL,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Describe this image as a detailed, artistic prompt for AI art generation. Focus on the visual style, composition, subject, lighting, colors, and mood. Be descriptive and evocative.'
          },
          {
            type: 'image_url',
            image_url: { url: imageUrl }
          }
        ]
      }],
      max_tokens: 250
    });

    const url = new URL(VISION_API);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 180000 // 3 minutes
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.choices?.[0]?.message?.content) {
            resolve(result.choices[0].message.content);
          } else {
            reject(new Error('No content in response'));
          }
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log('Loading gallery...');
  const gallery = JSON.parse(fs.readFileSync(GALLERY_PATH, 'utf8'));
  
  // Find imported images with filename prompts
  const needsPrompts = gallery.filter(item => 
    item.modelId === 'public-art' && 
    item.prompt.match(/^\d{14}-[a-z0-9]+$/)
  );
  
  console.log(`Found ${needsPrompts.length} images that need prompts\n`);
  
  const totalTime = needsPrompts.length * 76; // ~76 seconds per image
  console.log(`Estimated time: ${Math.floor(totalTime / 60)} minutes\n`);
  
  // Backup
  const backupPath = GALLERY_PATH + '.backup-prompts-' + Date.now();
  fs.writeFileSync(backupPath, JSON.stringify(gallery, null, 2));
  console.log(`Backup saved: ${backupPath}\n`);
  
  let processed = 0;
  let failed = 0;
  const startTime = Date.now();
  
  for (let i = 0; i < needsPrompts.length; i++) {
    const item = needsPrompts[i];
    const url = item.mediaUrls?.[0];
    
    if (!url) {
      failed++;
      continue;
    }
    
    const progress = `[${i + 1}/${needsPrompts.length}]`;
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const avgTime = processed > 0 ? elapsed / processed : 76;
    const remaining = Math.floor((needsPrompts.length - i) * avgTime / 60);
    
    try {
      process.stdout.write(`${progress} ${item.jobId.slice(0, 20)}... `);
      
      const prompt = await generatePrompt(url);
      
      // Update in gallery array
      const galleryIndex = gallery.findIndex(g => g.jobId === item.jobId);
      if (galleryIndex !== -1) {
        gallery[galleryIndex].prompt = prompt;
      }
      
      processed++;
      console.log(`✓`);
      console.log(`  "${prompt.slice(0, 80)}..."`);
      console.log(`  Avg: ${Math.floor(avgTime)}s/img, ETA: ${remaining}min\n`);
      
      // Save progress every 10 images
      if (processed % 10 === 0) {
        fs.writeFileSync(GALLERY_PATH, JSON.stringify(gallery, null, 2));
        console.log(`💾 Progress saved (${processed}/${needsPrompts.length})\n`);
      }
      
    } catch (err) {
      failed++;
      console.log(`✗ ${err.message}\n`);
    }
  }
  
  // Final save
  fs.writeFileSync(GALLERY_PATH, JSON.stringify(gallery, null, 2));
  
  const totalMinutes = Math.floor((Date.now() - startTime) / 60000);
  console.log('\n' + '='.repeat(60));
  console.log(`✅ Done! Processed ${processed} images in ${totalMinutes} minutes`);
  console.log(`❌ Failed: ${failed}`);
  console.log('='.repeat(60));
  console.log('\nRestart API to see new prompts: pm2 restart aipg-api');
}

main().catch(console.error);
