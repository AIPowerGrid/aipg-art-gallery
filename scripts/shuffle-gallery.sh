#!/bin/bash
# Shuffle gallery random_sort values every 5 minutes
# This provides fresh randomization without expensive ORDER BY RANDOM()

PGPASSWORD=aipg_secure_2026 psql -U aipg -h localhost -d aipg_gallery -c "
UPDATE gallery_items 
SET random_sort = random();
" 2>/dev/null

# Log shuffle (optional - comment out if too noisy)
# echo "[$(date '+%Y-%m-%d %H:%M:%S')] Gallery shuffled" >> /home/aipg/aipg-gallery/logs/shuffle.log
