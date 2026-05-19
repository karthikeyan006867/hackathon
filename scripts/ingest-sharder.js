#!/usr/bin/env node
// Ingest sharder: splits NDJSON into shard files and creates a manifest

const fs = require('fs');
const path = require('path');

if (process.argv.length < 3) {
  console.error('Usage: node ingest-sharder.js <input.ndjson> [shardSize=100000] [outDir=shards]');
  process.exit(1);
}

const input = process.argv[2];
const shardSize = parseInt(process.argv[3], 10) || 100000;
const outDir = process.argv[4] || 'data_shards';

if (!fs.existsSync(input)) {
  console.error('Input file not found:', input);
  process.exit(1);
}

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const rl = require('readline').createInterface({
  input: fs.createReadStream(input),
  crlfDelay: Infinity,
});

// optional uploader helper (safe: will no-op if no creds)
let uploader = null;
const uploadEnabled = (process.argv[5] || '').toLowerCase() === 'upload';
const uploadProvider = (process.argv[6] || 's3').toLowerCase();
if (uploadEnabled) {
  try {
    uploader = require('./upload-shards');
  } catch (e) {
    console.error('Uploader module not available:', e.message);
    uploader = null;
  }
}

let shardIndex = 0;
let lineCount = 0;
let shardStream = fs.createWriteStream(path.join(outDir, `shard-${shardIndex}.ndjson`));
const manifest = { shards: [] };
let shardSamples = 0;
let globalCount = 0;

rl.on('line', (line) => {
  if (!line.trim()) return;
  shardStream.write(line + '\n');
  shardSamples++;
  globalCount++;

  if (shardSamples >= shardSize) {
    shardStream.end();
    manifest.shards.push({ file: `shard-${shardIndex}.ndjson`, samples: shardSamples });
    const completedPath = path.join(outDir, `shard-${shardIndex}.ndjson`);
    // attempt upload asynchronously (uploader will no-op if not configured)
    if (uploadEnabled && uploader && typeof uploader.uploadShard === 'function') {
      uploader.uploadShard(completedPath, uploadProvider).catch((err) =>
        console.error('Upload error (shard):', err && err.message ? err.message : err)
      );
    }
    shardIndex++;
    shardStream = fs.createWriteStream(path.join(outDir, `shard-${shardIndex}.ndjson`));
    shardSamples = 0;
  }
});

rl.on('close', () => {
  shardStream.end();
  if (shardSamples > 0) {
    manifest.shards.push({ file: `shard-${shardIndex}.ndjson`, samples: shardSamples });
    const completedPath = path.join(outDir, `shard-${shardIndex}.ndjson`);
    if (uploadEnabled && uploader && typeof uploader.uploadShard === 'function') {
      uploader.uploadShard(completedPath, uploadProvider).catch((err) =>
        console.error('Upload error (final shard):', err && err.message ? err.message : err)
      );
    }
  }
  manifest.totalSamples = globalCount;
  manifest.generatedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.error(`Sharded ${globalCount} samples into ${manifest.shards.length} files in ${outDir}`);
});
