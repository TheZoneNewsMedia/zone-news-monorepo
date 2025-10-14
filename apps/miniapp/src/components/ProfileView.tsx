import React from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store/useStore';
import { TIER_CONFIGS } from '@zone/shared';

interface ProfileViewProps {
  user: any;
}

const ProfileView: React.FC<ProfileViewProps> = ({ user }) => {
  const { userTier, articlesViewed, savedArticles } = useStore();
  const tierConfig = TIER_CONFIGS[userTier as keyof typeof TIER_CONFIGS] || TIER_CONFIGS.free;

  const handleUpgrade = () => {
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.openTelegramLink('https://t.me/ZoneNewsBot?start=upgrade');
    }
  };

  const handleManageSubscription = () => {
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.openTelegramLink('https://t.me/ZoneNewsBot?start=subscription');
    }
  };

  return (
    <div className="px-4 py-4">
      {/* User Info */}
      <div className="bg-white rounded-xl p-4 mb-4 shadow-sm">
        <div className="flex items-center space-x-4">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
            {user?.first_name?.[0] || 'U'}
          </div>
          <div>
            <h2 className="text-xl font-semibold">
              {user?.first_name} {user?.last_name}
            </h2>
            {user?.username && (
              <p className="text-gray-500">@{user.username}</p>
            )}
          </div>
        </div>
      </div>

      {/* Tier Status */}
      <div className="bg-white rounded-xl p-4 mb-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Your Plan</h3>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            userTier === 'free' ? 'bg-gray-100 text-gray-700' :
            userTier === 'pro' ? 'bg-blue-100 text-blue-700' :
            userTier === 'business' ? 'bg-purple-100 text-purple-700' :
            'bg-yellow-100 text-yellow-700'
          }`}>
            {userTier.charAt(0).toUpperCase() + userTier.slice(1)}
          </span>
        </div>
        
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Articles today</span>
            <span className="font-medium">
              {articlesViewed}/{tierConfig.limits.maxArticlesPerDay === -1 ? '∞' : tierConfig.limits.maxArticlesPerDay}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Saved articles</span>
            <span className="font-medium">{savedArticles.length}</span>
          </div>
          {tierConfig.limits.maxChannels > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-500">Channels</span>
              <span className="font-medium">
                0/{tierConfig.limits.maxChannels === -1 ? '∞' : tierConfig.limits.maxChannels}
              </span>
            </div>
          )}
        </div>

        {userTier === 'free' && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleUpgrade}
            className="w-full mt-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white py-3 rounded-lg font-semibold"
          >
            Upgrade to Pro
          </motion.button>
        )}
        
        {userTier !== 'free' && (
          <button
            onClick={handleManageSubscription}
            className="w-full mt-4 bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold"
          >
            Manage Subscription
          </button>
        )}
      </div>

      {/* Features */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <h3 className="font-semibold mb-3">Your Features</h3>
        <div className="space-y-2">
          {Object.entries(tierConfig.features).map(([feature, enabled]) => (
            <div key={feature} className="flex items-center justify-between">
              <span className="text-sm text-gray-600">
                {feature.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
              </span>
              <span className={enabled ? 'text-green-500' : 'text-gray-400'}>
                {enabled ? '✓' : '✗'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Settings */}
      <div className="mt-4 space-y-2">
        <button className="w-full bg-white rounded-xl p-4 shadow-sm text-left">
          <span className="font-medium">Settings</span>
        </button>
        <button className="w-full bg-white rounded-xl p-4 shadow-sm text-left">
          <span className="font-medium">Help & Support</span>
        </button>
        <button className="w-full bg-white rounded-xl p-4 shadow-sm text-left">
          <span className="font-medium">About Zone News</span>
        </button>
      </div>
    </div>
  );
};

export default ProfileView;