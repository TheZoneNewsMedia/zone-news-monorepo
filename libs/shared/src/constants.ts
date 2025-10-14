// Shared constants for Zone News

export const TIER_CONFIGS = {
  free: {
    name: 'free' as const,
    price: 0,
    limits: {
      maxArticlesPerDay: 10,
      maxChannels: 0,
      maxPostsPerDay: 0,
      historyDays: 7
    },
    features: {
      miniAppAccess: true,
      aiSummaries: false,
      earlyAccess: false,
      apiAccess: false,
      analytics: false,
      customBranding: false,
      whiteLabel: false
    }
  },
  pro: {
    name: 'pro' as const,
    price: 14.99,
    limits: {
      maxArticlesPerDay: 50,
      maxChannels: 1,
      maxPostsPerDay: 25,
      historyDays: 30
    },
    features: {
      miniAppAccess: true,
      aiSummaries: true,
      earlyAccess: true,
      apiAccess: false,
      analytics: true,
      customBranding: false,
      whiteLabel: false
    }
  },
  business: {
    name: 'business' as const,
    price: 29.99,
    limits: {
      maxArticlesPerDay: 200,
      maxChannels: 5,
      maxPostsPerDay: -1, // unlimited
      historyDays: 90
    },
    features: {
      miniAppAccess: true,
      aiSummaries: true,
      earlyAccess: true,
      apiAccess: true,
      analytics: true,
      customBranding: true,
      whiteLabel: false
    }
  },
  enterprise: {
    name: 'enterprise' as const,
    price: 99.99,
    limits: {
      maxArticlesPerDay: -1, // unlimited
      maxChannels: -1, // unlimited
      maxPostsPerDay: -1, // unlimited
      historyDays: -1 // unlimited
    },
    features: {
      miniAppAccess: true,
      aiSummaries: true,
      earlyAccess: true,
      apiAccess: true,
      analytics: true,
      customBranding: true,
      whiteLabel: true
    }
  }
};

export const API_ENDPOINTS = {
  NEWS: '/api/news',
  USER: '/api/user',
  AUTH: '/api/auth',
  TIER: '/api/tier',
  CHANNEL: '/api/channel',
  ANALYTICS: '/api/analytics'
};

export const TELEGRAM_COMMANDS = {
  START: '/start',
  HELP: '/help',
  NEWS: '/news',
  SUBSCRIBE: '/subscribe',
  MYTIER: '/mytier',
  UPGRADE: '/upgrade',
  SETTINGS: '/settings',
  POST: '/post',
  CHANNELS: '/channels'
};