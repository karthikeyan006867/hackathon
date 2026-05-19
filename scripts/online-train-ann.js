#!/usr/bin/env node
// Simple incremental/online ANN trainer that consumes NDJSON shards and checkpoints weights

const fs = require('fs');
const path = require('path');

const shardsDir = process.argv[2] || 'data_shards';
const checkpointDir = process.argv[3] || 'models';
const batchSize = parseInt(process.argv[4], 10) || 64;
const maxSamples = parseInt(process.argv[5], 10) || 10000; // for test runs

if (!fs.existsSync(shardsDir)) {
  console.error('Shards folder not found:', shardsDir);
  process.exit(1);
}
if (!fs.existsSync(checkpointDir)) fs.mkdirSync(checkpointDir, { recursive: true });

// Very small param object representing model weights
let model = {
  version: 'commercial-v2-online',
  meta: { createdAt: new Date().toISOString() },
  weights: Array.from({ length: 128 }, () => Math.random() * 0.02 - 0.01),
};

function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

function processSample(sample) {
  // Convert textual features into a tiny numeric vector (hashing trick)
  const tokens = (sample.note || '').toLowerCase().split(/\s+/).slice(0, 20);
  let acc = 0;
  for (let i = 0; i < tokens.length; i++) {
    const h = Math.abs(hashCode(tokens[i])) % model.weights.length;
    acc += model.weights[h];
  }
  const pred = sigmoid(acc);

  // Fake target based on intent (urgent -> 1 else 0)
  const target = sample.intent === 'immediate_action' || sample.intent === 'incident_report' ? 1 : 0;

  // Online update: simple gradient descent on a binary cross-entropy proxy
  const lr = 0.01;
  const error = pred - target;
  for (let i = 0; i < tokens.length; i++) {
    const h = Math.abs(hashCode(tokens[i])) % model.weights.length;
    model.weights[h] -= lr * error * 0.001; // small update
  }

  return { pred, target, error: Math.abs(error) };
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return h;
}

async function run() {
  const manifestPath = path.join(shardsDir, 'manifest.json');
  let shards = [];
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    shards = manifest.shards.map(s => path.join(shardsDir, s.file));
  } else {
    // fallback: list all ndjson files
    shards = fs.readdirSync(shardsDir).filter(f => f.endsWith('.ndjson')).map(f => path.join(shardsDir, f));
  }

  let processed = 0;
  let sumError = 0;
  let sumPred = 0;

  for (const shardFile of shards) {
    const rl = require('readline').createInterface({ input: fs.createReadStream(shardFile), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      const sample = JSON.parse(line);
      const r = processSample(sample);
      processed++;
      sumError += r.error;
      sumPred += r.pred;

      if (processed % batchSize === 0) {
        // checkpoint
        const ckptPath = path.join(checkpointDir, `ckpt-samples-${processed}.json`);
        fs.writeFileSync(ckptPath, JSON.stringify({ meta: { processed }, weights: model.weights.slice(0, 256) }, null, 2));
        console.error(`Checkpoint saved: ${ckptPath}`);
      }

      if (processed >= maxSamples) break;
    }
    if (processed >= maxSamples) break;
  }

  // final checkpoint
  const finalPath = path.join(checkpointDir, `ckpt-final-${Date.now()}.json`);
  fs.writeFileSync(finalPath, JSON.stringify({ meta: { processed }, weights: model.weights.slice(0, 256) }, null, 2));
  console.error(`Processed ${processed} samples. Avg error: ${(sumError/Math.max(1,processed)).toFixed(6)} Avg pred: ${(sumPred/Math.max(1,processed)).toFixed(6)}. Final checkpoint: ${finalPath}`);
}

run().catch(err => { console.error(err); process.exit(1); });
