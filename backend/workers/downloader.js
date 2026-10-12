const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const db = require('../database/database');

const STORAGE_DIR = path.join(__dirname, '..', 'storage');
const MAX_FILE_SIZE = 1024 * 1024 * 1024;

if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });

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

function fail(job, error, onComplete) {
  job.status = 'FAILED';
  job.error = error;
  db.prepare('UPDATE downloads SET status = ?, error = ?, completed_at = datetime(\'now\') WHERE id = ?').run('FAILED', error, job.id);
  onComplete(job.id);
}

function download(job, onComplete) {
  if (!isValidUrl(job.url)) {
    return fail(job, 'Invalid or blocked URL', onComplete);
  }

  let settled = false;
  const client = job.url.startsWith('https') ? https : http;

  const req = client.get(job.url, { headers: { 'User-Agent': 'AutoDownloadHub/1.0' } }, (res) => {
    if (settled) return;
    settled = true;

    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      req.destroy();
      job.url = new URL(res.headers.location, job.url).toString();
      return download(job, onComplete);
    }

    if (res.statusCode !== 200) {
      req.destroy();
      return fail(job, `HTTP ${res.statusCode}`, onComplete);
    }

    const totalSize = parseInt(res.headers['content-length'] || '0', 10);
    if (totalSize > MAX_FILE_SIZE) {
      req.destroy();
      return fail(job, 'File exceeds 1GB limit', onComplete);
    }

    job.size = totalSize;

    const contentType = res.headers['content-type'] || '';
    const urlPath = new URL(job.url).pathname;
    let filename = path.basename(urlPath) || 'download';
    if (!path.extname(filename)) {
      const ext = contentType.includes('json') ? '.json' : contentType.includes('html') ? '.html' : contentType.includes('pdf') ? '.pdf' : contentType.includes('image/') ? '.img' : '';
      filename += ext;
    }
    filename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    job.filename = filename;

    const filePath = path.join(STORAGE_DIR, `${job.id}_${filename}`);
    const fileStream = fs.createWriteStream(filePath);
    let downloaded = 0;
    let lastDbWrite = 0;

    res.on('data', (chunk) => {
      downloaded += chunk.length;
      job.downloaded = downloaded;
      if (totalSize > 0) {
        job.progress = Math.min(99, Math.round((downloaded / totalSize) * 100));
        const now = Date.now();
        if (now - lastDbWrite > 500) {
          lastDbWrite = now;
          db.prepare('UPDATE downloads SET progress = ?, downloaded = ? WHERE id = ?').run(job.progress, downloaded, job.id);
        }
      }
    });

    res.pipe(fileStream);

    fileStream.on('finish', () => {
      fileStream.close();
      if (totalSize > 0 && downloaded !== totalSize) {
        fs.unlink(filePath, () => {});
        return fail(job, 'Size mismatch', onComplete);
      }
      job.status = 'COMPLETED';
      job.progress = 100;
      db.prepare('UPDATE downloads SET status = ?, progress = 100, filename = ?, size = ?, downloaded = ?, completed_at = datetime(\'now\') WHERE id = ?')
        .run('COMPLETED', filename, totalSize, downloaded, job.id);
      onComplete(job.id);
    });

    fileStream.on('error', (err) => {
      fileStream.destroy();
      fs.unlink(filePath, () => {});
      fail(job, err.message, onComplete);
    });
  });

  req.on('error', (err) => {
    if (settled) return;
    settled = true;
    fail(job, err.message, onComplete);
  });

  req.setTimeout(30000, () => {
    if (settled) return;
    settled = true;
    req.destroy();
    fail(job, 'Connection timeout', onComplete);
  });
}

module.exports = { download };
