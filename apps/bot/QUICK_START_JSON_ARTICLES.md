# Quick Start: JSON Article Submission

## 🚀 5-Minute Setup

### 1. Install Dependencies
```bash
cd /Users/georgesimbe/telegramNewsBot/zone-news-monorepo/apps/bot
npm install ajv ajv-formats
```

### 2. Add to Bot (index.js)

**Import:**
```javascript
const AdminArticleJSONSubmissionService = require('./src/services/admin-article-json-submission.service');
```

**Initialize (after ArticleCurationService):**
```javascript
const jsonSubmissionService = new AdminArticleJSONSubmissionService(
  bot,
  db,
  articleCurationService
);
await jsonSubmissionService.initialize();
jsonSubmissionService.startCleanupInterval();
```

### 3. Configure .env
```bash
ADMIN_IDS=your_telegram_user_id
```

### 4. Restart
```bash
pm2 restart zone-telegram-bot
```

### 5. Test
Message your bot:
```
/submit_article
```

Then paste:
```json
{
  "title": "Test: Adelaide Weather Update",
  "content": "Adelaide is experiencing pleasant weather today with clear skies and temperatures around 22 degrees. Perfect conditions for outdoor activities across the city."
}
```

---

## 📝 Daily Usage

### Step 1: Start Submission
```
/submit_article
```

### Step 2: Send Your JSON

**Quick Article (Minimal):**
```json
{
  "title": "Your Headline Here",
  "content": "Your article text here..."
}
```

**Standard Article (Recommended):**
```json
{
  "title": "Adelaide Tech Startup Raises $5M",
  "content": "A local Adelaide technology startup...",
  "category": "business",
  "imageUrl": "https://thezonenews.com/images/startup.jpg",
  "tags": ["startup", "adelaide", "funding"]
}
```

### Step 3: Approve & Post
- Click "✅ Approve & Post"
- Done! 🎉

---

## 🎯 Categories

- `general` - General news
- `business` - Business & finance
- `technology` - Tech news
- `politics` - Politics & government
- `sports` / `sport` - Sports
- `health` - Health & wellbeing
- `science` - Science & research
- `entertainment` - Arts & culture
- `environment` - Environment
- `weather` - Weather updates

---

## 💡 Bot Commands

| Command | What It Does |
|---------|--------------|
| `/submit_article` | Start JSON submission |
| `/article_template` | Get copy-paste templates |
| `/article_schema` | Full documentation |
| `/cancel` | Exit submission mode |

---

## 🆘 Quick Fixes

**"Invalid JSON format"**
→ Use [jsonlint.com](https://jsonlint.com) to validate

**"Only available to administrators"**
→ Add your ID to `ADMIN_IDS` in .env

**"Schema validation failed"**
→ Check you have `title` and `content` fields

**Command not working**
→ `pm2 restart zone-telegram-bot`

---

## 📚 Full Documentation

- **User Guide:** `docs/ADMIN_ARTICLE_JSON_SUBMISSION_GUIDE.md`
- **Integration:** `INTEGRATION_INSTRUCTIONS.md`
- **Schema:** `src/schemas/admin-article-submission.schema.json`

---

**That's it! You're ready to submit articles via JSON.** 🎉
