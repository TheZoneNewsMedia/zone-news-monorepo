# Zone News Bot - Complete Commands Guide

## ✅ Bot Status
- **Bot Username**: @ZoneNewsBot
- **Status**: ✅ RUNNING
- **Webhook**: Active at https://bot.thezonenews.com/webhook
- **Architecture**: Modular (11 specialized modules)

## 📋 All Available Commands

### 🚀 General Commands
- `/start` - Main menu and welcome screen
- `/help` - Comprehensive help system
- `/about` - Bot information and statistics
- `/feedback` - Submit feedback
- `/report` - Report issues

### 📰 News Commands
- `/news` - Browse latest news with pagination
- `/trending` - Show trending articles
- `/search` - Search articles by keywords
- `/categories` - List and manage news categories

### 👤 User Commands
- `/mystats` - View your statistics
- `/settings` - Manage preferences
- `/saved` - View saved articles
- `/share` - Share bot or articles

### 📬 Subscription Commands
- `/subscribe` - Subscribe to categories
- `/unsubscribe` - Unsubscribe from categories

### 👑 Admin Commands (Admin Only)
- `/admin` - Admin panel dashboard
- `/post` - Post articles to groups/channels
- `/add` - Add destination (group/channel)
- `/remove` - Remove destination
- `/list` - List all destinations
- `/channels` - Manage channels
- `/groups` - Manage groups
- `/broadcast` - Send message to all users
- `/stats` - Bot statistics
- `/users` - User management
- `/backup` - Backup database
- `/logs` - View bot logs
- `/restart` - Restart bot
- `/analytics` - View analytics
- `/schedule` - Schedule posts

## 🎯 How to Post to Groups/Channels

### Step 1: Add Bot to Group/Channel
1. Add @ZoneNewsBot to your group/channel
2. Make bot an admin with "Post Messages" permission

### Step 2: Register Group/Channel with Bot
**Option A - Using Chat ID:**
```
/add -100123456789
```

**Option B - Using Username (channels only):**
```
/add @yourchannel
```

**Option C - Forward Message:**
- Forward any message from the group/channel to the bot
- Bot will detect and offer to add it

### Step 3: Post Articles
1. Use `/post` command
2. Select an article from the list
3. Choose destination(s)
4. Confirm and send

### Step 4: Manage Destinations
- `/list` - See all registered destinations
- `/channels` - Toggle channels on/off
- `/groups` - Toggle groups on/off
- `/remove` - Remove a destination

## 🔧 Troubleshooting

### Commands Not Working?
1. **Check bot is running**: Bot should respond to /start
2. **For admin commands**: Make sure your Telegram ID is in ADMIN_IDS
3. **For group posting**: Ensure bot has admin rights in the group

### Group Posting Issues?
1. **Bot must be admin** in the group
2. **Check permissions**: Bot needs "Post Messages" permission
3. **Use `/list`** to verify group is registered
4. **Test with `/post`** to see if articles are available

### Database Issues?
- Email index error has been fixed
- User tracking is working
- If seeing old errors in logs, they're from before the fix

## 📊 Current Module Structure

```
/services/
├── command-service.js         # Main integration
├── admin-commands.js          # Admin functionality
├── utils/
│   └── command-utils.js      # Shared utilities
├── commands/
│   ├── info-commands.js      # /start, /help, /about
│   ├── news-commands.js      # /news, /trending, /search
│   ├── user-commands.js      # /mystats, /settings, /saved
│   └── subscription-commands.js # /subscribe, /unsubscribe
└── callbacks/
    ├── news-callbacks.js      # News navigation
    ├── settings-callbacks.js  # Settings management
    └── general-callbacks.js   # General callbacks
```

## 🚨 Important Notes

1. **Admin Access**: Only users with IDs in ADMIN_IDS can use admin commands
2. **Group IDs**: Always start with -100 (e.g., -1001234567890)
3. **Channel Usernames**: Must start with @ (e.g., @channelname)
4. **Reactions**: Persistent across bot restarts (LocalReactionSync)
5. **Mini App**: Available at https://thezonenews.com/miniapp

## 📱 Quick Test

Test if bot is working:
```
1. Send /start to @ZoneNewsBot
2. You should see the welcome menu
3. Try /help for command list
4. Admins: Try /admin for admin panel
```

## 🔄 Recent Fixes (2025-08-14)

✅ Modularized command-service.js (3742 lines → 11 modules)
✅ Fixed MongoDB index issues (removed email/username unique constraints)
✅ Added missing /start command
✅ Stabilized bot (no more restart loops)
✅ All commands properly registered with bind(this)
✅ Webhook active and receiving updates

---
*Last Updated: 2025-08-14*