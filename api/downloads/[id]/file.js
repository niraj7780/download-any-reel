const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  const data = await redis.get(`job:${id}`);
  if (!data) return res.status(404).json({ error: 'File not available' });

  const job = typeof data === 'string' ? JSON.parse(data) : data;
  if (job.status !== 'COMPLETED' || !job.blobUrl) {
    return res.status(404).json({ error: 'File not available' });
  }

  return res.redirect(302, job.blobUrl);
};
