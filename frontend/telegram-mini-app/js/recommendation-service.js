/**
 * Zone News Mini App - Recommendation Service
 * Personalized content recommendations using machine learning-like algorithms
 */

'use strict';

import { APP_CONFIG } from './config.js';
import { StorageService } from './storage-service.js';

// ===== RECOMMENDATION SERVICE =====
export class RecommendationService {
  constructor(storageService) {
    this.storage = storageService || new StorageService();
    
    // User behavior tracking
    this.userProfile = this.loadUserProfile();
    this.readingHistory = this.loadReadingHistory();
    this.interactionHistory = this.loadInteractionHistory();
    
    // Recommendation algorithms
    this.algorithms = {
      contentBased: this.contentBasedRecommendations.bind(this),
      collaborative: this.collaborativeRecommendations.bind(this),
      trending: this.trendingRecommendations.bind(this),
      recency: this.recencyBasedRecommendations.bind(this),
      diversity: this.diversityRecommendations.bind(this)
    };
    
    // Feature weights for ML-like scoring
    this.featureWeights = {
      categoryPreference: 0.25,
      readingTime: 0.15,
      reactionHistory: 0.20,
      timeOfDay: 0.10,
      recency: 0.15,
      popularity: 0.10,
      diversity: 0.05
    };
    
    // Content analysis cache
    this.articleFeatures = new Map();
    this.categoryEmbeddings = new Map();
    
    // Real-time learning
    this.sessionBehavior = {
      categoriesViewed: new Map(),
      articlesRead: [],
      timeSpent: new Map(),
      reactions: [],
      searches: [],
      scrollDepth: new Map()
    };
    
    this.initialize();
  }

  /**
   * Initialize recommendation service
   */
  initialize() {
    this.updateFeatureWeights();
    this.buildCategoryEmbeddings();
    this.startSessionTracking();
  }

  /**
   * Get personalized recommendations
   */
  getRecommendations(articles, options = {}) {
    const {
      count = 10,
      excludeRead = true,
      algorithms = ['contentBased', 'trending', 'recency'],
      diversityLevel = 0.3
    } = options;

    if (!articles || articles.length === 0) {
      return [];
    }

    // Filter out already read articles if requested
    let candidateArticles = excludeRead 
      ? articles.filter(article => !this.hasUserRead(article.id))
      : articles;

    if (candidateArticles.length === 0) {
      candidateArticles = articles; // Fallback to all articles
    }

    // Extract features for all articles
    candidateArticles.forEach(article => {
      if (!this.articleFeatures.has(article.id)) {
        this.articleFeatures.set(article.id, this.extractArticleFeatures(article));
      }
    });

    // Get recommendations from different algorithms
    const algorithmResults = new Map();
    
    algorithms.forEach(algorithmName => {
      if (this.algorithms[algorithmName]) {
        const results = this.algorithms[algorithmName](candidateArticles, count * 2);
        algorithmResults.set(algorithmName, results);
      }
    });

    // Combine and rank recommendations
    const combinedRecommendations = this.combineAlgorithmResults(
      algorithmResults, 
      candidateArticles, 
      count
    );

    // Apply diversity filter
    const diverseRecommendations = this.applyDiversityFilter(
      combinedRecommendations, 
      diversityLevel
    );

    // Add recommendation reasons
    const enrichedRecommendations = diverseRecommendations.map(rec => ({
      ...rec,
      recommendationReason: this.generateRecommendationReason(rec),
      confidence: this.calculateConfidence(rec)
    }));

    return enrichedRecommendations.slice(0, count);
  }

  /**
   * Content-based recommendations
   */
  contentBasedRecommendations(articles, count) {
    const userPreferences = this.getUserPreferences();
    
    return articles
      .map(article => {
        const features = this.articleFeatures.get(article.id);
        const score = this.calculateContentScore(article, features, userPreferences);
        
        return {
          article,
          score,
          algorithm: 'content-based',
          features
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, count);
  }

  /**
   * Collaborative filtering recommendations
   */
  collaborativeRecommendations(articles, count) {
    // Simulate collaborative filtering based on similar user patterns
    const userSimilarity = this.calculateUserSimilarity();
    
    return articles
      .map(article => {
        const score = this.calculateCollaborativeScore(article, userSimilarity);
        
        return {
          article,
          score,
          algorithm: 'collaborative',
          similarUsers: userSimilarity.slice(0, 3)
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, count);
  }

  /**
   * Trending-based recommendations
   */
  trendingRecommendations(articles, count) {
    return articles
      .map(article => {
        const trendingScore = this.calculateTrendingScore(article);
        
        return {
          article,
          score: trendingScore,
          algorithm: 'trending',
          trendingFactor: trendingScore
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, count);
  }

  /**
   * Recency-based recommendations
   */
  recencyBasedRecommendations(articles, count) {
    const now = new Date();
    
    return articles
      .map(article => {
        const publishedDate = new Date(article.published_date);
        const hoursSincePublished = (now - publishedDate) / (1000 * 60 * 60);
        
        // Exponential decay for recency
        const recencyScore = Math.exp(-hoursSincePublished / 24);
        const popularityBoost = Math.log(1 + (article.views || 0)) * 0.1;
        
        return {
          article,
          score: recencyScore + popularityBoost,
          algorithm: 'recency',
          hoursSincePublished
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, count);
  }

  /**
   * Diversity-focused recommendations
   */
  diversityRecommendations(articles, count) {
    const diverseArticles = [];
    const usedCategories = new Set();
    const sortedArticles = [...articles].sort((a, b) => 
      (b.views || 0) - (a.views || 0)
    );

    // Ensure category diversity
    for (const article of sortedArticles) {
      if (!usedCategories.has(article.category) || diverseArticles.length < count / 2) {
        diverseArticles.push({
          article,
          score: this.calculateDiversityScore(article, usedCategories),
          algorithm: 'diversity'
        });
        
        usedCategories.add(article.category);
        
        if (diverseArticles.length >= count) break;
      }
    }

    return diverseArticles;
  }

  /**
   * Extract features from an article for ML-like analysis
   */
  extractArticleFeatures(article) {
    const features = {
      // Text features
      titleLength: (article.title || '').length,
      excerptLength: (article.excerpt || '').length,
      contentLength: (article.content || '').length,
      
      // Categorical features
      category: article.category || 'unknown',
      source: article.source || 'unknown',
      
      // Temporal features
      publishedHour: new Date(article.published_date).getHours(),
      dayOfWeek: new Date(article.published_date).getDay(),
      
      // Engagement features
      views: article.views || 0,
      reactions: Object.values(article.reactions || {}).reduce((sum, count) => sum + count, 0),
      
      // Reading time estimate
      readingTime: this.estimateReadingTime(article),
      
      // Keyword density
      keywords: this.extractKeywords(article),
      
      // Sentiment (simplified)
      sentiment: this.calculateSentiment(article)
    };

    return features;
  }

  /**
   * Calculate content-based score
   */
  calculateContentScore(article, features, userPreferences) {
    let score = 0;

    // Category preference
    const categoryPreference = userPreferences.categories.get(features.category) || 0;
    score += categoryPreference * this.featureWeights.categoryPreference * 100;

    // Reading time preference
    const preferredReadingTime = userPreferences.averageReadingTime;
    const readingTimeDiff = Math.abs(features.readingTime - preferredReadingTime);
    const readingTimeScore = Math.max(0, 10 - readingTimeDiff);
    score += readingTimeScore * this.featureWeights.readingTime;

    // Time of day preference
    const currentHour = new Date().getHours();
    const hourPreference = userPreferences.activeHours.get(currentHour) || 0;
    score += hourPreference * this.featureWeights.timeOfDay * 10;

    // Keyword matching
    const keywordScore = this.calculateKeywordScore(features.keywords, userPreferences.keywords);
    score += keywordScore * 0.15;

    // Source preference
    const sourcePreference = userPreferences.sources.get(features.source) || 0;
    score += sourcePreference * 0.1 * 10;

    return score;
  }

  /**
   * Calculate collaborative filtering score
   */
  calculateCollaborativeScore(article, userSimilarity) {
    // Simplified collaborative filtering
    let score = 0;
    
    userSimilarity.forEach(similarUser => {
      if (similarUser.readArticles.includes(article.id)) {
        score += similarUser.similarity * 10;
      }
    });

    return score;
  }

  /**
   * Calculate trending score
   */
  calculateTrendingScore(article) {
    const now = new Date();
    const publishedDate = new Date(article.published_date);
    const hoursSincePublished = (now - publishedDate) / (1000 * 60 * 60);
    
    // Viral coefficient calculation
    const views = article.views || 0;
    const reactions = Object.values(article.reactions || {}).reduce((sum, count) => sum + count, 0);
    const engagementRate = views > 0 ? reactions / views : 0;
    
    // Time decay factor
    const timeDecay = Math.exp(-hoursSincePublished / 12); // 12-hour half-life
    
    // Trending score combines engagement and recency
    return (views * 0.1 + reactions * 2 + engagementRate * 50) * timeDecay;
  }

  /**
   * Calculate diversity score
   */
  calculateDiversityScore(article, usedCategories) {
    let score = article.views || 0;
    
    // Boost score if category not yet included
    if (!usedCategories.has(article.category)) {
      score *= 2;
    }
    
    return score;
  }

  /**
   * Combine results from multiple algorithms
   */
  combineAlgorithmResults(algorithmResults, articles, count) {
    const articleScores = new Map();
    
    // Initialize scores
    articles.forEach(article => {
      articleScores.set(article.id, {
        article,
        totalScore: 0,
        algorithmScores: new Map(),
        reasons: []
      });
    });

    // Aggregate scores from each algorithm
    algorithmResults.forEach((results, algorithmName) => {
      const maxScore = Math.max(...results.map(r => r.score));
      
      results.forEach(result => {
        const articleId = result.article.id;
        if (articleScores.has(articleId)) {
          // Normalize score to 0-1 range
          const normalizedScore = maxScore > 0 ? result.score / maxScore : 0;
          
          const entry = articleScores.get(articleId);
          entry.algorithmScores.set(algorithmName, normalizedScore);
          entry.totalScore += normalizedScore;
          entry.reasons.push(`${algorithmName}: ${normalizedScore.toFixed(2)}`);
        }
      });
    });

    // Convert to array and sort by total score
    return Array.from(articleScores.values())
      .sort((a, b) => b.totalScore - a.totalScore);
  }

  /**
   * Apply diversity filter to recommendations
   */
  applyDiversityFilter(recommendations, diversityLevel) {
    if (diversityLevel === 0) return recommendations;
    
    const filtered = [];
    const categoryCount = new Map();
    const sourceCount = new Map();
    
    for (const rec of recommendations) {
      const article = rec.article;
      const categoryFreq = categoryCount.get(article.category) || 0;
      const sourceFreq = sourceCount.get(article.source) || 0;
      
      // Calculate diversity penalty
      const diversityPenalty = (categoryFreq + sourceFreq) * diversityLevel;
      const adjustedScore = rec.totalScore - diversityPenalty;
      
      if (adjustedScore > 0 || filtered.length < 3) { // Always include at least 3
        filtered.push({
          ...rec,
          totalScore: adjustedScore
        });
        
        categoryCount.set(article.category, categoryFreq + 1);
        sourceCount.set(article.source, sourceFreq + 1);
      }
    }
    
    return filtered.sort((a, b) => b.totalScore - a.totalScore);
  }

  /**
   * Generate recommendation reason
   */
  generateRecommendationReason(recommendation) {
    const reasons = [];
    const article = recommendation.article;
    const userPrefs = this.getUserPreferences();
    
    // Check category preference
    const categoryPref = userPrefs.categories.get(article.category);
    if (categoryPref && categoryPref > 0.5) {
      reasons.push(`You often read ${article.category} articles`);
    }
    
    // Check recent activity
    const recentCategories = Array.from(this.sessionBehavior.categoriesViewed.entries())
      .sort((a, b) => b[1] - a[1]);
    
    if (recentCategories.length > 0 && recentCategories[0][0] === article.category) {
      reasons.push(`Similar to what you're reading now`);
    }
    
    // Check trending
    if (recommendation.algorithm === 'trending') {
      reasons.push(`Trending in ${article.category}`);
    }
    
    // Check recency
    const hoursSincePublished = (Date.now() - new Date(article.published_date)) / (1000 * 60 * 60);
    if (hoursSincePublished < 2) {
      reasons.push(`Fresh content`);
    }
    
    return reasons.length > 0 ? reasons[0] : 'Recommended for you';
  }

  /**
   * Calculate recommendation confidence
   */
  calculateConfidence(recommendation) {
    const baseConfidence = Math.min(recommendation.totalScore / 2, 1);
    const historyBonus = this.userProfile.totalArticlesRead > 10 ? 0.1 : 0;
    const recentActivityBonus = this.sessionBehavior.articlesRead.length > 2 ? 0.05 : 0;
    
    return Math.min(baseConfidence + historyBonus + recentActivityBonus, 1);
  }

  /**
   * Track user interaction with article
   */
  trackInteraction(articleId, interactionType, data = {}) {
    const timestamp = Date.now();
    const interaction = {
      articleId,
      type: interactionType,
      data,
      timestamp
    };
    
    // Add to interaction history
    this.interactionHistory.push(interaction);
    
    // Update session behavior
    switch (interactionType) {
      case 'view':
        this.sessionBehavior.articlesRead.push(articleId);
        break;
      case 'reaction':
        this.sessionBehavior.reactions.push(interaction);
        break;
      case 'share':
        // Sharing indicates high engagement
        this.updateUserPreference(data.category, 0.1);
        break;
      case 'time_spent':
        this.sessionBehavior.timeSpent.set(articleId, data.seconds);
        this.updateReadingTime(data.seconds);
        break;
      case 'scroll_depth':
        this.sessionBehavior.scrollDepth.set(articleId, data.percentage);
        break;
    }
    
    // Update user profile
    this.updateUserProfile(interaction);
    
    // Save periodically
    if (this.interactionHistory.length % 10 === 0) {
      this.saveUserData();
    }
  }

  /**
   * Update user preferences based on interaction
   */
  updateUserProfile(interaction) {
    const { articleId, type, data } = interaction;
    
    // Get article from cache or data
    const article = data.article || this.findArticleById(articleId);
    if (!article) return;
    
    // Update category preferences
    if (type === 'view' || type === 'reaction' || type === 'share') {
      this.updateUserPreference(article.category, 0.05);
    }
    
    // Update source preferences
    if (type === 'share' || type === 'reaction') {
      this.updateSourcePreference(article.source, 0.03);
    }
    
    // Update active hours
    const currentHour = new Date().getHours();
    this.updateActiveHour(currentHour, 0.02);
    
    // Update keyword preferences
    if (type === 'view' || type === 'reaction') {
      const keywords = this.extractKeywords(article);
      keywords.forEach(keyword => {
        this.updateKeywordPreference(keyword, 0.01);
      });
    }
  }

  /**
   * Update category preference
   */
  updateUserPreference(category, weight) {
    if (!category) return;
    
    const current = this.userProfile.categoryPreferences.get(category) || 0;
    const updated = Math.min(current + weight, 1); // Cap at 1
    this.userProfile.categoryPreferences.set(category, updated);
    
    // Track in session
    const sessionCount = this.sessionBehavior.categoriesViewed.get(category) || 0;
    this.sessionBehavior.categoriesViewed.set(category, sessionCount + 1);
  }

  /**
   * Update source preference
   */
  updateSourcePreference(source, weight) {
    if (!source) return;
    
    const current = this.userProfile.sourcePreferences.get(source) || 0;
    const updated = Math.min(current + weight, 1);
    this.userProfile.sourcePreferences.set(source, updated);
  }

  /**
   * Update active hour preference
   */
  updateActiveHour(hour, weight) {
    const current = this.userProfile.activeHours.get(hour) || 0;
    const updated = Math.min(current + weight, 1);
    this.userProfile.activeHours.set(hour, updated);
  }

  /**
   * Update keyword preference
   */
  updateKeywordPreference(keyword, weight) {
    const current = this.userProfile.keywordPreferences.get(keyword) || 0;
    const updated = Math.min(current + weight, 1);
    this.userProfile.keywordPreferences.set(keyword, updated);
  }

  /**
   * Update reading time preference
   */
  updateReadingTime(seconds) {
    const minutes = seconds / 60;
    const current = this.userProfile.averageReadingTime;
    
    // Exponential moving average
    this.userProfile.averageReadingTime = current === 0 
      ? minutes 
      : (current * 0.8) + (minutes * 0.2);
  }

  /**
   * Get user preferences for recommendations
   */
  getUserPreferences() {
    return {
      categories: this.userProfile.categoryPreferences,
      sources: this.userProfile.sourcePreferences,
      keywords: this.userProfile.keywordPreferences,
      activeHours: this.userProfile.activeHours,
      averageReadingTime: this.userProfile.averageReadingTime
    };
  }

  /**
   * Check if user has read an article
   */
  hasUserRead(articleId) {
    return this.readingHistory.some(entry => entry.articleId === articleId);
  }

  /**
   * Calculate user similarity for collaborative filtering
   */
  calculateUserSimilarity() {
    // Simplified similarity calculation
    // In a real app, this would compare with other users
    return [
      {
        userId: 'similar_user_1',
        similarity: 0.8,
        readArticles: this.generateSimilarUserReads()
      },
      {
        userId: 'similar_user_2', 
        similarity: 0.6,
        readArticles: this.generateSimilarUserReads()
      }
    ];
  }

  /**
   * Generate similar user reading patterns
   */
  generateSimilarUserReads() {
    // Mock similar user behavior based on user's preferences
    const preferredCategories = Array.from(this.userProfile.categoryPreferences.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([category]) => category);
    
    // Return some mock article IDs that a similar user might have read
    return [`article_${preferredCategories[0]}_1`, `article_${preferredCategories[0]}_2`];
  }

  /**
   * Extract keywords from article
   */
  extractKeywords(article) {
    const text = `${article.title || ''} ${article.excerpt || ''}`.toLowerCase();
    const words = text.split(/\W+/).filter(word => word.length > 3);
    
    // Simple keyword extraction (in real app, use TF-IDF or more advanced methods)
    const wordCounts = new Map();
    words.forEach(word => {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    });
    
    return Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
  }

  /**
   * Calculate keyword matching score
   */
  calculateKeywordScore(articleKeywords, userKeywords) {
    let score = 0;
    
    articleKeywords.forEach(keyword => {
      const userPreference = userKeywords.get(keyword) || 0;
      score += userPreference;
    });
    
    return score;
  }

  /**
   * Estimate reading time
   */
  estimateReadingTime(article) {
    const text = (article.content || article.excerpt || '');
    const wordsPerMinute = 200;
    const words = text.split(/\s+/).length;
    return Math.ceil(words / wordsPerMinute);
  }

  /**
   * Calculate simple sentiment
   */
  calculateSentiment(article) {
    // Simplified sentiment analysis
    const text = `${article.title || ''} ${article.excerpt || ''}`.toLowerCase();
    
    const positiveWords = ['good', 'great', 'excellent', 'amazing', 'success', 'win', 'benefit'];
    const negativeWords = ['bad', 'terrible', 'awful', 'crisis', 'problem', 'fail', 'loss'];
    
    let sentiment = 0;
    positiveWords.forEach(word => {
      if (text.includes(word)) sentiment += 1;
    });
    negativeWords.forEach(word => {
      if (text.includes(word)) sentiment -= 1;
    });
    
    return Math.max(-1, Math.min(1, sentiment / 5)); // Normalize to -1 to 1
  }

  /**
   * Find article by ID (mock implementation)
   */
  findArticleById(articleId) {
    // In real implementation, this would search through available articles
    return null;
  }

  /**
   * Update feature weights based on user feedback
   */
  updateFeatureWeights() {
    // Adaptive feature weight adjustment based on user behavior
    const totalInteractions = this.interactionHistory.length;
    
    if (totalInteractions > 50) {
      // Increase category weight if user shows strong category preferences
      const categoryVariance = this.calculateCategoryVariance();
      if (categoryVariance > 0.3) {
        this.featureWeights.categoryPreference = Math.min(0.4, this.featureWeights.categoryPreference + 0.05);
      }
      
      // Adjust recency weight based on reading patterns
      const recentReadingRatio = this.calculateRecentReadingRatio();
      if (recentReadingRatio > 0.7) {
        this.featureWeights.recency = Math.min(0.25, this.featureWeights.recency + 0.02);
      }
    }
  }

  /**
   * Calculate category preference variance
   */
  calculateCategoryVariance() {
    const preferences = Array.from(this.userProfile.categoryPreferences.values());
    if (preferences.length === 0) return 0;
    
    const mean = preferences.reduce((sum, pref) => sum + pref, 0) / preferences.length;
    const variance = preferences.reduce((sum, pref) => sum + Math.pow(pref - mean, 2), 0) / preferences.length;
    
    return Math.sqrt(variance);
  }

  /**
   * Calculate recent reading ratio
   */
  calculateRecentReadingRatio() {
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    
    const recentReads = this.readingHistory.filter(entry => entry.timestamp > oneDayAgo).length;
    const totalReads = this.readingHistory.length;
    
    return totalReads > 0 ? recentReads / totalReads : 0;
  }

  /**
   * Build category embeddings for better similarity
   */
  buildCategoryEmbeddings() {
    // Simplified category similarity matrix
    const similarities = {
      'local': ['business', 'community'],
      'business': ['local', 'finance', 'technology'],
      'sports': ['health', 'entertainment'],
      'health': ['sports', 'lifestyle'],
      'technology': ['business', 'innovation'],
      'entertainment': ['sports', 'lifestyle']
    };
    
    Object.entries(similarities).forEach(([category, similar]) => {
      this.categoryEmbeddings.set(category, similar);
    });
  }

  /**
   * Start session behavior tracking
   */
  startSessionTracking() {
    // Track page visibility and scroll events
    let isVisible = !document.hidden;
    let scrollDepthTimer = null;
    
    document.addEventListener('visibilitychange', () => {
      isVisible = !document.hidden;
    });
    
    // Track scroll depth periodically
    const trackScrollDepth = () => {
      if (!isVisible) return;
      
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const documentHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrollPercentage = documentHeight > 0 ? (scrollTop / documentHeight) * 100 : 0;
      
      // Emit scroll depth event for current article
      const currentArticle = this.getCurrentArticle();
      if (currentArticle) {
        this.trackInteraction(currentArticle, 'scroll_depth', { percentage: scrollPercentage });
      }
    };
    
    // Track scroll depth every 5 seconds
    setInterval(trackScrollDepth, 5000);
    
    // Track time spent on page
    let pageStartTime = Date.now();
    window.addEventListener('beforeunload', () => {
      const timeSpent = Date.now() - pageStartTime;
      const currentArticle = this.getCurrentArticle();
      if (currentArticle && timeSpent > 10000) { // Only track if more than 10 seconds
        this.trackInteraction(currentArticle, 'time_spent', { seconds: timeSpent / 1000 });
      }
    });
  }

  /**
   * Get current article being viewed
   */
  getCurrentArticle() {
    // In real implementation, this would detect which article is currently in view
    // For now, return the last viewed article from session
    return this.sessionBehavior.articlesRead[this.sessionBehavior.articlesRead.length - 1];
  }

  /**
   * Get recommendation analytics
   */
  getRecommendationAnalytics() {
    return {
      userProfile: {
        totalArticlesRead: this.userProfile.totalArticlesRead,
        topCategories: Array.from(this.userProfile.categoryPreferences.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5),
        averageReadingTime: Math.round(this.userProfile.averageReadingTime),
        mostActiveHour: this.getMostActiveHour()
      },
      sessionBehavior: {
        articlesRead: this.sessionBehavior.articlesRead.length,
        categoriesViewed: this.sessionBehavior.categoriesViewed.size,
        totalReactions: this.sessionBehavior.reactions.length
      },
      recommendations: {
        featureWeights: this.featureWeights,
        algorithmsUsed: Object.keys(this.algorithms)
      }
    };
  }

  /**
   * Get most active hour
   */
  getMostActiveHour() {
    const hours = Array.from(this.userProfile.activeHours.entries());
    if (hours.length === 0) return null;
    
    return hours.sort((a, b) => b[1] - a[1])[0][0];
  }

  /**
   * Load user data from storage
   */
  loadUserProfile() {
    const stored = this.storage.getItem('user_profile', true, {});
    
    return {
      totalArticlesRead: stored.totalArticlesRead || 0,
      categoryPreferences: new Map(stored.categoryPreferences || []),
      sourcePreferences: new Map(stored.sourcePreferences || []),
      keywordPreferences: new Map(stored.keywordPreferences || []),
      activeHours: new Map(stored.activeHours || []),
      averageReadingTime: stored.averageReadingTime || 0,
      lastUpdated: stored.lastUpdated || Date.now()
    };
  }

  loadReadingHistory() {
    return this.storage.getItem('reading_history', true, []);
  }

  loadInteractionHistory() {
    return this.storage.getItem('interaction_history', true, []);
  }

  /**
   * Save user data to storage
   */
  saveUserData() {
    // Convert Maps for storage
    const profileForStorage = {
      totalArticlesRead: this.userProfile.totalArticlesRead,
      categoryPreferences: Array.from(this.userProfile.categoryPreferences.entries()),
      sourcePreferences: Array.from(this.userProfile.sourcePreferences.entries()),
      keywordPreferences: Array.from(this.userProfile.keywordPreferences.entries()),
      activeHours: Array.from(this.userProfile.activeHours.entries()),
      averageReadingTime: this.userProfile.averageReadingTime,
      lastUpdated: Date.now()
    };
    
    this.storage.setItem('user_profile', profileForStorage, true);
    this.storage.setItem('reading_history', this.readingHistory, true);
    
    // Keep only recent interaction history (last 1000 items)
    const recentInteractions = this.interactionHistory.slice(-1000);
    this.storage.setItem('interaction_history', recentInteractions, true);
  }

  /**
   * Export recommendation data
   */
  exportRecommendationData() {
    return {
      userProfile: {
        ...this.userProfile,
        categoryPreferences: Array.from(this.userProfile.categoryPreferences.entries()),
        sourcePreferences: Array.from(this.userProfile.sourcePreferences.entries()),
        keywordPreferences: Array.from(this.userProfile.keywordPreferences.entries()),
        activeHours: Array.from(this.userProfile.activeHours.entries())
      },
      readingHistory: this.readingHistory,
      interactionHistory: this.interactionHistory.slice(-100), // Last 100 interactions
      featureWeights: this.featureWeights,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Import recommendation data
   */
  importRecommendationData(data) {
    if (data.userProfile) {
      Object.assign(this.userProfile, data.userProfile);
      
      // Convert arrays back to Maps
      if (data.userProfile.categoryPreferences) {
        this.userProfile.categoryPreferences = new Map(data.userProfile.categoryPreferences);
      }
      if (data.userProfile.sourcePreferences) {
        this.userProfile.sourcePreferences = new Map(data.userProfile.sourcePreferences);
      }
      if (data.userProfile.keywordPreferences) {
        this.userProfile.keywordPreferences = new Map(data.userProfile.keywordPreferences);
      }
      if (data.userProfile.activeHours) {
        this.userProfile.activeHours = new Map(data.userProfile.activeHours);
      }
    }
    
    if (data.readingHistory) {
      this.readingHistory = data.readingHistory;
    }
    
    if (data.interactionHistory) {
      this.interactionHistory = data.interactionHistory;
    }
    
    if (data.featureWeights) {
      Object.assign(this.featureWeights, data.featureWeights);
    }
    
    this.saveUserData();
  }

  /**
   * Reset user preferences
   */
  resetUserData() {
    this.userProfile = {
      totalArticlesRead: 0,
      categoryPreferences: new Map(),
      sourcePreferences: new Map(),
      keywordPreferences: new Map(),
      activeHours: new Map(),
      averageReadingTime: 0,
      lastUpdated: Date.now()
    };
    
    this.readingHistory = [];
    this.interactionHistory = [];
    this.saveUserData();
  }

  /**
   * Health check
   */
  healthCheck() {
    return {
      userProfile: {
        categories: this.userProfile.categoryPreferences.size,
        interactions: this.interactionHistory.length,
        readingHistory: this.readingHistory.length
      },
      algorithms: Object.keys(this.algorithms).length,
      featureWeights: this.featureWeights,
      sessionBehavior: {
        articlesRead: this.sessionBehavior.articlesRead.length,
        categoriesViewed: this.sessionBehavior.categoriesViewed.size
      },
      isHealthy: this.userProfile.totalArticlesRead > 0 || this.interactionHistory.length > 0
    };
  }
}