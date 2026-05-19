#!/usr/bin/env node
// Cloudinary uploader helper (reads creds from CLOUDINARY_URL)
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

if (!process.env.CLOUDINARY_URL) {
  console.error('CLOUDINARY_URL not set; uploader will not run.');
}

if (process.env.CLOUDINARY_URL) cloudinary.config({ secure: true });

async function uploadShard(filePath) {
  if (!process.env.CLOUDINARY_URL) return null;
  const key = path.basename(filePath);
  // Cloudinary prefers images; we upload as raw file
  const res = await cloudinary.uploader.upload(filePath, { resource_type: 'raw', public_id: key.replace(/\.[^.]+$/, '') });
  console.error(`Uploaded ${key} -> ${res.secure_url}`);
  return res.secure_url;
}

module.exports = { uploadShard };
