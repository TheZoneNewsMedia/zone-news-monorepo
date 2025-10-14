# Analytics Service - Implementation Specification

## Purpose
Track user interactions, article engagement, and bot usage metrics for Zone News Bot.

## Database Schema

### `analytics_events` Collection
```javascript
{
  _id: ObjectId,
  eventType: String,        // 'view', 'click', 'share', 'reaction', 'search'
  entityType: String,        // 'article', 'channel', 'bot', 'user'
  entityId: String,          // ID of the entity
  userId: String,            // Telegram user ID
  metadata: {
    articleId: String,
    channelId: String,
    reactionType: String,
    searchQuery: String,
    category: String,
    // Any additional event-specific data
  },
  timestamp: Date,
  sessionId: String,         // Optional session tracking
  userAgent: String,         // Optional device info
  ipAddress: String          // Optional (hashed for privacy)
}
```

### `analytics_daily_summary` Collection
```javascript
{
  _id: ObjectId,
  date: Date,                // YYYY-MM-DD
  metrics: {
    totalViews: Number,
    totalClicks: Number,
    totalShares: Number,
    totalReactions: Number,
    uniqueUsers: Number,
    topArticles: [
      { articleId: String, views: Number, title: String }
    ],
    topChannels: [
      { channelId: String, engagement: Number, name: String }
    ],
    userEngagement: {
      avgSessionDuration: Number,
      avgArticlesPerUser: Number,
      returnRate: Number
    }
  },
  createdAt: Date,
  updatedAt: Date
}
```

## API Endpoints

### POST /api/analytics/track
Track a single event
- Body: { eventType, entityType, entityId, userId, metadata }

### POST /api/analytics/batch
Track multiple events at once (for performance)
- Body: { events: [...] }

### GET /api/analytics/article/:articleId
Get analytics for specific article

### GET /api/analytics/channel/:channelId
Get analytics for specific channel

### GET /api/analytics/summary
Get aggregated analytics
- Query: ?startDate=2025-01-01&endDate=2025-01-31&granularity=daily

### GET /api/analytics/trending
Get trending content based on recent engagement

### GET /api/analytics/users/:userId
Get analytics for specific user (privacy-safe aggregates)

### POST /api/analytics/aggregate
Trigger manual aggregation for daily summaries

## Features

1. **Real-time Event Tracking**: Immediate writes with buffering
2. **Daily Aggregation**: Scheduled job for summary generation
3. **Privacy-First**: Hash PII, aggregate data, limit retention
4. **High Performance**: Batch inserts, indexed queries
5. **Insights**: Trending detection, engagement scoring

## Integration Points
- API Gateway (tracking calls)
- Bot (user interaction events)
- Frontend (view tracking)
