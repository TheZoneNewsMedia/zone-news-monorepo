import React from 'react';
import { motion } from 'framer-motion';

interface BottomNavProps {
  currentView: string;
  onViewChange: (view: any) => void;
}

const BottomNav: React.FC<BottomNavProps> = ({ currentView, onViewChange }) => {
  const navItems = [
    { id: 'feed', label: 'Home', icon: '🏠' },
    { id: 'saved', label: 'Saved', icon: '📑' },
    { id: 'profile', label: 'Profile', icon: '👤' }
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-area-bottom">
      <div className="flex justify-around py-2">
        {navItems.map((item) => (
          <motion.button
            key={item.id}
            whileTap={{ scale: 0.95 }}
            onClick={() => onViewChange(item.id)}
            className={`flex flex-col items-center p-2 ${
              currentView === item.id ? 'text-blue-500' : 'text-gray-500'
            }`}
          >
            <span className="text-xl mb-1">{item.icon}</span>
            <span className="text-xs">{item.label}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
};

export default BottomNav;