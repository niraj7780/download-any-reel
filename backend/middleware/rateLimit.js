const rateLimitStore = new Map();
const WINDOW_MS = 60000;
const MAX_REQUESTS = 10;


function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const record = rateLimitStore.get(ip) || { count: 0, resetAt: now + WINDOW_MS };

  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + WINDOW_MS;
  }

  record.count++;
  rateLimitStore.set(ip, record);

  if (record.count > MAX_REQUESTS) {
    return res.status(429).json({ error: 'Rate limit exceeded. Max 10 requests per minute.' });
  }

  next();
}

module.exports = rateLimit;
