# Zone News Bot - Deployment & Stabilization Guide

## 🚀 Quick Deployment Steps

### 1. Prepare Local Environment
```bash
# Navigate to bot directory
cd zone-news-monorepo/apps/bot

# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Edit .env with your values
```

### 2. Test Locally First
```bash
# Run bot locally
npm run dev

# Test core features:
# - /start
# - /post
# - /about
# - /groups
# - /channels
```

### 3. Deploy to Server

```bash
# SSH to server
ssh root@67.219.107.230

# Navigate to deployment directory
cd /root/zone-news-monorepo/apps/bot

# Pull latest code
git pull origin main

# Install dependencies
npm install

# Stop current bot
pm2 stop zone-telegram-bot

# Start bot with PM2
pm2 start ecosystem.config.js --name zone-telegram-bot

# Save PM2 configuration
pm2 save
pm2 startup
```

## 🔧 Stabilization Checklist

### Pre-Deployment
- [x] All modules imported correctly
- [x] No syntax errors
- [x] Dependencies installed
- [x] Environment variables set
- [x] MongoDB running
- [x] Database indexes created

### Core Services
- [x] CommandService initialized
- [x] TierManager working
- [x] PostManager functional
- [x] MediaHandler ready
- [x] ScheduledPosting active
- [x] PaymentSystem configured
- [x] OnboardingFlow registered
- [x] TemplateSystem available
- [x] BulkEditSystem ready

### Command Registration
- [x] Admin commands
- [x] Info commands
- [x] News commands
- [x] User commands
- [x] Subscription commands
- [x] Posting commands
- [x] Help commands
- [x] Usage commands
- [x] Onboarding commands

### Callback Handlers
- [x] News callbacks
- [x] Settings callbacks
- [x] General callbacks
- [x] Onboarding callbacks
- [x] Template callbacks
- [x] Bulk operation callbacks

## 📊 PM2 Configuration

### ecosystem.config.js
```javascript
module.exports = {
  apps: [{
    name: 'zone-telegram-bot',
    script: 'index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
}
```

## 🔍 Monitoring Commands

### Check Bot Status
```bash
# View all PM2 processes
pm2 list

# Check specific bot
pm2 show zone-telegram-bot

# View real-time logs
pm2 logs zone-telegram-bot

# Monitor resources
pm2 monit
```

### Database Health
```bash
# Connect to MongoDB
mongosh

# Switch to database
use zone_news_production

# Check collections
show collections

# Count documents
db.users.countDocuments()
db.post_history.countDocuments()
db.scheduled_posts.countDocuments()
```

### Server Resources
```bash
# Check disk space
df -h

# Check memory
free -m

# Check CPU
top

# Check network
netstat -tulpn | grep 3000
```

## 🐛 Troubleshooting Steps

### Bot Not Starting
```bash
# 1. Check logs
pm2 logs zone-telegram-bot --lines 100

# 2. Check syntax errors
node -c index.js

# 3. Test manually
node index.js

# 4. Check environment variables
cat .env

# 5. Verify MongoDB connection
mongosh --eval "db.serverStatus()"
```

### Commands Not Working
```bash
# 1. Check command registration
grep -r "register()" src/services/

# 2. Verify module imports
grep -r "require(" src/services/command-service.js

# 3. Check for missing files
find src/services -name "*.js" | wc -l

# 4. Test specific command
# Send /help to bot and check response
```

### Memory Issues
```bash
# 1. Restart with memory limit
pm2 restart zone-telegram-bot --max-memory-restart 500M

# 2. Clear old logs
pm2 flush

# 3. Clean MongoDB
mongosh --eval "db.runCommand({compact:'post_history'})"

# 4. Remove old media
find /root/zone-news-monorepo/media -mtime +30 -delete
```

## 🔒 Security Hardening

### 1. Environment Variables
```bash
# Never commit .env file
echo ".env" >> .gitignore

# Use strong bot token
# Set admin IDs correctly
ADMIN_IDS=your_telegram_id

# Secure payment keys
STRIPE_SECRET_KEY=sk_live_xxx
```

### 2. Database Security
```bash
# Enable MongoDB auth
mongosh
use admin
db.createUser({
  user: "zonenews",
  pwd: "secure_password",
  roles: ["readWrite"]
})

# Update connection string
MONGODB_URI=mongodb://zonenews:secure_password@localhost:27017/zone_news_production
```

### 3. Server Security
```bash
# Setup firewall
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# Disable root SSH (use key auth)
sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart sshd
```

## 📈 Performance Optimization

### 1. Database Indexes
```javascript
// Run in MongoDB shell
use zone_news_production

// User indexes
db.users.createIndex({ user_id: 1 }, { unique: true })
db.users.createIndex({ tier: 1 })
db.users.createIndex({ affiliate_code: 1 })

// Post history indexes
db.post_history.createIndex({ user_id: 1, created_at: -1 })
db.post_history.createIndex({ created_at: -1 })

// Scheduled posts indexes
db.scheduled_posts.createIndex({ user_id: 1, status: 1 })
db.scheduled_posts.createIndex({ scheduled_time: 1, status: 1 })

// Templates indexes
db.post_templates.createIndex({ user_id: 1 })
db.post_templates.createIndex({ type: 1 })

// Destinations indexes
db.bot_destinations.createIndex({ chat_id: 1 }, { unique: true })
db.bot_destinations.createIndex({ type: 1, bot_is_member: 1 })
```

### 2. Caching Strategy
```javascript
// Implement Redis caching for:
// - User tier lookups
// - Bot destination checks
// - Template lists
// - Usage statistics
```

### 3. Rate Limiting
```javascript
// Already implemented in TierManager
// Adjust limits based on server capacity
```

## ✅ Final Verification

### Test All Features
```bash
# Run comprehensive test
node test-comprehensive.js

# Expected output:
# ✅ All 8 test categories passed
# ✅ 42 individual tests passed
# ✅ No errors detected
```

### Manual Testing
1. Send `/start` - Verify welcome message
2. Click "About" - Check page loads
3. Click "Groups" - Verify content
4. Click "Channels" - Check information
5. Send `/post` - Create test post
6. Send `/schedule` - Schedule a post
7. Send `/templates` - Check system
8. Send `/help` - Verify commands
9. Send `/usage` - Check statistics
10. Send `/subscribe` - Verify plans

## 📝 Maintenance Schedule

### Daily Tasks
```bash
# Check bot status
pm2 status

# Review error logs
pm2 logs zone-telegram-bot --err --lines 50

# Check disk space
df -h
```

### Weekly Tasks
```bash
# Backup database
mongodump --db zone_news_production --out /backup/$(date +%Y%m%d)

# Clear old logs
pm2 flush

# Update dependencies
npm outdated
```

### Monthly Tasks
```bash
# Security updates
apt update && apt upgrade

# Review performance metrics
pm2 show zone-telegram-bot

# Clean old data
mongosh zone_news_production --eval "
  db.post_history.deleteMany({
    created_at: { \$lt: new Date(Date.now() - 90*24*60*60*1000) }
  })
"
```

## 🎯 Success Criteria

The bot is considered stable when:
- ✅ Uptime > 99.9% (PM2 auto-restart working)
- ✅ Response time < 500ms for commands
- ✅ All core features functional
- ✅ No unhandled errors in logs
- ✅ Memory usage stable (< 500MB)
- ✅ Database queries optimized (< 100ms)
- ✅ User feedback positive
- ✅ Payment processing working
- ✅ Scheduled posts executing on time
- ✅ Media uploads successful

## 🚨 Emergency Procedures

### Bot Completely Down
```bash
# 1. SSH to server
ssh root@67.219.107.230

# 2. Force restart everything
pm2 kill
pm2 start ecosystem.config.js

# 3. Check MongoDB
systemctl restart mongod

# 4. Verify bot responding
curl https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe
```

### Database Corrupted
```bash
# 1. Stop bot
pm2 stop zone-telegram-bot

# 2. Restore from backup
mongorestore --db zone_news_production /backup/latest/

# 3. Restart bot
pm2 start zone-telegram-bot
```

### Payment Issues
```bash
# 1. Check Stripe webhook
curl https://thezonenews.com/webhook/stripe

# 2. Verify PayPal IPN
curl https://thezonenews.com/webhook/paypal

# 3. Review payment logs
grep -i payment /root/zone-news-monorepo/logs/*.log
```

---

**Bot Status:** Ready for Production
**Last Stabilization:** 2025-08-15
**Version:** 1.0.0
**Maintainer:** Zone News Team