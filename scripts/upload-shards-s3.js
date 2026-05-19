#!/usr/bin/env node
// S3 shard uploader helper (reads creds from env vars)

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

const REGION = process.env.AWS_REGION || 'us-east-1';
const BUCKET = process.env.S3_BUCKET;

if (!BUCKET) {
  console.error('S3_BUCKET not set in env; uploader will not run.');
}

const client = new S3Client({ region: REGION });

async function uploadShard(filePath) {
  if (!BUCKET) return null;
  const key = path.basename(filePath);
  const body = fs.createReadStream(filePath);
  const cmd = new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body });
  await client.send(cmd);
  console.error(`Uploaded ${key} -> s3://${BUCKET}/${key}`);
  return `s3://${BUCKET}/${key}`;
}

module.exports = { uploadShard };
