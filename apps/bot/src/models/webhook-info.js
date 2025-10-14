const mongoose = require('mongoose');

const webhookInfoSchema = new mongoose.Schema({
  botUsername: {
    type: String,
    required: true,
    unique: true
  },
  url: {
    type: String,
    required: false
  },
  hasCustomCertificate: {
    type: Boolean,
    default: false
  },
  pendingUpdateCount: {
    type: Number,
    default: 0
  },
  ipAddress: {
    type: String
  },
  lastErrorDate: {
    type: Number // Unix timestamp
  },
  lastErrorMessage: {
    type: String
  },
  lastSynchronizationErrorDate: {
    type: Number // Unix timestamp
  },
  maxConnections: {
    type: Number,
    default: 40
  },
  allowedUpdates: [{
    type: String
  }],
  healthScore: {
    type: Number,
    default: 100,
    min: 0,
    max: 100
  },
  metrics: {
    totalUpdates: {
      type: Number,
      default: 0
    },
    successfulUpdates: {
      type: Number,
      default: 0
    },
    failedUpdates: {
      type: Number,
      default: 0
    },
    averageProcessingTime: {
      type: Number,
      default: 0
    },
    lastSuccessTime: {
      type: Date
    },
    lastErrorTime: {
      type: Date
    }
  },
  updateTypes: {
    message: { type: Number, default: 0 },
    callback_query: { type: Number, default: 0 },
    inline_query: { type: Number, default: 0 },
    channel_post: { type: Number, default: 0 },
    edited_message: { type: Number, default: 0 },
    edited_channel_post: { type: Number, default: 0 },
    poll: { type: Number, default: 0 },
    poll_answer: { type: Number, default: 0 },
    my_chat_member: { type: Number, default: 0 },
    chat_member: { type: Number, default: 0 },
    chat_join_request: { type: Number, default: 0 }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'webhook_info'
});

// Indexes for performance (botUsername already has unique index from schema)
webhookInfoSchema.index({ healthScore: -1 });
webhookInfoSchema.index({ updatedAt: -1 });

// Virtual for calculating uptime
webhookInfoSchema.virtual('uptime').get(function() {
  if (!this.createdAt) return 0;
  return Date.now() - this.createdAt.getTime();
});

// Virtual for success rate
webhookInfoSchema.virtual('successRate').get(function() {
  if (!this.metrics || this.metrics.totalUpdates === 0) return 0;
  return (this.metrics.successfulUpdates / this.metrics.totalUpdates * 100).toFixed(2);
});

// Virtual for error rate
webhookInfoSchema.virtual('errorRate').get(function() {
  if (!this.metrics || this.metrics.totalUpdates === 0) return 0;
  return (this.metrics.failedUpdates / this.metrics.totalUpdates * 100).toFixed(2);
});

// Method to update metrics
webhookInfoSchema.methods.updateMetrics = function(update) {
  this.metrics.totalUpdates++;
  
  if (update.success) {
    this.metrics.successfulUpdates++;
    this.metrics.lastSuccessTime = new Date();
  } else {
    this.metrics.failedUpdates++;
    this.metrics.lastErrorTime = new Date();
  }
  
  // Update processing time average
  if (update.processingTime) {
    const currentAvg = this.metrics.averageProcessingTime || 0;
    const totalTime = currentAvg * (this.metrics.totalUpdates - 1) + update.processingTime;
    this.metrics.averageProcessingTime = Math.round(totalTime / this.metrics.totalUpdates);
  }
  
  // Update update type counter
  if (update.type && this.updateTypes[update.type] !== undefined) {
    this.updateTypes[update.type]++;
  }
  
  return this.save();
};

// Method to calculate health score
webhookInfoSchema.methods.calculateHealthScore = function() {
  let score = 100;
  
  // Deduct for errors
  if (this.lastErrorMessage) {
    score -= 30;
    if (this.lastErrorDate && (Date.now() - this.lastErrorDate * 1000) < 300000) {
      score -= 20; // Recent error (within 5 minutes)
    }
  }
  
  // Deduct for pending updates
  if (this.pendingUpdateCount > 0) {
    score -= Math.min(30, this.pendingUpdateCount * 2);
  }
  
  // Deduct for sync errors
  if (this.lastSynchronizationErrorDate) {
    score -= 10;
  }
  
  // Consider success rate
  const successRate = parseFloat(this.successRate);
  if (successRate < 90) {
    score -= (90 - successRate) * 0.5;
  }
  
  // Consider average processing time
  if (this.metrics.averageProcessingTime > 5000) {
    score -= 10;
  } else if (this.metrics.averageProcessingTime > 2000) {
    score -= 5;
  }
  
  this.healthScore = Math.max(0, Math.min(100, Math.round(score)));
  return this.healthScore;
};

// Method to get health status
webhookInfoSchema.methods.getHealthStatus = function() {
  const score = this.healthScore;
  if (score >= 90) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'fair';
  if (score >= 30) return 'poor';
  return 'critical';
};

// Method to format for admin display
webhookInfoSchema.methods.toAdminFormat = function() {
  return {
    botUsername: this.botUsername,
    url: this.url || 'Not configured',
    ipAddress: this.ipAddress,
    pendingUpdates: this.pendingUpdateCount,
    maxConnections: this.maxConnections,
    allowedUpdates: this.allowedUpdates || [],
    hasCustomCertificate: this.hasCustomCertificate,
    lastError: this.lastErrorMessage ? {
      message: this.lastErrorMessage,
      date: this.lastErrorDate ? new Date(this.lastErrorDate * 1000).toISOString() : null,
      timeAgo: this.lastErrorDate ? 
        `${Math.round((Date.now() - this.lastErrorDate * 1000) / 60000)} minutes ago` : null
    } : null,
    health: {
      score: this.healthScore,
      status: this.getHealthStatus(),
      color: this.getHealthColor()
    },
    metrics: {
      totalUpdates: this.metrics.totalUpdates,
      successfulUpdates: this.metrics.successfulUpdates,
      failedUpdates: this.metrics.failedUpdates,
      successRate: `${this.successRate}%`,
      errorRate: `${this.errorRate}%`,
      averageResponseTime: `${this.metrics.averageProcessingTime}ms`,
      lastSuccess: this.metrics.lastSuccessTime,
      lastError: this.metrics.lastErrorTime
    },
    updateTypes: this.updateTypes,
    uptime: Math.floor(this.uptime / 3600000) + ' hours',
    lastUpdated: this.updatedAt
  };
};

// Method to format for analytics
webhookInfoSchema.methods.toAnalyticsFormat = function() {
  return {
    timestamp: Date.now(),
    botUsername: this.botUsername,
    pendingUpdates: this.pendingUpdateCount,
    hasErrors: !!this.lastErrorMessage,
    errorAge: this.lastErrorDate ? 
      Math.round((Date.now() - this.lastErrorDate * 1000) / 1000) : null,
    healthScore: this.healthScore,
    status: this.getHealthStatus(),
    metrics: {
      totalUpdates: this.metrics.totalUpdates,
      successRate: parseFloat(this.successRate),
      errorRate: parseFloat(this.errorRate),
      averageProcessingTime: this.metrics.averageProcessingTime
    },
    updateDistribution: this.updateTypes
  };
};

// Helper method to get health color
webhookInfoSchema.methods.getHealthColor = function() {
  const score = this.healthScore;
  if (score >= 90) return '#10b981'; // green
  if (score >= 70) return '#3b82f6'; // blue
  if (score >= 50) return '#f59e0b'; // yellow
  if (score >= 30) return '#f97316'; // orange
  return '#ef4444'; // red
};

// Pre-save middleware to update timestamps and calculate health
webhookInfoSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  this.calculateHealthScore();
  next();
});

// Static method to get all webhook statuses
webhookInfoSchema.statics.getAllStatuses = async function() {
  const webhooks = await this.find({}).sort({ updatedAt: -1 });
  return webhooks.map(w => w.toAdminFormat());
};

// Static method to get unhealthy webhooks
webhookInfoSchema.statics.getUnhealthy = async function(threshold = 70) {
  return await this.find({ healthScore: { $lt: threshold } })
    .sort({ healthScore: 1 });
};

const WebhookInfo = mongoose.model('WebhookInfo', webhookInfoSchema);

module.exports = WebhookInfo;
