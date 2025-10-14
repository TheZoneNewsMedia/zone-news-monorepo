import React from 'react';
import { motion } from 'framer-motion';

interface HeaderProps {
  user: any;
  onBack?: () => void;
}

const Header: React.FC<HeaderProps> = ({ user, onBack }) => {
  return (
    <header className="sticky top-0 z-50 bg-white shadow-sm safe-area-top">
      <div className="flex items-center justify-between px-4 py-3">
        {onBack ? (
          <button onClick={onBack} className="p-2 -ml-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        ) : (
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full"></div>
            <span className="font-bold text-lg">Zone News</span>
          </div>
        )}
        
        <div className="flex items-center space-x-3">
          <motion.div
            whileTap={{ scale: 0.95 }}
            className="p-2 rounded-full hover:bg-gray-100"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </motion.div>
          
          {user && (
            <div className="text-right">
              <p className="text-sm font-medium">{user.first_name}</p>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;