const connectDB = require('../lib/mongodb');
const Confession = require('../models/Confession');
const Filter = require('bad-words');
const crypto = require('crypto');

const filter = new Filter();

// Rate limiting sederhana berdasarkan IP
const rateLimit = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 menit
const MAX_REQUESTS = 5;

function getClientIp(req) {
  return req.headers['x-forwarded-for'] || 
         req.headers['x-real-ip'] || 
         req.socket.remoteAddress || 
         'unknown';
}

function hashIp(ip) {
  return crypto.createHash('sha256').update(ip).digest('hex');
}

function checkRateLimit(ip) {
  const now = Date.now();
  const ipHash = hashIp(ip);
  const userRequests = rateLimit.get(ipHash) || [];
  
  // Hapus request yang sudah lewat window
  const recentRequests = userRequests.filter(time => now - time < RATE_LIMIT_WINDOW);
  
  if (recentRequests.length >= MAX_REQUESTS) {
    return false;
  }
  
  recentRequests.push(now);
  rateLimit.set(ipHash, recentRequests);
  return true;
}

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    await connectDB();
    const clientIp = getClientIp(req);

    // GET - Ambil confession
    if (req.method === 'GET') {
      const { sort = 'new', page = 1, limit = 10 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      let query = Confession.find();
      let sortQuery = {};

      switch (sort) {
        case 'trending':
          sortQuery = { totalReactions: -1, createdAt: -1 };
          const confessions = await query
            .sort(sortQuery)
            .skip(skip)
            .limit(parseInt(limit))
            .lean();
          
          const total = await Confession.countDocuments();
          const hasMore = skip + confessions.length < total;

          return res.status(200).json({
            confessions,
            hasMore,
            page: parseInt(page)
          });
          
        case 'random':
          const randomConfessions = await Confession.aggregate([
            { $sample: { size: parseInt(limit) } }
          ]);
          return res.status(200).json({
            confessions: randomConfessions,
            hasMore: false,
            page: 1
          });
          
        case 'new':
        default:
          sortQuery = { createdAt: -1 };
          const newConfessions = await query
            .sort(sortQuery)
            .skip(skip)
            .limit(parseInt(limit))
            .lean();
          
          const totalNew = await Confession.countDocuments();
          const hasMoreNew = skip + newConfessions.length < totalNew;

          return res.status(200).json({
            confessions: newConfessions,
            hasMore: hasMoreNew,
            page: parseInt(page)
          });
      }
    }

    // POST - Buat confession baru
    if (req.method === 'POST') {
      // Rate limiting
      if (!checkRateLimit(clientIp)) {
        return res.status(429).json({ 
          error: 'Too many requests. Please wait a moment.' 
        });
      }

      const { message } = req.body;

      if (!message || message.trim().length === 0) {
        return res.status(400).json({ error: 'Message is required' });
      }

      if (message.length > 300) {
        return res.status(400).json({ error: 'Message too long (max 300 characters)' });
      }

      // Filter bad words
      const cleanMessage = filter.clean(message);

      const confession = await Confession.create({
        message: cleanMessage,
        ipHash: hashIp(clientIp)
      });

      return res.status(201).json(confession);
    }

    // Method not allowed
    return res.status(405).json({ error: 'Method not allowed' });
    
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};