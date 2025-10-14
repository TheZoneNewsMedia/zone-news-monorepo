# Channels Service - Implementation Specification

## Purpose
Manage Telegram channels, their configurations, and bindings to the Zone News Bot.

## Database Schema

### `channels` Collection
```javascript
{
  _id: ObjectId,
  channelId: String,        // Telegram channel ID (e.g., "@ZoneNewsAdl")
  channelName: String,      // Display name
  channelUsername: String,  // Username without @
  channelType: String,      // 'news', 'updates', 'breaking', 'premium'
  isActive: Boolean,        // Is channel currently active
  isPrimary: Boolean,       // Is this the primary news channel
  config: {
    autoForward: Boolean,
    moderationEnabled: Boolean,
    reactionTracking: Boolean,
    notificationsEnabled: Boolean
  },
  statistics: {
    totalMessages: Number,
    totalViews: Number,
    subscriberCount: Number,
    lastPostDate: Date
  },
  createdAt: Date,
  updatedAt: Date,
  createdBy: String,        // Admin user ID
  lastModifiedBy: String
}
```

## API Endpoints

### GET /api/channels
Get all channels (with filters)
- Query params: `?type=news&active=true`
- Response: List of channels

### GET /api/channels/:id
Get single channel by ID

### POST /api/channels
Create new channel
- Body: { channelId, channelName, channelType, config }
- Validation: Check if channel exists in Telegram

### PUT /api/channels/:id
Update channel configuration

### DELETE /api/channels/:id
Soft delete channel (set isActive: false)

### GET /api/channels/:id/stats
Get detailed statistics for a channel

### POST /api/channels/:id/sync
Sync channel data from Telegram API

## Business Logic

1. **Channel Validation**: Verify channel exists and bot has access
2. **Primary Channel**: Only one channel can be primary
3. **Statistics Update**: Background job updates stats every hour
4. **Access Control**: Admin-only endpoints

## Integration Points
- Telegram Bot API (for validation)
- MongoDB (for persistence)
- API Gateway (for admin panel)
