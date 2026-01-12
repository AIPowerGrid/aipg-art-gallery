#!/usr/bin/env node
/**
 * Shuffle gallery items to make it more visually diverse
 */

const fs = require('fs');
const path = require('path');

const GALLERY_PATH = './data/gallery.json';

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function main() {
  console.log('Loading gallery...');
  const gallery = JSON.parse(fs.readFileSync(GALLERY_PATH, 'utf8'));
  
  console.log(`Found ${gallery.length} items`);
  console.log('Shuffling...');
  
  const shuffled = shuffleArray(gallery);
  
  // Backup original
  const backupPath = GALLERY_PATH + '.backup-' + Date.now();
  fs.writeFileSync(backupPath, JSON.stringify(gallery, null, 2));
  console.log(`Backup saved to ${backupPath}`);
  
  // Save shuffled
  fs.writeFileSync(GALLERY_PATH, JSON.stringify(shuffled, null, 2));
  
  console.log('✅ Gallery shuffled successfully!');
  console.log('Restart the API server to see changes: pm2 restart aipg-api');
}

main();
