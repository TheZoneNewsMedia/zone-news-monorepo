import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

export function useTelegramUser() {
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { setUserTier } = useStore();

  useEffect(() => {
    if (window.Telegram?.WebApp) {
      const tgUser = window.Telegram.WebApp.initDataUnsafe?.user;
      
      if (tgUser) {
        setUser(tgUser);
        // Fetch user tier from backend (mock for now)
        fetchUserTier(tgUser.id);
      } else {
        // Development fallback
        setUser({
          id: 123456,
          first_name: 'Test',
          last_name: 'User',
          username: 'testuser'
        });
        setUserTier('free');
      }
    }
    setIsLoading(false);
  }, []);

  const fetchUserTier = async (userId: number) => {
    try {
      // TODO: Replace with actual API call
      const response = await fetch(`/api/user/${userId}/tier`);
      if (response.ok) {
        const data = await response.json();
        setUserTier(data.tier);
      }
    } catch (error) {
      console.error('Failed to fetch user tier:', error);
      setUserTier('free');
    }
  };

  return { user, isLoading };
}