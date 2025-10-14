/**
 * Zone News Mini App - Service Worker
 * Implements caching strategies and offline functionality
 */

'use strict';

const CACHE_NAME = 'zone-news-v1.0.0';
const CACHE_VERSION = '1.0.0';

// Cache strategies
const CACHE_STRATEGIES = {
  CACHE_FIRST: 'cache-first',
  NETWORK_FIRST: 'network-first',
  STALE_WHILE_REVALIDATE: 'stale-while-revalidate',
  NETWORK_ONLY: 'network-only',
  CACHE_ONLY: 'cache-only'
};

// Cache configurations for different resource types
const CACHE_CONFIG = {
  // Core app files - cache first with long TTL
  core: {
    pattern: /\/(js|css|fonts?)\//,
    strategy: CACHE_STRATEGIES.CACHE_FIRST,
    ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
    maxEntries: 50
  },
  
  // Images - cache first with medium TTL
  images: {
    pattern: /\.(png|jpg|jpeg|gif|svg|webp|ico)$/,
    strategy: CACHE_STRATEGIES.CACHE_FIRST,
    ttl: 3 * 24 * 60 * 60 * 1000, // 3 days
    maxEntries: 100
  },
  
  // API data - stale while revalidate with short TTL
  api: {
    pattern: /\/api\//,
    strategy: CACHE_STRATEGIES.STALE_WHILE_REVALIDATE,
    ttl: 5 * 60 * 1000, // 5 minutes
    maxEntries: 50
  },
  
  // HTML pages - network first with fallback
  pages: {
    pattern: /\.html$|\/$/,
    strategy: CACHE_STRATEGIES.NETWORK_FIRST,
    ttl: 60 * 60 * 1000, // 1 hour
    maxEntries: 20
  },
  
  // External resources - stale while revalidate
  external: {
    pattern: /^https?:\/\/(?!67\.219\.107\.230)/,
    strategy: CACHE_STRATEGIES.STALE_WHILE_REVALIDATE,
    ttl: 24 * 60 * 60 * 1000, // 1 day
    maxEntries: 30
  }
};

// Core files to precache
const PRECACHE_RESOURCES = [
  '/telegram-mini-app/',
  '/telegram-mini-app/index.html',
  '/telegram-mini-app/style.css',
  '/telegram-mini-app/js/config.js',
  '/telegram-mini-app/js/telegram-integration.js',
  '/telegram-mini-app/js/api-service.js',
  '/telegram-mini-app/js/storage-service.js',
  '/telegram-mini-app/js/module-loader.js',
  '/telegram-mini-app/js/app-optimized.js',
  '/telegram-mini-app/js/performance-analytics.js',
  '/telegram-mini-app/manifest.json'
];

// Performance tracking
const performanceMetrics = {
  cacheHits: 0,
  cacheMisses: 0,
  networkRequests: 0,
  backgroundSyncs: 0
};

/**
 * Service Worker Event Handlers
 */

// Install event - precache core resources
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker installing...');
  
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        console.log('📦 Precaching core resources...');
        
        // Precache core resources with error handling
        const precachePromises = PRECACHE_RESOURCES.map(async (resource) => {
          try {
            const response = await fetch(resource);
            if (response.ok) {
              await cache.put(resource, response);
              console.log(`✅ Precached: ${resource}`);
            } else {
              console.warn(`⚠️ Failed to precache (${response.status}): ${resource}`);
            }
          } catch (error) {
            console.warn(`⚠️ Failed to precache: ${resource}`, error);
          }
        });
        
        await Promise.allSettled(precachePromises);
        console.log('✅ Service Worker installed successfully');
        
        // Skip waiting to activate immediately
        self.skipWaiting();
        
      } catch (error) {
        console.error('❌ Service Worker installation failed:', error);
      }
    })()
  );
});

// Activate event - cleanup old caches
self.addEventListener('activate', (event) => {
  console.log('🚀 Service Worker activating...');
  
  event.waitUntil(
    (async () => {
      try {
        // Clean up old caches
        const cacheNames = await caches.keys();
        const deletePromises = cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log(`🗑️ Deleting old cache: ${name}`);
            return caches.delete(name);
          });
        
        await Promise.all(deletePromises);
        
        // Take control of all clients immediately
        await self.clients.claim();
        
        console.log('✅ Service Worker activated successfully');
        
        // Notify clients about activation
        broadcastMessage({
          type: 'SW_ACTIVATED',
          cacheVersion: CACHE_VERSION,
          timestamp: Date.now()
        });
        
      } catch (error) {
        console.error('❌ Service Worker activation failed:', error);
      }
    })()
  );
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', (event) => {
  // Skip non-HTTP requests
  if (!event.request.url.startsWith('http')) {
    return;
  }
  
  // Skip requests with special headers
  if (event.request.headers.get('sw-bypass')) {
    return;
  }
  
  event.respondWith(handleFetch(event.request));
});

// Message event - handle messages from clients
self.addEventListener('message', (event) => {
  const { type, payload } = event.data;
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'GET_CACHE_STATS':
      event.ports[0].postMessage({
        type: 'CACHE_STATS',
        data: performanceMetrics
      });
      break;
      
    case 'CLEAR_CACHE':
      clearCache(payload.cachePattern);
      break;
      
    case 'PRECACHE_RESOURCES':
      precacheResources(payload.resources);
      break;
      
    default:
      console.log('Unknown message type:', type);
  }
});

// Background sync event
self.addEventListener('sync', (event) => {
  console.log('🔄 Background sync triggered:', event.tag);
  
  switch (event.tag) {
    case 'analytics-sync':
      event.waitUntil(syncAnalytics());
      break;
      
    case 'offline-actions':
      event.waitUntil(syncOfflineActions());
      break;
      
    default:
      console.log('Unknown sync tag:', event.tag);
  }
});

// Push event - handle push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  try {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: '/telegram-mini-app/icon-192.png',
      badge: '/telegram-mini-app/badge-72.png',
      tag: data.tag || 'zone-news',
      data: data.data || {},
      actions: data.actions || [],
      requireInteraction: data.urgent || false
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
    
  } catch (error) {
    console.error('Push notification error:', error);
  }
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const { action, data } = event;
  const url = data?.url || '/telegram-mini-app/';
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      // Check if app is already open
      for (const client of clients) {
        if (client.url.includes('/telegram-mini-app/') && 'focus' in client) {
          return client.focus();
        }
      }
      
      // Open new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});

/**
 * Core Functions
 */

async function handleFetch(request) {
  const url = new URL(request.url);
  const config = getCacheConfig(request);
  
  if (!config) {
    return fetch(request);
  }
  
  performanceMetrics.networkRequests++;
  
  switch (config.strategy) {
    case CACHE_STRATEGIES.CACHE_FIRST:
      return cacheFirst(request, config);
      
    case CACHE_STRATEGIES.NETWORK_FIRST:
      return networkFirst(request, config);
      
    case CACHE_STRATEGIES.STALE_WHILE_REVALIDATE:
      return staleWhileRevalidate(request, config);
      
    case CACHE_STRATEGIES.NETWORK_ONLY:
      return fetch(request);
      
    case CACHE_STRATEGIES.CACHE_ONLY:
      return cacheOnly(request, config);
      
    default:
      return fetch(request);
  }
}

async function cacheFirst(request, config) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    
    if (cached && !isExpired(cached, config.ttl)) {
      performanceMetrics.cacheHits++;
      return cached;
    }
    
    const response = await fetch(request);
    
    if (response.ok) {
      // Clone response before caching
      const responseClone = response.clone();
      await cache.put(request, responseClone);
      
      // Manage cache size
      await manageCacheSize(cache, config.maxEntries);
    }
    
    performanceMetrics.cacheMisses++;
    return response;
    
  } catch (error) {
    console.warn('Cache-first strategy failed:', error);
    
    // Try to serve from cache as fallback
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    
    if (cached) {
      performanceMetrics.cacheHits++;
      return cached;
    }
    
    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      return createOfflineResponse();
    }
    
    throw error;
  }
}

async function networkFirst(request, config) {
  try {
    const response = await fetch(request);
    
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      const responseClone = response.clone();
      await cache.put(request, responseClone);
      
      await manageCacheSize(cache, config.maxEntries);
    }
    
    return response;
    
  } catch (error) {
    console.warn('Network-first strategy failed, trying cache:', error);
    
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    
    if (cached) {
      performanceMetrics.cacheHits++;
      return cached;
    }
    
    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      return createOfflineResponse();
    }
    
    throw error;
  }
}

async function staleWhileRevalidate(request, config) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  
  // Always fetch in background
  const fetchPromise = fetch(request).then(async (response) => {
    if (response.ok) {
      const responseClone = response.clone();
      await cache.put(request, responseClone);
      await manageCacheSize(cache, config.maxEntries);
    }
    return response;
  }).catch(error => {
    console.warn('Background fetch failed:', error);
    return null;
  });
  
  // Return cached version immediately if available
  if (cached) {
    performanceMetrics.cacheHits++;
    
    // Don't wait for background update
    fetchPromise.catch(() => {});
    
    return cached;
  }
  
  // Wait for network if no cached version
  performanceMetrics.cacheMisses++;
  return fetchPromise;
}

async function cacheOnly(request, config) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  
  if (cached) {
    performanceMetrics.cacheHits++;
    return cached;
  }
  
  throw new Error('Resource not in cache');
}

function getCacheConfig(request) {
  const url = request.url;
  
  for (const [key, config] of Object.entries(CACHE_CONFIG)) {
    if (config.pattern.test(url)) {
      return config;
    }
  }
  
  return null;
}

function isExpired(response, ttl) {
  if (!ttl) return false;
  
  const cachedTime = response.headers.get('sw-cached-time');
  if (!cachedTime) return false;
  
  return Date.now() - parseInt(cachedTime) > ttl;
}

async function manageCacheSize(cache, maxEntries) {
  if (!maxEntries) return;
  
  const keys = await cache.keys();
  
  if (keys.length > maxEntries) {
    // Remove oldest entries (simple FIFO)
    const keysToDelete = keys.slice(0, keys.length - maxEntries);
    await Promise.all(keysToDelete.map(key => cache.delete(key)));
  }
}

function createOfflineResponse() {
  const offlineHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Zone News - Offline</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          text-align: center;
          padding: 2rem;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0;
        }
        .offline-container {
          max-width: 400px;
        }
        .offline-icon {
          font-size: 4rem;
          margin-bottom: 1rem;
        }
        .offline-title {
          font-size: 1.5rem;
          margin-bottom: 0.5rem;
        }
        .offline-message {
          opacity: 0.9;
          line-height: 1.5;
        }
        .retry-btn {
          background: rgba(255,255,255,0.2);
          border: 1px solid rgba(255,255,255,0.3);
          color: white;
          padding: 0.75rem 1.5rem;
          border-radius: 0.5rem;
          margin-top: 1.5rem;
          cursor: pointer;
          font-size: 1rem;
        }
        .retry-btn:hover {
          background: rgba(255,255,255,0.3);
        }
      </style>
    </head>
    <body>
      <div class="offline-container">
        <div class="offline-icon">📱</div>
        <h1 class="offline-title">You're Offline</h1>
        <p class="offline-message">
          Zone News is not available right now. Check your internet connection and try again.
        </p>
        <button class="retry-btn" onclick="location.reload()">
          Try Again
        </button>
      </div>
    </body>
    </html>
  `;
  
  return new Response(offlineHTML, {
    status: 200,
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'no-cache'
    }
  });
}

async function syncAnalytics() {
  try {
    performanceMetrics.backgroundSyncs++;
    
    // Get stored analytics data
    const analyticsData = await getStoredAnalytics();
    
    if (analyticsData.length > 0) {
      const response = await fetch('/api/analytics/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          events: analyticsData,
          source: 'service-worker'
        })
      });
      
      if (response.ok) {
        await clearStoredAnalytics();
        console.log('✅ Analytics synced successfully');
      }
    }
    
  } catch (error) {
    console.error('❌ Analytics sync failed:', error);
  }
}

async function syncOfflineActions() {
  try {
    performanceMetrics.backgroundSyncs++;
    
    // Get stored offline actions
    const offlineActions = await getStoredOfflineActions();
    
    for (const action of offlineActions) {
      try {
        const response = await fetch(action.url, {
          method: action.method,
          headers: action.headers,
          body: action.body
        });
        
        if (response.ok) {
          await removeOfflineAction(action.id);
        }
        
      } catch (error) {
        console.warn('Offline action failed:', action, error);
      }
    }
    
  } catch (error) {
    console.error('❌ Offline actions sync failed:', error);
  }
}

function broadcastMessage(message) {
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage(message);
    });
  });
}

async function clearCache(pattern) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    
    const keysToDelete = pattern 
      ? keys.filter(key => pattern.test(key.url))
      : keys;
    
    await Promise.all(keysToDelete.map(key => cache.delete(key)));
    
    console.log(`🗑️ Cleared ${keysToDelete.length} cache entries`);
    
  } catch (error) {
    console.error('Cache clear failed:', error);
  }
}

async function precacheResources(resources) {
  try {
    const cache = await caches.open(CACHE_NAME);
    
    for (const resource of resources) {
      const response = await fetch(resource);
      if (response.ok) {
        await cache.put(resource, response);
      }
    }
    
    console.log(`📦 Precached ${resources.length} additional resources`);
    
  } catch (error) {
    console.error('Precache failed:', error);
  }
}

// Utility functions for offline storage
async function getStoredAnalytics() {
  return []; // Implement based on storage strategy
}

async function clearStoredAnalytics() {
  // Implement based on storage strategy
}

async function getStoredOfflineActions() {
  return []; // Implement based on storage strategy
}

async function removeOfflineAction(id) {
  // Implement based on storage strategy
}

console.log('🔧 Zone News Service Worker loaded successfully');