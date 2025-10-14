/**
 * TDLib Integration Service
 * Complete Telegram client integration with Zone News Bot
 * Provides advanced features beyond Bot API limitations
 */

const path = require('path');
const fs = require('fs').promises;
const EventEmitter = require('events');
const logger = require('../utils/logger');
const TDLibAuthService = require('./tdlib-auth-service');

// TDLib bindings (install: npm install tdl tdl-tdlib-addon)
let tdl;
let Client;

try {
  tdl = require('tdl');
  Client = tdl.Client;
} catch (error) {
  logger.warn('⚠️ TDLib bindings not installed. Run: npm install tdl tdl-tdlib-addon');
}

class TDLibIntegration extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      apiId: process.env.TDLIB_API_ID || config.apiId,
      apiHash: process.env.TDLIB_API_HASH || config.apiHash,
      phoneNumber: process.env.TDLIB_PHONE || config.phoneNumber,
      databaseDirectory: process.env.TDLIB_DB_PATH || './data/tdlib-sessions/',
      filesDirectory: process.env.TDLIB_FILES_PATH || './data/tdlib-files/',
      useMessageDatabase: true,
      useSecretChats: false,
      systemLanguageCode: 'en',
      deviceModel: 'Zone News Server',
      applicationVersion: '2.0.0',
      ...config
    };

    this.client = null;
    this.authService = null;
    this.isAuthenticated = false;
    this.channelCache = new Map();
    this.messageCache = new Map();
    
    // Zone News specific channels
    this.monitoredChannels = {
      '@thezonechannel': null,
      '@TheZoneNews': null
    };

    // Advanced features state
    this.features = {
      voiceTranscription: true,
      styledText: true,
      messageForwarding: true,
      mediaDownload: true,
      channelAnalytics: true,
      peerDatabase: true
    };
  }

  /**
   * Initialize TDLib client
   */
  async initialize() {
    try {
      if (!Client) {
        logger.error('❌ TDLib not available. Please install dependencies.');
        return false;
      }

      logger.info('🚀 Initializing TDLib Integration...');

      // Ensure directories exist
      await this.ensureDirectories();

      // Initialize auth service
      this.authService = new TDLibAuthService(this.config);
      
      // Check for existing session
      const hasSession = await this.authService.checkExistingSession();
      
      if (hasSession) {
        logger.info('✅ Found existing TDLib session, restoring...');
      }

      // Create TDLib client
      this.client = new Client({
        apiId: parseInt(this.config.apiId),
        apiHash: this.config.apiHash,
        databaseDirectory: this.config.databaseDirectory,
        filesDirectory: this.config.filesDirectory,
        tdlibParameters: {
          use_message_database: this.config.useMessageDatabase,
          use_secret_chats: this.config.useSecretChats,
          system_language_code: this.config.systemLanguageCode,
          device_model: this.config.deviceModel,
          application_version: this.config.applicationVersion,
          enable_storage_optimizer: true
        }
      });

      // Set up event handlers
      this.setupEventHandlers();

      // Connect to Telegram
      await this.client.connect();

      // Authenticate if needed
      if (!hasSession) {
        await this.authenticate();
      } else {
        this.isAuthenticated = true;
        logger.info('✅ Session restored successfully');
      }

      // Load monitored channels
      await this.loadMonitoredChannels();

      logger.info('✅ TDLib Integration initialized successfully');
      return true;

    } catch (error) {
      logger.error('❌ Failed to initialize TDLib:', error);
      return false;
    }
  }

  /**
   * Set up TDLib event handlers
   */
  setupEventHandlers() {
    if (!this.client) return;

    // Handle authorization state updates
    this.client.on('update', (update) => {
      if (update['@type'] === 'updateAuthorizationState') {
        this.handleAuthorizationState(update.authorization_state);
      }
    });

    // Handle new messages
    this.client.on('update', (update) => {
      if (update['@type'] === 'updateNewMessage') {
        this.handleNewMessage(update.message);
      }
    });

    // Handle message edits
    this.client.on('update', (update) => {
      if (update['@type'] === 'updateMessageEdited') {
        this.handleMessageEdit(update);
      }
    });

    // Handle channel updates
    this.client.on('update', (update) => {
      if (update['@type'] === 'updateSupergroup') {
        this.handleChannelUpdate(update.supergroup);
      }
    });

    // Handle file downloads
    this.client.on('update', (update) => {
      if (update['@type'] === 'updateFile') {
        this.handleFileUpdate(update.file);
      }
    });
  }

  /**
   * Handle authorization state changes
   */
  async handleAuthorizationState(authState) {
    logger.info(`📱 Authorization state: ${authState['@type']}`);

    switch (authState['@type']) {
      case 'authorizationStateWaitTdlibParameters':
        // Parameters are set in client constructor
        break;

      case 'authorizationStateWaitPhoneNumber':
        await this.client.invoke({
          '@type': 'setAuthenticationPhoneNumber',
          phone_number: this.config.phoneNumber
        });
        break;

      case 'authorizationStateWaitCode':
        // In production, you'd get this from user input
        logger.info('⏳ Waiting for authentication code...');
        // Code would be provided through a secure channel
        break;

      case 'authorizationStateReady':
        this.isAuthenticated = true;
        logger.info('✅ Successfully authenticated with TDLib');
        await this.authService.saveSessionInfo();
        break;

      case 'authorizationStateClosed':
        this.isAuthenticated = false;
        logger.info('🔒 TDLib session closed');
        break;
    }
  }

  /**
   * Authenticate with Telegram
   */
  async authenticate() {
    if (!this.authService) {
      throw new Error('Auth service not initialized');
    }

    return await this.authService.authenticate();
  }

  /**
   * Load and cache monitored channels
   */
  async loadMonitoredChannels() {
    if (!this.client || !this.isAuthenticated) return;

    for (const username of Object.keys(this.monitoredChannels)) {
      try {
        const result = await this.client.invoke({
          '@type': 'searchPublicChat',
          username: username.replace('@', '')
        });

        if (result && result['@type'] === 'chat') {
          this.monitoredChannels[username] = result;
          this.channelCache.set(result.id, result);
          logger.info(`✅ Loaded channel: ${username} (ID: ${result.id})`);
        }
      } catch (error) {
        logger.error(`❌ Failed to load channel ${username}:`, error);
      }
    }
  }

  /**
   * Handle new messages from channels
   */
  async handleNewMessage(message) {
    if (!message) return;

    // Check if message is from monitored channel
    const channel = this.channelCache.get(message.chat_id);
    if (!channel) return;

    const channelUsername = Object.keys(this.monitoredChannels).find(
      username => this.monitoredChannels[username]?.id === message.chat_id
    );

    if (channelUsername) {
      logger.info(`📨 New message in ${channelUsername}: ${message.id}`);
      
      // Cache message
      this.messageCache.set(`${message.chat_id}_${message.id}`, message);

      // Emit event for processing
      this.emit('channelMessage', {
        channel: channelUsername,
        message: message,
        timestamp: new Date(message.date * 1000)
      });

      // Process advanced features
      await this.processAdvancedFeatures(message, channel);
    }
  }

  /**
   * Process advanced features for messages
   */
  async processAdvancedFeatures(message, channel) {
    // Voice transcription
    if (this.features.voiceTranscription && message.content?.['@type'] === 'messageVoiceNote') {
      await this.transcribeVoiceMessage(message);
    }

    // Download media if needed
    if (this.features.mediaDownload && this.hasMedia(message)) {
      await this.downloadMessageMedia(message);
    }

    // Extract styled text entities
    if (this.features.styledText && message.content?.text) {
      const entities = this.extractTextEntities(message.content.text);
      if (entities.length > 0) {
        this.emit('styledText', { message, entities });
      }
    }
  }

  /**
   * Transcribe voice messages
   */
  async transcribeVoiceMessage(message) {
    if (!this.client || !message.content?.voice_note) return;

    try {
      const result = await this.client.invoke({
        '@type': 'transcribeAudio',
        chat_id: message.chat_id,
        message_id: message.id
      });

      if (result && result.text) {
        logger.info(`🎤 Transcribed voice message: ${result.text.substring(0, 100)}...`);
        
        this.emit('voiceTranscription', {
          messageId: message.id,
          chatId: message.chat_id,
          text: result.text,
          pending: result.pending || false
        });
      }
    } catch (error) {
      logger.error('❌ Voice transcription failed:', error);
    }
  }

  /**
   * Forward message with advanced options
   */
  async forwardMessage(fromChatId, toChatId, messageId, options = {}) {
    if (!this.client || !this.isAuthenticated) {
      throw new Error('TDLib not authenticated');
    }

    const forwardOptions = {
      '@type': 'forwardMessages',
      chat_id: toChatId,
      from_chat_id: fromChatId,
      message_ids: [messageId],
      send_copy: options.removeCaptions || false,
      remove_caption: options.removeCaptions || false,
      ...options
    };

    try {
      const result = await this.client.invoke(forwardOptions);
      logger.info(`✅ Message forwarded: ${messageId} from ${fromChatId} to ${toChatId}`);
      return result;
    } catch (error) {
      logger.error('❌ Forward failed:', error);
      throw error;
    }
  }

  /**
   * Get channel statistics
   */
  async getChannelStatistics(channelId) {
    if (!this.client || !this.isAuthenticated) {
      throw new Error('TDLib not authenticated');
    }

    try {
      const stats = await this.client.invoke({
        '@type': 'getChatStatistics',
        chat_id: channelId,
        is_dark: false
      });

      return {
        memberCount: stats.member_count?.current || 0,
        viewsPerPost: stats.mean_view_count?.current || 0,
        sharesPerPost: stats.mean_share_count?.current || 0,
        enabledNotifications: stats.enabled_notifications_percentage || 0,
        growthRate: this.calculateGrowthRate(stats),
        topHoursGraph: stats.top_hours_graph,
        recentMessageInteractions: stats.recent_message_interactions
      };
    } catch (error) {
      logger.error('❌ Failed to get channel statistics:', error);
      return null;
    }
  }

  /**
   * Get message statistics
   */
  async getMessageStatistics(chatId, messageId) {
    if (!this.client || !this.isAuthenticated) {
      throw new Error('TDLib not authenticated');
    }

    try {
      const stats = await this.client.invoke({
        '@type': 'getMessageStatistics',
        chat_id: chatId,
        message_id: messageId,
        is_dark: false
      });

      return {
        views: stats.view_count?.current || 0,
        forwards: stats.forward_count?.current || 0,
        reactions: stats.reaction_count || {}
      };
    } catch (error) {
      logger.error('❌ Failed to get message statistics:', error);
      return null;
    }
  }

  /**
   * Download message media
   */
  async downloadMessageMedia(message) {
    if (!message.content) return;

    let fileId = null;
    
    switch (message.content['@type']) {
      case 'messagePhoto':
        fileId = message.content.photo.sizes[message.content.photo.sizes.length - 1].photo.id;
        break;
      case 'messageVideo':
        fileId = message.content.video.video.id;
        break;
      case 'messageDocument':
        fileId = message.content.document.document.id;
        break;
      case 'messageVoiceNote':
        fileId = message.content.voice_note.voice.id;
        break;
    }

    if (fileId) {
      try {
        const file = await this.client.invoke({
          '@type': 'downloadFile',
          file_id: fileId,
          priority: 1,
          synchronous: false
        });

        logger.info(`📥 Downloading file: ${fileId}`);
        return file;
      } catch (error) {
        logger.error('❌ File download failed:', error);
      }
    }
  }

  /**
   * Send message with styled text
   */
  async sendStyledMessage(chatId, text, entities = []) {
    if (!this.client || !this.isAuthenticated) {
      throw new Error('TDLib not authenticated');
    }

    const formattedText = {
      '@type': 'formattedText',
      text: text,
      entities: entities.map(entity => ({
        '@type': `textEntity${entity.type}`,
        offset: entity.offset,
        length: entity.length,
        ...entity.extra
      }))
    };

    try {
      const result = await this.client.invoke({
        '@type': 'sendMessage',
        chat_id: chatId,
        input_message_content: {
          '@type': 'inputMessageText',
          text: formattedText,
          disable_web_page_preview: false,
          clear_draft: true
        }
      });

      logger.info(`✅ Styled message sent to ${chatId}`);
      return result;
    } catch (error) {
      logger.error('❌ Failed to send styled message:', error);
      throw error;
    }
  }

  /**
   * Get chat history with full access
   */
  async getChatHistory(chatId, limit = 100, fromMessageId = 0) {
    if (!this.client || !this.isAuthenticated) {
      throw new Error('TDLib not authenticated');
    }

    try {
      const history = await this.client.invoke({
        '@type': 'getChatHistory',
        chat_id: chatId,
        from_message_id: fromMessageId,
        offset: 0,
        limit: limit,
        only_local: false
      });

      logger.info(`📜 Retrieved ${history.messages.length} messages from chat ${chatId}`);
      return history.messages;
    } catch (error) {
      logger.error('❌ Failed to get chat history:', error);
      throw error;
    }
  }

  /**
   * Search messages in chat
   */
  async searchChatMessages(chatId, query, options = {}) {
    if (!this.client || !this.isAuthenticated) {
      throw new Error('TDLib not authenticated');
    }

    try {
      const result = await this.client.invoke({
        '@type': 'searchChatMessages',
        chat_id: chatId,
        query: query,
        sender_id: options.senderId || null,
        from_message_id: options.fromMessageId || 0,
        offset: options.offset || 0,
        limit: options.limit || 100,
        filter: options.filter || null
      });

      logger.info(`🔍 Found ${result.total_count} messages matching "${query}"`);
      return result;
    } catch (error) {
      logger.error('❌ Search failed:', error);
      throw error;
    }
  }

  /**
   * Update peer database
   */
  async updatePeerDatabase(peer) {
    if (!this.features.peerDatabase) return;

    const peerKey = `${peer['@type']}_${peer.id}`;
    
    try {
      // Store in database
      await fs.writeFile(
        path.join(this.config.databaseDirectory, `peer_${peerKey}.json`),
        JSON.stringify(peer, null, 2)
      );

      // Update cache
      this.channelCache.set(peer.id, peer);

      logger.info(`💾 Updated peer database: ${peerKey}`);
    } catch (error) {
      logger.error('❌ Failed to update peer database:', error);
    }
  }

  /**
   * Extract text entities from formatted text
   */
  extractTextEntities(formattedText) {
    if (!formattedText || !formattedText.entities) return [];

    return formattedText.entities.map(entity => ({
      type: entity['@type'].replace('textEntity', ''),
      offset: entity.offset,
      length: entity.length,
      url: entity.url,
      userId: entity.user_id
    }));
  }

  /**
   * Check if message has media
   */
  hasMedia(message) {
    const mediaTypes = [
      'messagePhoto',
      'messageVideo',
      'messageDocument',
      'messageVoiceNote',
      'messageVideoNote',
      'messageAudio'
    ];
    
    return message.content && mediaTypes.includes(message.content['@type']);
  }

  /**
   * Calculate growth rate from statistics
   */
  calculateGrowthRate(stats) {
    if (!stats.member_count) return 0;
    
    const current = stats.member_count.current || 0;
    const previous = stats.member_count.previous || 0;
    
    if (previous === 0) return 0;
    
    return ((current - previous) / previous * 100).toFixed(2);
  }

  /**
   * Ensure required directories exist
   */
  async ensureDirectories() {
    const dirs = [
      this.config.databaseDirectory,
      this.config.filesDirectory,
      path.join(this.config.databaseDirectory, 'peers'),
      path.join(this.config.filesDirectory, 'media'),
      path.join(this.config.filesDirectory, 'voice')
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Handle message edit updates
   */
  handleMessageEdit(update) {
    const messageKey = `${update.chat_id}_${update.message_id}`;
    const cachedMessage = this.messageCache.get(messageKey);
    
    if (cachedMessage) {
      // Update cached message
      Object.assign(cachedMessage, update);
      
      this.emit('messageEdited', {
        chatId: update.chat_id,
        messageId: update.message_id,
        editDate: update.edit_date
      });
    }
  }

  /**
   * Handle channel updates
   */
  handleChannelUpdate(supergroup) {
    const channel = this.channelCache.get(supergroup.id);
    
    if (channel) {
      // Update channel info
      Object.assign(channel, supergroup);
      
      this.emit('channelUpdated', {
        channelId: supergroup.id,
        updates: supergroup
      });
    }
  }

  /**
   * Handle file updates
   */
  handleFileUpdate(file) {
    if (file.local.is_downloading_completed) {
      logger.info(`✅ File downloaded: ${file.local.path}`);
      
      this.emit('fileDownloaded', {
        fileId: file.id,
        path: file.local.path,
        size: file.size
      });
    }
  }

  /**
   * Clean up and close connection
   */
  async cleanup() {
    try {
      if (this.client) {
        await this.client.close();
        logger.info('🔒 TDLib connection closed');
      }
      
      this.client = null;
      this.isAuthenticated = false;
      this.channelCache.clear();
      this.messageCache.clear();
      
    } catch (error) {
      logger.error('❌ Cleanup error:', error);
    }
  }

  /**
   * Get integration status
   */
  getStatus() {
    return {
      initialized: !!this.client,
      authenticated: this.isAuthenticated,
      monitoredChannels: Object.keys(this.monitoredChannels).length,
      cachedMessages: this.messageCache.size,
      features: this.features,
      sessionPath: this.config.databaseDirectory
    };
  }
}

// Export singleton instance
let tdlibIntegration = null;

module.exports = {
  TDLibIntegration,
  
  getInstance: (config) => {
    if (!tdlibIntegration) {
      tdlibIntegration = new TDLibIntegration(config);
    }
    return tdlibIntegration;
  },

  // Helper to check if TDLib is available
  isAvailable: () => {
    try {
      require('tdl');
      return true;
    } catch {
      return false;
    }
  }
};
