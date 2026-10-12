const express = require('express');
const router = express.Router();
const queue = require('../queue/queue');
const path = require('path');
const fs = require('fs');

const STORAGE_DIR = path.join(__dirname, '..', 'storage');

router.post('/', (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL is required' });
  }
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }
  const job = queue.enqueue(url);
  res.status(201).json({ jobId: job.id, status: job.status });
});

router.get('/', (req, res) => {
  const downloads = queue.getAllJobs();
  res.json(downloads);
});

router.get('/:id', (req, res) => {
  const job = queue.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });
  res.json(job);
});

router.get('/:id/file', (req, res) => {
  const job = queue.getJob(req.params.id);
  if (!job || job.status !== 'COMPLETED' || !job.filename) {
    return res.status(404).json({ error: 'File not available' });
  }
  const filePath = path.join(STORAGE_DIR, `${job.id}_${job.filename}`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.download(filePath, job.filename);
});

router.delete('/:id', (req, res) => {
  const job = queue.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });
  if (job.filename) {
    const filePath = path.join(STORAGE_DIR, `${job.id}_${job.filename}`);
    fs.unlink(filePath, () => {});
  }
  const db = require('../database/database');
  db.prepare('DELETE FROM downloads WHERE id = ?').run(job.id);
  queue.removeJob(job.id);
  res.json({ deleted: true });
});

module.exports = router;
