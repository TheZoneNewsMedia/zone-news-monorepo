# Integration Instructions: Admin Article JSON Submission

## 🎯 Purpose

This document explains how to integrate the Admin Article JSON Submission Service into your existing Zone News Bot.

---

## 📦 Step 1: Install Dependencies

```bash
cd /Users/georgesimbe/telegramNewsBot/zone-news-monorepo/apps/bot

# Install JSON validation dependencies
npm install ajv ajv-formats

# Verify installation
npm list ajv ajv-formats
```

**Expected Output:**
```
├── ajv@8.12.0
└── ajv-formats@2.1.1
```

---

## 🔧 Step 2: Locate Bot Initialization File

Find where your bot initializes services. This is usually:

```
zone-news-monorepo/apps/bot/index.js
```

or

```
zone-news-monorepo/apps/bot/src/index.js
```

---

## 📝 Step 3: Add Service Import

Add this import at the top of your bot initialization file:

```javascript
const AdminArticleJSONSubmissionService = require('./src/services/admin-article-json-submission.service');
```

**Example Integration:**

```javascript
// Existing imports
const { Telegraf } = require('telegraf');
const ArticleCurationService = require('./src/services/article-curation.service');
const AIArticleProcessor = require('./src/services/ai-article-processor.service');

// ADD THIS LINE ⬇️
const AdminArticleJSONSubmissionService = require('./src/services/admin-article-json-submission.service');
```

---

## 🚀 Step 4: Initialize Service

Add service initialization **after** ArticleCurationService is initialized:

```javascript
// Initialize bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// Connect to database
const db = await connectDatabase();

// Initialize article curation (existing)
const articleCurationService = new ArticleCurationService(bot, db);
articleCurationService.initialize();
articleCurationService.startCleanupInterval();

// ADD THESE LINES ⬇️
// Initialize JSON submission service (NEW)
const jsonSubmissionService = new AdminArticleJSONSubmissionService(
  bot,
  db,
  articleCurationService  // Pass existing curation service for approval workflow
);
await jsonSubmissionService.initialize();
jsonSubmissionService.startCleanupInterval();

console.log('✅ All services initialized');
```

---

## ⚙️ Step 5: Configure Environment Variables

Update your `.env` file to include admin user IDs:

```bash
# Admin Configuration
ADMIN_IDS=123456789,987654321  # Your Telegram user ID(s), comma-separated

# Existing AI configuration (should already be set)
GROQ_API_KEY=gsk_...
OPENROUTER_API_KEY=sk-or-v1-...

# Existing bot configuration
BOT_TOKEN=your_bot_token
CHANNEL_ID=@ZoneNewsAdl
```

**Find Your Telegram User ID:**

Send a message to your bot, then check logs:
```bash
pm2 logs zone-telegram-bot | grep "from"
```

Or use [@userinfobot](https://t.me/userinfobot) on Telegram.

---

## 🧪 Step 6: Test Installation

### 6.1 Restart Bot

```bash
pm2 restart zone-telegram-bot

# Or if not using PM2
npm start
```

### 6.2 Check Logs for Initialization

```bash
pm2 logs zone-telegram-bot --lines 50 | grep "JSON"
```

**Expected Output:**
```
✅ Admin Article JSON Submission Service initialized
```

### 6.3 Test Commands

Open Telegram and message your bot:

**Test 1: Help Command**
```
/submit_article
```

**Expected Response:**
```
📝 Article Submission Mode

Send me your article in JSON format...
[Instructions appear]
```

**Test 2: Template Command**
```
/article_template
```

**Expected Response:**
```
📋 Article JSON Templates
[Templates appear]
```

**Test 3: Submit Minimal Article**
```json
{
  "title": "Test Article - Adelaide Weather Update",
  "content": "This is a test article to verify the JSON submission system is working correctly. Adelaide is experiencing mild weather today with temperatures around 22 degrees. This test will be processed by AI and shown in preview mode."
}
```

**Expected Flow:**
1. ✅ "Processing JSON submission..."
2. ✅ "JSON parsed"
3. ✅ "Schema valid"
4. ✅ "AI processed"
5. ✅ Preview appears with approval buttons

---

## 🔍 Step 7: Verify Integration

### Check Service is Running

```bash
# Check bot status
pm2 status

# View detailed logs
pm2 logs zone-telegram-bot --lines 100
```

### Verify Commands are Registered

Message your bot: `/help`

Should include new commands:
- `/submit_article` - Submit article in JSON format
- `/article_template` - View templates
- `/article_schema` - Schema documentation

---

## 📁 File Structure After Integration

```
zone-news-monorepo/apps/bot/
├── index.js                           # Main bot file (MODIFIED)
├── package.json                       # Dependencies (MODIFIED)
├── src/
│   ├── services/
│   │   ├── article-curation.service.js              # Existing
│   │   ├── ai-article-processor.service.js          # Existing
│   │   └── admin-article-json-submission.service.js # NEW ✨
│   └── schemas/
│       └── admin-article-submission.schema.json     # NEW ✨
└── docs/
    └── ADMIN_ARTICLE_JSON_SUBMISSION_GUIDE.md       # NEW ✨
```

---

## 🐛 Troubleshooting

### Issue: "Module not found: ajv"

**Solution:**
```bash
cd /Users/georgesimbe/telegramNewsBot/zone-news-monorepo/apps/bot
npm install ajv ajv-formats
pm2 restart zone-telegram-bot
```

### Issue: "/submit_article command not found"

**Cause:** Service not initialized or bot not restarted

**Solution:**
```bash
# Check if service is imported
grep -n "AdminArticleJSONSubmissionService" index.js

# Check initialization in logs
pm2 logs zone-telegram-bot | grep "JSON Submission"

# Restart bot
pm2 restart zone-telegram-bot
```

### Issue: "This command is only available to administrators"

**Cause:** Your Telegram user ID not in ADMIN_IDS

**Solution:**
1. Find your user ID: Message [@userinfobot](https://t.me/userinfobot)
2. Update `.env`:
   ```bash
   ADMIN_IDS=your_actual_user_id
   ```
3. Restart bot: `pm2 restart zone-telegram-bot`

### Issue: "Schema validation failed"

**Cause:** Invalid JSON format

**Solution:**
- Validate JSON at [jsonlint.com](https://jsonlint.com)
- Use `/article_template` for correct examples
- Check for:
  - Missing quotes around strings
  - Trailing commas
  - Missing required fields (title, content)

---

## 📊 Complete Integration Example

Here's a complete example of a bot initialization file with JSON submission:

```javascript
// index.js - Complete example
const { Telegraf } = require('telegraf');
const mongoose = require('mongoose');

// Service imports
const ArticleCurationService = require('./src/services/article-curation.service');
const AdminArticleJSONSubmissionService = require('./src/services/admin-article-json-submission.service');

// Load environment variables
require('dotenv').config();

// Initialize bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// Database connection
async function connectDatabase() {
  await mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
  console.log('✅ Database connected');
  return mongoose.connection.db;
}

// Main initialization
async function initialize() {
  try {
    // Connect database
    const db = await connectDatabase();

    // Initialize article curation (URL-based submission)
    const articleCurationService = new ArticleCurationService(bot, db);
    articleCurationService.initialize();
    articleCurationService.startCleanupInterval();
    console.log('✅ Article Curation Service initialized');

    // Initialize JSON submission (NEW)
    const jsonSubmissionService = new AdminArticleJSONSubmissionService(
      bot,
      db,
      articleCurationService
    );
    await jsonSubmissionService.initialize();
    jsonSubmissionService.startCleanupInterval();
    console.log('✅ JSON Submission Service initialized');

    // Start bot
    await bot.launch();
    console.log('🚀 Bot started successfully');

    // Graceful shutdown
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));

  } catch (error) {
    console.error('❌ Initialization failed:', error);
    process.exit(1);
  }
}

// Run initialization
initialize();
```

---

## ✅ Verification Checklist

After integration, verify:

- [ ] Dependencies installed (`ajv`, `ajv-formats`)
- [ ] Service imported in bot file
- [ ] Service initialized after ArticleCurationService
- [ ] ADMIN_IDS configured in .env
- [ ] Bot restarted successfully
- [ ] `/submit_article` command works
- [ ] `/article_template` shows templates
- [ ] Test JSON submission processes correctly
- [ ] Preview shows with approval buttons
- [ ] Approved test article posts to channel
- [ ] No errors in logs

---

## 📚 Next Steps

After successful integration:

1. **Read User Guide:** `docs/ADMIN_ARTICLE_JSON_SUBMISSION_GUIDE.md`
2. **Test All Levels:** Minimal, Standard, Advanced submissions
3. **Create Saved Templates:** Keep your most-used JSON templates
4. **Set Up Monitoring:** Track submission success rates
5. **Train Your Team:** Share guide with other admins

---

## 🔗 Related Documentation

- **User Guide:** `docs/ADMIN_ARTICLE_JSON_SUBMISSION_GUIDE.md`
- **JSON Schema:** `src/schemas/admin-article-submission.schema.json`
- **Service Code:** `src/services/admin-article-json-submission.service.js`
- **AI Curation Guide:** `docs/AI_ARTICLE_CURATION_GUIDE.md`

---

## 🆘 Support

If you encounter issues:

1. Check logs: `pm2 logs zone-telegram-bot`
2. Verify .env configuration
3. Test with minimal JSON example
4. Review troubleshooting section above

---

**Last Updated:** January 2025
**Version:** 1.0.0
**Status:** Ready for Integration
