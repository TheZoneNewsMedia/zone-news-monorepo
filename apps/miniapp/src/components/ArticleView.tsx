import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { NewsArticle } from '@zone/shared';
import { useStore } from '../store/useStore';

interface ArticleViewProps {
  article: NewsArticle;
}

const ArticleView: React.FC<ArticleViewProps> = ({ article }) => {
  const { incrementArticlesViewed, savedArticles, saveArticle, unsaveArticle } = useStore();
  const isSaved = savedArticles.includes(article.id);

  useEffect(() => {
    incrementArticlesViewed();
  }, []);

  const handleShare = () => {
    if (window.Telegram?.WebApp) {
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(article.url || '')}&text=${encodeURIComponent(article.title)}`;
      window.Telegram.WebApp.openTelegramLink(shareUrl);
    }
  };

  const handleReaction = (_type: 'likes' | 'hearts') => {
    // TODO: Send reaction to backend
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }
  };

  return (
    <div className="px-4 py-4">
      <div className="mb-4">
        <span className="text-sm font-medium text-blue-500 uppercase">{article.category}</span>
        <h1 className="text-2xl font-bold mt-2 mb-3">{article.title}</h1>
        
        <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
          <span>{article.source}</span>
          <span>{new Date(article.publishedAt).toLocaleDateString()}</span>
        </div>
      </div>

      {article.imageUrl && (
        <img 
          src={article.imageUrl} 
          alt={article.title}
          className="w-full h-48 object-cover rounded-lg mb-4"
        />
      )}

      <div className="prose prose-sm max-w-none mb-6">
        <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
          {article.content}
        </p>
      </div>

      {/* Action Bar */}
      <div className="sticky bottom-16 bg-white border-t pt-4 -mx-4 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => handleReaction('likes')}
              className="flex items-center space-x-1 text-gray-600"
            >
              <span className="text-xl">👍</span>
              <span className="text-sm">{article.reactions.likes}</span>
            </motion.button>
            
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => handleReaction('hearts')}
              className="flex items-center space-x-1 text-gray-600"
            >
              <span className="text-xl">❤️</span>
              <span className="text-sm">{article.reactions.hearts}</span>
            </motion.button>
          </div>

          <div className="flex items-center space-x-3">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => isSaved ? unsaveArticle(article.id) : saveArticle(article.id)}
              className="p-2"
            >
              <svg 
                className="w-6 h-6" 
                fill={isSaved ? "currentColor" : "none"} 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </motion.button>
            
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleShare}
              className="p-2"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m9.032 4.026a9.001 9.001 0 01-7.432 0m9.032-4.026A9.001 9.001 0 0112 3c-4.474 0-8.268 2.943-9.543 7a9.97 9.97 0 011.827 3.342M8.684 13.342A9.97 9.97 0 016.857 10m1.827 3.342A8.97 8.97 0 0112 21" />
              </svg>
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ArticleView;