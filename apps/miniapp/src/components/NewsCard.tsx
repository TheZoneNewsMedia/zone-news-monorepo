import React from 'react';
import { motion } from 'framer-motion';
import { NewsArticle } from '@zone/shared';

interface NewsCardProps {
  article: NewsArticle;
  onClick: () => void;
  isLocked?: boolean;
}

const NewsCard: React.FC<NewsCardProps> = ({ article, onClick, isLocked }) => {
  const timeAgo = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <motion.div
      whileTap={{ scale: isLocked ? 1 : 0.98 }}
      onClick={isLocked ? undefined : onClick}
      className={`bg-white rounded-xl shadow-sm p-4 ${
        isLocked ? 'opacity-50' : 'cursor-pointer'
      }`}
    >
      {isLocked && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-10 rounded-xl z-10">
          <div className="bg-white px-3 py-1 rounded-full shadow-lg">
            <span className="text-sm font-medium">🔒 Upgrade to read</span>
          </div>
        </div>
      )}
      
      <div className="flex justify-between items-start mb-2">
        <span className="text-xs font-medium text-blue-500 uppercase">{article.category}</span>
        <span className="text-xs text-gray-500">{timeAgo(article.publishedAt)}</span>
      </div>
      
      <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">{article.title}</h3>
      
      {article.summary && (
        <p className="text-sm text-gray-600 mb-3 line-clamp-2">{article.summary}</p>
      )}
      
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4 text-xs text-gray-500">
          <span className="flex items-center space-x-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span>{article.views}</span>
          </span>
          
          <span className="flex items-center space-x-1">
            <span>👍</span>
            <span>{article.reactions.likes}</span>
          </span>
          
          <span className="flex items-center space-x-1">
            <span>❤️</span>
            <span>{article.reactions.hearts}</span>
          </span>
        </div>
        
        <span className="text-xs text-gray-500">{article.source}</span>
      </div>
    </motion.div>
  );
};

export default NewsCard;