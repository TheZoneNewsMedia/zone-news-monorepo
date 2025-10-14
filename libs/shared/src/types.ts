// Shared types for Zone News monorepo

export interface User {
  id: string;
  telegramId: number;
  username?: string;
  tier: TierType;
  createdAt: Date;
  updatedAt: Date;
}

export type TierType = 'free' | 'pro' | 'business' | 'enterprise' | 'admin';

export interface TierConfig {
  name: TierType;
  price: number;
  limits: {
    maxArticlesPerDay: number;
    maxChannels: number;
    maxPostsPerDay: number;
    historyDays: number;
  };
  features: {
    miniAppAccess: boolean;
    aiSummaries: boolean;
    earlyAccess: boolean;
    apiAccess: boolean;
    analytics: boolean;
    customBranding: boolean;
    whiteLabel: boolean;
  };
}

export interface NewsArticle {
  id: string;
  title: string;
  content: string;
  summary?: string;
  category: string;
  source: string;
  url?: string;
  imageUrl?: string;
  publishedAt: Date;
  views: number;
  reactions: {
    likes: number;
    hearts: number;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface Channel {
  id: string;
  telegramId: string;
  name: string;
  type: 'staging' | 'public' | 'user';
  ownerId: string;
  createdAt: Date;
}