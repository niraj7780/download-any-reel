const { Redis } = require('@upstash/redis');
const { put } = require('@vercel/blob');
const http = require('http');
const https = require('https');
const path = require('path');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const MAX_FILE_SIZE = 100 * 1024 * 1024;

function isValidUrl(urlString) {
  try {
    const url = new URL(urlString);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    const hostname = url.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return false;
    if (hostname.startsWith('10.') || hostname.startsWith('192.168.') || hostname.startsWith('172.')) return false;
    if (hostname.startsWith('169.254.')) return false;
    return true;
  } catch {
    return false;
  }
}

async function updateJob(id, updates) {
  const data = await redis.get(`job:${id}`);
  if (!data) return null;
  const job = typeof data === 'string' ? JSON.parse(data) : data;
  Object.assign(job, updates);
  await redis.set(`job:${id}`, JSON.stringify(job));
  return job;
}

function downloadFile(job) {
  return new Promise((resolve, reject) => {
    if (!isValidUrl(job.url)) {
      return reject(new Error('Invalid or blocked URL'));
    }

    let settled = false;
    const client = job.url.startsWith('https') ? https : http;

    const req = client.get(job.url, { headers: { 'User-Agent': 'AutoDownloadHub/1.0' } }, (res) => {
      if (settled) return;
      settled = true;

      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        req.destroy();
        job.url = new URL(res.headers.location, job.url).toString();
        return downloadFile(job).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        req.destroy();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      const totalSize = parseInt(res.headers['content-length'] || '0', 10);
      if (totalSize > MAX_FILE_SIZE) {
        req.destroy();
        return reject(new Error('File exceeds 100MB limit'));
      }

      const contentType = res.headers['content-type'] || '';
      const urlPath = new URL(job.url).pathname;
      let filename = path.basename(urlPath) || 'download';
      if (!path.extname(filename)) {
        const ext = contentType.includes('json') ? '.json' : contentType.includes('html') ? '.html' : contentType.includes('pdf') ? '.pdf' : contentType.includes('image/') ? '.img' : '';
        filename += ext;
      }
      filename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

      const chunks = [];
      let downloaded = 0;

      res.on('data', (chunk) => {
        downloaded += chunk.length;
        chunks.push(chunk);
        if (totalSize > 0) {
          const progress = Math.min(99, Math.round((downloaded / totalSize) * 100));
          updateJob(job.id, { progress, downloaded, size: totalSize, filename }).catch(() => {});
        }
      });

      res.on('end', () => {
        if (totalSize > 0 && downloaded !== totalSize) {
          return reject(new Error('Size mismatch'));
        }
        resolve({ buffer: Buffer.concat(chunks), filename, size: downloaded });
      });

      res.on('error', (err) => reject(err));
    });

    req.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });

    req.setTimeout(30000, () => {
      if (settled) return;
      settled = true;
      req.destroy();
      reject(new Error('Connection timeout'));
    });
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let jobId;

  if (req.method === 'POST') {
    ({ jobId } = req.body);
  } else {
    jobId = req.query.id;
  }

  if (!jobId) {
    const queuedId = await redis.rpoplpush('job_queue', 'job_processing');
    if (!queuedId) return res.status(200).json({ processed: false, message: 'No jobs in queue' });
    jobId = queuedId;
  }

  const data = await redis.get(`job:${jobId}`);
  if (!data) return res.status(404).json({ error: 'Job not found' });

  const job = typeof data === 'string' ? JSON.parse(data) : data;
  if (job.status === 'COMPLETED' || job.status === 'FAILED') {
    return res.status(200).json({ processed: false, message: `Job already ${job.status}` });
  }

  await updateJob(jobId, { status: 'DOWNLOADING' });

  try {
    const { buffer, filename, size } = await downloadFile(job);

    const blob = await put(`${jobId}_${filename}`, buffer, {
      access: 'public',
      addRandomSuffix: false,
    });

    await updateJob(jobId, {
      status: 'COMPLETED',
      progress: 100,
      filename,
      size,
      downloaded: size,
      blobUrl: blob.url,
      completed_at: new Date().toISOString(),
    });

    await redis.lrem('job_processing', 0, jobId);

    return res.status(200).json({ processed: true, jobId, status: 'COMPLETED' });
  } catch (err) {
    await updateJob(jobId, {
      status: 'FAILED',
      error: err.message,
      completed_at: new Date().toISOString(),
    });

    await redis.lrem('job_processing', 0, jobId);

    return res.status(200).json({ processed: true, jobId, status: 'FAILED', error: err.message });
  }
};
