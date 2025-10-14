# Zone News Bot

Advanced Telegram bot for news distribution and user engagement.

## 🚀 Quick Start

### Development
```bash
# Install dependencies
npm install

# Copy environment template
cp .env.template .env

# Edit .env with your configuration
nano .env

# Run database migrations
npm run db:migrate

# Seed with sample data (optional)
npm run db:seed

# Start in development mode
npm run dev
```

### Production
```bash
# Install dependencies
npm install --production

# Copy production template
cp .env.production.template .env

# Edit .env with production values
nano .env

# Run migrations
npm run db:migrate

# Start with PM2
npm run start:pm2

# Check status
npm run status
```

## 📋 Available Scripts

- `npm run dev` - Start in development mode with nodemon
- `npm run start` - Start in production mode
- `npm run start:pm2` - Start with PM2 process manager
- `npm run stop` - Stop PM2 process
- `npm run restart` - Restart PM2 process
- `npm run logs` - View PM2 logs
- `npm run health` - Check bot health
- `npm run deploy` - Deploy to production server
- `npm run db:migrate` - Run database migrations
- `npm run db:seed` - Seed database with sample data
- `npm run test` - Run tests
- `npm run lint` - Run ESLint

## 🔧 Configuration

### Required Environment Variables

- `TELEGRAM_BOT_TOKEN` - Your bot token from @BotFather
- `MONGODB_URI` - MongoDB connection string
- `ADMIN_IDS` - Comma-separated admin user IDs

### Optional Configuration

See `.env.production.template` for all available options.

## 📁 Project Structure

```
src/
├── api/           # Health check endpoints
├── config/        # Configuration management
├── handlers/      # Message and callback handlers
├── services/      # Core bot services
│   ├── callbacks/ # Callback query handlers
│   ├── commands/  # Command handlers
│   └── utils/     # Utility functions
└── utils/         # Shared utilities

scripts/           # Deployment and maintenance scripts
__tests__/         # Test files
```

## 🏥 Health Monitoring

The bot provides health check endpoints:

- `GET /health` - Basic health status
- `GET /api/health` - Detailed health information
- `GET /api/health/detailed` - Comprehensive system status

## 🚀 Deployment

### Automatic Deployment
```bash
npm run deploy
```

### Manual Deployment
```bash
# Create deployment package
npm run deploy:package

# Upload to server
scp bot-deploy.tar.gz root@server:/tmp/

# SSH to server and extract
ssh root@server
cd /root/zone-news-monorepo/apps/bot
tar -xzf /tmp/bot-deploy.tar.gz
npm install --production
pm2 reload zone-telegram-bot
```

## 🔒 Security

- Environment variables are validated on startup
- Admin commands require authorization
- Rate limiting on API endpoints
- Input validation on all user inputs
- Secure webhook endpoints (when enabled)

## 📊 Monitoring

Monitor the bot using PM2:

```bash
# View status
pm2 status zone-telegram-bot

# View logs
pm2 logs zone-telegram-bot

# Monitor in real-time
pm2 monit
```

## 🐛 Troubleshooting

### Common Issues

1. **Bot not starting**: Check `TELEGRAM_BOT_TOKEN` in `.env`
2. **Database errors**: Verify `MONGODB_URI` and run migrations
3. **Permission errors**: Check `ADMIN_IDS` configuration
4. **Webhook issues**: Verify `WEBHOOK_URL` and SSL certificate

### Debug Mode

Enable debug logging:
```bash
LOG_LEVEL=debug npm run dev
```

## 📚 Documentation

- [Bot Commands](./docs/BOT_COMMANDS_GUIDE.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Deployment](./docs/DEPLOYMENT.md)
- [API Reference](./docs/API.md)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Run linting and tests
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.