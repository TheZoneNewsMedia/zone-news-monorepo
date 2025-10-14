import React from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { NewsArticle } from '@zone/shared';
import NewsCard from './NewsCard';
import { useStore } from '../store/useStore';

interface SavedArticlesProps {
  onArticleSelect: (article: NewsArticle) => void;
}

const SavedArticles: React.FC<SavedArticlesProps> = ({ onArticleSelect }) => {
  const { userId, userTier } = useStore();
  const queryClient = useQueryClient();
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const userServiceUrl = import.meta.env.VITE_USER_SERVICE_URL || 'http://localhost:3016';
  
  // Fetch saved articles
  const { data: savedArticles, isLoading, error } = useQuery<NewsArticle[]>(
    ['savedArticles', userId],
    async () => {
      if (!userId) throw new Error('User not authenticated');
      
      const response = await fetch(`${userServiceUrl}/user/${userId}/bookmarks`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        }
      });
      
      if (!response.ok) throw new Error('Failed to fetch saved articles');
      
      const data = await response.json();
      return data.bookmarks || [];
    },
    {
      enabled: !!userId,
      staleTime: 60000,
    }
  );
  
  // Remove saved article mutation
  const removeMutation = useMutation(
    async (articleId: string) => {
      const response = await fetch(`${userServiceUrl}/user/${userId}/bookmarks/${articleId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        }
      });
      
      if (!response.ok) throw new Error('Failed to remove bookmark');
      return articleId;
    },
    {
      onSuccess: (removedId) => {
        // Update cache
        queryClient.setQueryData(['savedArticles', userId], (old: NewsArticle[] | undefined) => {
          return old?.filter(article => article.id !== removedId) || [];
        });
        
        // Show success feedback
        if (window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        }
      },
      onError: () => {
        // Show error feedback
        if (window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred('error');
        }
      }
    }
  );
  
  const getTierLimit = () => {
    switch (userTier) {
      case 'free': return 5;
      case 'pro': return 50;
      case 'business': return -1; // unlimited
      case 'enterprise': return -1;
      default: return 5;
    }
  };
  
  const tierLimit = getTierLimit();
  const savedCount = savedArticles?.length || 0;
  
  if (isLoading) {
    return (
      <div className="p-4">
        <h2 className="text-xl font-bold mb-4">Saved Articles</h2>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="bg-gray-200 h-32 rounded-lg"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="p-4">
        <h2 className="text-xl font-bold mb-4">Saved Articles</h2>
        <div className="text-center py-8">
          <p className="text-gray-500">Failed to load saved articles</p>
          <button 
            className="mt-2 text-blue-500"
            onClick={() => queryClient.invalidateQueries(['savedArticles', userId])}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Saved Articles</h2>
        {tierLimit > 0 && (
          <span className="text-sm text-gray-500">
            {savedCount}/{tierLimit} saved
          </span>
        )}
      </div>
      
      {savedCount === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📚</div>
          <p className="text-gray-500 mb-2">No saved articles yet</p>
          <p className="text-sm text-gray-400">
            Tap the bookmark icon on articles to save them for later
          </p>
        </div>
      ) : (
        <AnimatePresence>
          <div className="space-y-4">
            {savedArticles?.map((article) => (
              <motion.div
                key={article.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -100 }}
                transition={{ duration: 0.2 }}
              >
                <div className="relative">
                  <NewsCard
                    article={article}
                    onClick={() => onArticleSelect(article)}
                    isLocked={false}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeMutation.mutate(article.id);
                    }}
                    className="absolute top-2 right-2 p-2 bg-white rounded-full shadow-md hover:bg-red-50 transition-colors"
                    disabled={removeMutation.isLoading}
                  >
                    <svg 
                      className="w-5 h-5 text-red-500" 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        strokeWidth={2} 
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" 
                      />
                    </svg>
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </AnimatePresence>
      )}
      
      {userTier === 'free' && savedCount >= tierLimit && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200"
        >
          <h3 className="font-semibold text-blue-900 mb-1">Bookmark limit reached</h3>
          <p className="text-sm text-blue-700 mb-3">
            Upgrade to Pro to save up to 50 articles, or Business for unlimited saves
          </p>
          <button
            onClick={() => {
              if (window.Telegram?.WebApp) {
                window.Telegram.WebApp.openTelegramLink('https://t.me/ZoneNewsBot?start=upgrade');
              }
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Upgrade Now
          </button>
        </motion.div>
      )}
    </div>
  );
};

export default SavedArticles;