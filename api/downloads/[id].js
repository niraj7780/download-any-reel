const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;

  if (req.method === 'GET') {
    const data = await redis.get(`job:${id}`);
    if (!data) return res.status(404).json({ error: 'Not found' });
    const job = typeof data === 'string' ? JSON.parse(data) : data;
    return res.status(200).json(job);
  }

  if (req.method === 'DELETE') {
    const data = await redis.get(`job:${id}`);
    if (!data) return res.status(404).json({ error: 'Not found' });

    const job = typeof data === 'string' ? JSON.parse(data) : data;

    if (job.blobUrl) {
      try {
        const { del } = require('@vercel/blob');
        await del(job.blobUrl);
      } catch {}
    }

    await redis.del(`job:${id}`);
    return res.status(200).json({ deleted: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
