const db = require('../database/database');

const jobs = new Map();
let jobIdCounter = 1;
const MAX_CONCURRENT = 3;
let activeWorkers = 0;
const jobQueue = [];

function enqueue(url) {
  const id = jobIdCounter++;
  const job = { id, url, status: 'PENDING', progress: 0, size: 0, downloaded: 0, filename: null, error: null };
  jobs.set(id, job);

  db.prepare('INSERT INTO downloads (id, url, status) VALUES (?, ?, ?)').run(id, url, 'PENDING');

  jobQueue.push(id);
  processQueue();
  return job;
}

function processQueue() {
  while (activeWorkers < MAX_CONCURRENT && jobQueue.length > 0) {
    const id = jobQueue.shift();
    const job = jobs.get(id);
    if (job && job.status === 'PENDING') {
      activeWorkers++;
      job.status = 'DOWNLOADING';
      db.prepare('UPDATE downloads SET status = ? WHERE id = ?').run('DOWNLOADING', id);
      require('../workers/downloader').download(job, onComplete);
    }
  }
}

function onComplete(id) {
  activeWorkers--;
  processQueue();
}

function getJob(id) {
  return jobs.get(Number(id)) || null;
}

function getAllJobs() {
  const rows = db.prepare('SELECT * FROM downloads ORDER BY id DESC').all();
  return rows;
}

function removeJob(id) {
  jobs.delete(Number(id));
}

module.exports = { enqueue, getJob, getAllJobs, removeJob };
