// Uploader shim: selects provider-specific uploader
const path = require('path');

function pickUploader(provider) {
  provider = (provider || 's3').toLowerCase();
  try {
    if (provider === 'cloudinary') return require('./upload-shards-cloudinary');
    return require('./upload-shards-s3');
  } catch (e) {
    console.error('Failed to load uploader for', provider, e.message || e);
    return null;
  }
}

module.exports = {
  uploadShard: async (filePath, provider) => {
    const impl = pickUploader(provider);
    if (!impl || typeof impl.uploadShard !== 'function') {
      console.error('No uploader implementation available for', provider);
      return null;
    }
    return impl.uploadShard(filePath);
  },
};
