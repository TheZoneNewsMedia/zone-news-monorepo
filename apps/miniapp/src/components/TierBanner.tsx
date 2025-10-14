import React from 'react';
import { motion } from 'framer-motion';

const TierBanner: React.FC = () => {
  const handleUpgrade = () => {
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.openTelegramLink('https://t.me/ZoneNewsBot?start=upgrade');
    }
  };

  return (
    <motion.div
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="mx-4 mb-4 p-4 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl text-white"
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-lg">Upgrade to Pro</h3>
          <p className="text-sm opacity-90 mt-1">
            Get 50 articles/day, AI summaries & more
          </p>
        </div>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={handleUpgrade}
          className="bg-white text-blue-600 px-4 py-2 rounded-lg font-semibold text-sm"
        >
          $14.99/mo
        </motion.button>
      </div>
    </motion.div>
  );
};

export default TierBanner;