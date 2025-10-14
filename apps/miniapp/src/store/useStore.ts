import { create } from 'zustand';
import { TierType } from '@zone/shared';

interface AppState {
  userTier: TierType;
  savedArticles: string[];
  articlesViewed: number;
  dailyLimit: number;
  
  setUserTier: (tier: TierType) => void;
  saveArticle: (articleId: string) => void;
  unsaveArticle: (articleId: string) => void;
  incrementArticlesViewed: () => void;
  resetDailyCount: () => void;
}

export const useStore = create<AppState>((set) => ({
  userTier: 'free',
  savedArticles: [],
  articlesViewed: 0,
  dailyLimit: 10,
  
  setUserTier: (tier) => set({ 
    userTier: tier,
    dailyLimit: tier === 'free' ? 10 : tier === 'pro' ? 50 : tier === 'business' ? 200 : -1
  }),
  
  saveArticle: (articleId) => set((state) => ({
    savedArticles: [...state.savedArticles, articleId]
  })),
  
  unsaveArticle: (articleId) => set((state) => ({
    savedArticles: state.savedArticles.filter(id => id !== articleId)
  })),
  
  incrementArticlesViewed: () => set((state) => ({
    articlesViewed: state.articlesViewed + 1
  })),
  
  resetDailyCount: () => set({ articlesViewed: 0 })
}));