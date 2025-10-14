import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from './store/useStore';
import { useTelegramUser } from './hooks/useTelegramUser';
import Header from './components/Header';
import NewsFeed from './components/NewsFeed';
import TierBanner from './components/TierBanner';
import BottomNav from './components/BottomNav';
import ArticleView from './components/ArticleView';
import ProfileView from './components/ProfileView';
import { NewsArticle } from '@zone/shared';

type View = 'feed' | 'article' | 'profile' | 'saved';

function App() {
  const [currentView, setCurrentView] = useState<View>('feed');
  const [selectedArticle, setSelectedArticle] = useState<NewsArticle | null>(null);
  const { user, isLoading } = useTelegramUser();
  const { userTier } = useStore();

  useEffect(() => {
    // Set theme based on Telegram theme
    if (window.Telegram?.WebApp?.themeParams) {
      const theme = window.Telegram.WebApp.themeParams;
      document.documentElement.style.setProperty('--tg-theme-bg-color', theme.bg_color || '#ffffff');
      document.documentElement.style.setProperty('--tg-theme-text-color', theme.text_color || '#000000');
    }
  }, []);

  const handleArticleSelect = (article: NewsArticle) => {
    setSelectedArticle(article);
    setCurrentView('article');
  };

  const handleBack = () => {
    setCurrentView('feed');
    setSelectedArticle(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} onBack={currentView !== 'feed' ? handleBack : undefined} />
      
      {userTier === 'free' && currentView === 'feed' && (
        <TierBanner />
      )}

      <AnimatePresence mode="wait">
        <motion.main
          key={currentView}
          initial={{ opacity: 0, x: currentView === 'article' ? 20 : -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: currentView === 'article' ? -20 : 20 }}
          transition={{ duration: 0.2 }}
          className="pb-16"
        >
          {currentView === 'feed' && (
            <NewsFeed onArticleSelect={handleArticleSelect} />
          )}
          {currentView === 'article' && selectedArticle && (
            <ArticleView article={selectedArticle} />
          )}
          {currentView === 'profile' && (
            <ProfileView user={user} />
          )}
          {currentView === 'saved' && (
            <div className="p-4">
              <h2 className="text-xl font-bold mb-4">Saved Articles</h2>
              <p className="text-gray-500">Your saved articles will appear here</p>
            </div>
          )}
        </motion.main>
      </AnimatePresence>

      <BottomNav currentView={currentView} onViewChange={setCurrentView} />
    </div>
  );
}

export default App;