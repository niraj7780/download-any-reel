const { Redis } = require('@upstash/redis');
const { Ratelimit } from '@upstash/ratelimit';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const rateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '60 s'),
});

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

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const ip = req.headers['x-forwarded-for'] || '127.0.0.1';
  const { success } = await rateLimiter.limit(ip);
  if (!success) {
    return res.status(429).json({ error: 'Rate limit exceeded. Max 10 requests per minute.' });
  }

  if (req.method === 'POST') {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL is required' });
    }
    if (!isValidUrl(url)) {
      return res.status(400).json({ error: 'Invalid or blocked URL' });
    }

    const id = generateId();
    const job = {
      id,
      url,
      status: 'PENDING',
      progress: 0,
      size: 0,
      downloaded: 0,
      filename: null,
      error: null,
      created_at: new Date().toISOString(),
      completed_at: null,
    };

    await redis.set(`job:${id}`, JSON.stringify(job));
    await redis.lpush('job_queue', id);

    return res.status(201).json({ jobId: id, status: job.status });
  }

  if (req.method === 'GET') {
    const keys = await redis.keys('job:*');
    if (keys.length === 0) return res.status(200).json([]);

    const values = await redis.mget(keys);
    const jobs = values
      .filter(Boolean)
      .map((v) => (typeof v === 'string' ? JSON.parse(v) : v))
      .sort((a, b) => b.id.localeCompare(a.id));

    return res.status(200).json(jobs);
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
