# Zone News Telegram Mini App

A React-based Telegram Mini App for Zone News, providing tier-based news access with a native Telegram experience.

## Features

### Free Tier
- 10 articles per day
- Basic categories
- Save articles for later
- View reactions and engagement

### Pro Tier ($14.99/mo)
- 50 articles per day  
- AI-powered summaries
- Early access to news (30-60 min)
- Advanced search
- 30-day history

### Business Tier ($29.99/mo)
- 200 articles per day
- All Pro features
- API access
- Analytics dashboard
- Custom branding

## Tech Stack

- **React 18** with TypeScript
- **Vite** for fast development
- **Tailwind CSS** for styling
- **Framer Motion** for animations
- **React Query** for data fetching
- **Zustand** for state management
- **Telegram WebApp SDK**

## Development

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

## Testing in Telegram

1. Start the dev server: `pnpm dev`
2. Use ngrok or similar to expose local server: `ngrok http 3003`
3. Set the Mini App URL in BotFather
4. Open the bot and launch the Mini App

## Components Structure

```
src/
├── components/
│   ├── Header.tsx        # Top navigation
│   ├── NewsFeed.tsx      # Main news list
│   ├── NewsCard.tsx      # Individual news item
│   ├── ArticleView.tsx   # Full article reader
│   ├── ProfileView.tsx   # User profile & settings
│   ├── TierBanner.tsx    # Upgrade prompts
│   └── BottomNav.tsx     # Bottom navigation
├── hooks/
│   └── useTelegramUser.ts # Telegram user integration
├── store/
│   └── useStore.ts       # Global state management
└── App.tsx               # Main app component
```

## API Integration

The app expects these endpoints:

- `GET /api/news` - Fetch news articles
- `GET /api/news?category={category}` - Filter by category
- `GET /api/user/{userId}/tier` - Get user tier
- `POST /api/article/{id}/reaction` - Add reaction
- `GET /api/article/{id}` - Get single article

## Telegram Integration

### WebApp Methods Used
- `Telegram.WebApp.expand()` - Expand to full height
- `Telegram.WebApp.ready()` - Signal app is ready
- `Telegram.WebApp.initDataUnsafe` - Get user data
- `Telegram.WebApp.themeParams` - Apply Telegram theme
- `Telegram.WebApp.HapticFeedback` - Haptic feedback
- `Telegram.WebApp.openTelegramLink()` - Open links

### Deep Links
- `/start=upgrade` - Open upgrade flow
- `/start=subscription` - Manage subscription
- Share URLs via `t.me/share/url`

## Deployment

1. Build the app: `pnpm build`
2. Upload `dist/` to your server
3. Serve via nginx or similar
4. Update Mini App URL in BotFather

## Environment Variables

```env
VITE_API_URL=https://api.thezonenews.com
VITE_BOT_USERNAME=ZoneNewsBot
```

## Tier Limits

The app enforces these tier limits:

| Feature | Free | Pro | Business | Enterprise |
|---------|------|-----|----------|------------|
| Articles/day | 10 | 50 | 200 | Unlimited |
| Save articles | 5 | 50 | Unlimited | Unlimited |
| History | 7 days | 30 days | 90 days | Unlimited |
| AI Summaries | ❌ | ✅ | ✅ | ✅ |
| Early Access | ❌ | ✅ | ✅ | ✅ |

## Security

- User authentication via Telegram initData
- Server-side validation of all tier limits
- API rate limiting per user tier
- Secure token handling