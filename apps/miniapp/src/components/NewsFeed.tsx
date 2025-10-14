import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { motion } from 'framer-motion';
import { NewsArticle } from '@zone/shared';
import NewsCard from './NewsCard';
import { useStore } from '../store/useStore';

interface NewsFeedProps {
  onArticleSelect: (article: NewsArticle) => void;
}

const NewsFeed: React.FC<NewsFeedProps> = ({ onArticleSelect }) => {
  const [category, setCategory] = useState<string>('all');
  const { articlesViewed, dailyLimit, userTier } = useStore();
  
  const { data: articles, isLoading, error, refetch } = useQuery<NewsArticle[]>(
    ['news', category],
    async () => {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const endpoint = category === 'all' 
        ? `${apiUrl}/api/news` 
        : `${apiUrl}/api/news?category=${category}`;
      
      const response = await fetch(endpoint, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        }
      });
      
      if (!response.ok) {
        if (response.status === 429) {
          const data = await response.json();
          throw new Error(`Daily limit reached: ${data.remaining} articles left`);
        }
        throw new Error('Failed to fetch news');
      }
      
      const data = await response.json();
      return data.articles || data;
    },
    {
      refetchInterval: 60000, // Refresh every minute
      staleTime: 30000, // Consider data stale after 30 seconds
      retry: 3,
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
    }
  );

  const categories = ['all', 'local', 'technology', 'sports', 'business', 'entertainment'];
  
  const reachedLimit = userTier === 'free' && articlesViewed >= dailyLimit;

  return (
    <div className="px-4 py-2">
      {/* Category Pills */}
      <div className="flex space-x-2 overflow-x-auto pb-3 mb-4 -mx-4 px-4">
        {categories.map((cat) => (
          <motion.button
            key={cat}
            whileTap={{ scale: 0.95 }}
            onClick={() => setCategory(cat)}
            className={`px-4 py-2 rounded-full whitespace-nowrap ${
              category === cat
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </motion.button>
        ))}
      </div>

      {/* Daily Limit Warning */}
      {userTier === 'free' && (
        <div className="mb-4 p-3 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-800">
            {articlesViewed}/{dailyLimit} articles read today
            {reachedLimit && (
              <span className="block mt-1 font-medium">
                Daily limit reached. Upgrade to Pro for unlimited access!
              </span>
            )}
          </p>
        </div>
      )}

      {/* News Cards */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="bg-gray-200 h-32 rounded-lg"></div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-8">
          <p className="text-gray-500">Failed to load news</p>
          <button className="mt-2 text-blue-500">Try again</button>
        </div>
      ) : (
        <div className="space-y-4">
          {articles?.map((article, index) => (
            <NewsCard
              key={article.id}
              article={article}
              onClick={() => !reachedLimit && onArticleSelect(article)}
              isLocked={reachedLimit && index > 0}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default NewsFeed;