# Telegram Bot Reaction System Documentation

## Overview
The Zone News Bot reaction system allows users to react to messages with emoji reactions that persist in MongoDB and update in real-time.

## Configuration

### Environment Variables
```bash
TELEGRAM_BOT_TOKEN=8132879580:AAHcr9tEN-l46wyQsnpx8FE_wMo7qQ9ca_A
WEBHOOK_MODE=true
WEBHOOK_URL=https://thezonenews.com/webhook
WEBHOOK_PORT=8443
MONGODB_URI=mongodb://localhost:27017/zone_news_production
```

### Webhook Setup
- **Webhook URL**: `https://thezonenews.com/bot/webhook/{BOT_TOKEN}`
- **Nginx forwards**: `/bot/webhook/` → `http://127.0.0.1:8443`
- **Bot listens on**: Port 8443 (HTTP)

## Architecture

### Key Components

1. **EmojiReactionHandler** (`src/services/emoji-reaction-handler.js`)
   - Handles all reaction callback queries
   - Manages spam prevention (1 reaction per type per user)
   - Syncs reaction counts with user arrays
   - Answers callbacks immediately for fast UX

2. **CommandRegistry** (`src/services/command-registry.js`)
   - Routes callback queries to appropriate handlers
   - Delegates `persist_*` callbacks to EmojiReactionHandler

3. **MongoDB Schema**
   ```javascript
   {
     message_key: "tbc_59027",  // Format: {channel}_{messageId}
     message_id: 59027,
     chat_id: -1002665614394,
     reactions: {
       like: 0,
       love: 1,
       fire: 0,
       party: 0,
       happy: 0,
       wow: 0
     },
     user_reactions: {
       like: [],
       love: [7802629063],  // Array of user IDs
       fire: [],
       party: [],
       happy: [],
       wow: []
     },
     total_count: 1,
     schema_version: 2,
     created_at: Date,
     last_updated: Date
   }
   ```

## Features

### Spam Prevention
- Users can only have 1 reaction per type per message
- Changing reactions removes the previous one automatically
- All changes are atomic and consistent

### Performance Optimizations
1. **Instant feedback**: Callback answered immediately (stops loading spinner)
2. **Background processing**: Reaction updates happen asynchronously
3. **Efficient queries**: Single database operation per reaction change

### Data Consistency
- Reaction counts always match user arrays
- Automatic cleanup of invalid/duplicate entries
- Schema migration for backward compatibility

## Message Flow

1. User clicks reaction button
2. Telegram sends callback query to webhook
3. Nginx forwards to bot on port 8443
4. Bot immediately answers callback (stops loading)
5. Bot processes reaction in background:
   - Fetches current reaction state
   - Updates user reactions (add/remove/change)
   - Recalculates counts
   - Saves to MongoDB
   - Updates inline keyboard

## Monitoring

### Health Check
```bash
curl http://localhost:8443/health
```

### Check Webhook Status
```bash
curl https://api.telegram.org/bot{TOKEN}/getWebhookInfo
```

### View Logs
```bash
pm2 logs zone-telegram-bot
```

## Database Maintenance

### Check Reaction Statistics
```javascript
db.zone_persistent_reactions.aggregate([
  { $match: { total_count: { $gt: 0 } } },
  { $group: {
    _id: null,
    total_reactions: { $sum: "$total_count" },
    messages_with_reactions: { $sum: 1 }
  }}
])
```

### Clean Invalid Entries
```javascript
// Remove entries with null message_key
db.zone_persistent_reactions.deleteMany({ 
  message_key: { $in: [null, ""] } 
})
```

## Troubleshooting

### Common Issues

1. **"Update failed" error**
   - Check webhook is properly configured
   - Verify bot is running: `pm2 status zone-telegram-bot`
   - Check logs for errors: `pm2 logs zone-telegram-bot --lines 100`

2. **Reactions not persisting**
   - Check MongoDB connection
   - Verify message_key format is correct
   - Check user_reactions arrays are properly initialized

3. **Slow reaction updates**
   - Ensure callback is answered early (before processing)
   - Check database query performance
   - Monitor server resources

## Production Deployment

1. **Start the bot**:
   ```bash
   pm2 start zone-telegram-bot
   ```

2. **Save PM2 configuration**:
   ```bash
   pm2 save
   pm2 startup
   ```

3. **Monitor status**:
   ```bash
   pm2 status
   pm2 monit
   ```

## Security Notes

- Bot token is stored in environment variables (not hardcoded)
- Webhook uses HTTPS for secure communication
- Database connections use localhost (not exposed)
- Input validation on all callback data

---
*Last Updated: August 27, 2025*
*Working Configuration - All reaction features operational*