const connectDB = require('../lib/mongodb');
const Confession = require('../models/Confession');
const crypto = require('crypto');

// Rate limiting untuk reaction
const reactionRateLimit = new Map();
const REACTION_WINDOW = 30000; // 30 detik
const MAX_REACTIONS = 20;

function getClientIp(req) {
  return req.headers['x-forwarded-for'] || 
         req.headers['x-real-ip'] || 
         req.socket.remoteAddress || 
         'unknown';
}

function hashIp(ip) {
  return crypto.createHash('sha256').update(ip).digest('hex');
}

function checkReactionRateLimit(ip, confessionId) {
  const now = Date.now();
  const key = `${hashIp(ip)}-${confessionId}`;
  const userReactions = reactionRateLimit.get(key) || [];
  
  const recentReactions = userReactions.filter(time => now - time < REACTION_WINDOW);
  
  if (recentReactions.length >= MAX_REACTIONS) {
    return false;
  }
  
  recentReactions.push(now);
  reactionRateLimit.set(key, recentReactions);
  return true;
}

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await connectDB();
    const clientIp = getClientIp(req);
    const { confessionId, reactionType } = req.body;

    if (!confessionId || !reactionType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const validReactions = ['love', 'funny', 'sad', 'fire', 'angry'];
    if (!validReactions.includes(reactionType)) {
      return res.status(400).json({ error: 'Invalid reaction type' });
    }

    // Rate limiting per confession per IP
    if (!checkReactionRateLimit(clientIp, confessionId)) {
      return res.status(429).json({ 
        error: 'Too many reactions. Please wait a moment.' 
      });
    }

    // Update reaction counter
    const updateQuery = {};
    updateQuery[`reactions.${reactionType}`] = 1;

    const confession = await Confession.findByIdAndUpdate(
      confessionId,
      { 
        $inc: updateQuery,
        $set: { totalReactions: { $add: ["$totalReactions", 1] } }
      },
      { new: true }
    );

    if (!confession) {
      return res.status(404).json({ error: 'Confession not found' });
    }

    return res.status(200).json(confession);

  } catch (error) {
    console.error('Reaction API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};