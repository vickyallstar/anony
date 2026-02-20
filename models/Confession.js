const mongoose = require('mongoose');

const confessionSchema = new mongoose.Schema({
  message: {
    type: String,
    required: true,
    maxlength: 300,
    trim: true
  },
  reactions: {
    love: { type: Number, default: 0 },
    funny: { type: Number, default: 0 },
    sad: { type: Number, default: 0 },
    fire: { type: Number, default: 0 },
    angry: { type: Number, default: 0 }
  },
  totalReactions: {
    type: Number,
    default: 0
  },
  ipHash: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Update totalReactions sebelum save
confessionSchema.pre('save', function(next) {
  this.totalReactions = 
    this.reactions.love + 
    this.reactions.funny + 
    this.reactions.sad + 
    this.reactions.fire + 
    this.reactions.angry;
  next();
});

module.exports = mongoose.models.Confession || mongoose.model('Confession', confessionSchema);