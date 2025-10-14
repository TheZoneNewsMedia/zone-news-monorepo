const EventEmitter = require('events');
const tdl = require('tdl');
const Redis = require('ioredis');
const winston = require('winston');
const WebSocket = require('ws');

class TDLibManager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      apiId: process.env.TDLIB_API_ID || config.apiId,
      apiHash: process.env.TDLIB_API_HASH || config.apiHash,
      databaseDirectory: config.databaseDirectory || './tdlib-db',
      filesDirectory: config.filesDirectory || './tdlib-files',
      useMessageDatabase: config.useMessageDatabase !== false,
      useSecretChats: config.useSecretChats || false,
      systemLanguageCode: config.systemLanguageCode || 'en',
      deviceModel: config.deviceModel || 'Zone News Server',
      applicationVersion: config.applicationVersion || '1.0.0',
      enableStorageOptimizer: true,
      useFileDatabase: true,
      useChatInfoDatabase: true,
      logVerbosityLevel: config.logVerbosityLevel || 2,
      ...config
    };

    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      db: 2 // Use separate DB for TDLib
    });

    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ filename: 'logs/tdlib.log' }),
        new winston.transports.Console()
      ]
    });

    this.client = null;
    this.authState = null;
    this.isAuthorized = false;
    this.phoneNumber = null;
    this.qrCodeLink = null;
    this.updates = [];
    this.messageHandlers = new Map();
    this.channelMonitors = new Map();
    this.websocketClients = new Set();
    
    // Channels to monitor
    this.monitoredChannels = [
      '@thezonechannel',
      '@TheZoneNews'
    ];

    // Voice transcription queue
    this.transcriptionQueue = [];
    this.isProcessingTranscription = false;
  }

  async initialize() {
    try {
      this.logger.info('Initializing TDLib client...');
      
      // Create TDLib client
      this.client = tdl.create({
        apiId: this.config.apiId,
        apiHash: this.config.apiHash,
        verbosityLevel: this.config.logVerbosityLevel
      });

      // Set up update handler
      this.client.on('update', this.handleUpdate.bind(this));
      this.client.on('error', this.handleError.bind(this));

      // Connect to TDLib
      await this.client.connect();
      
      // Set TDLib parameters
      await this.setTdlibParameters();
      
      // Check for existing session
      const savedSession = await this.redis.get('tdlib:session');
      if (savedSession) {
        this.logger.info('Restoring previous TDLib session...');
        await this.restoreSession(JSON.parse(savedSession));
      }

      this.logger.info('TDLib client initialized successfully');
      this.emit('ready');
      
      return true;
    } catch (error) {
      this.logger.error('Failed to initialize TDLib:', error);
      throw error;
    }
  }

  async setTdlibParameters() {
    return this.client.invoke({
      '@type': 'setTdlibParameters',
      parameters: {
        '@type': 'tdlibParameters',
        database_directory: this.config.databaseDirectory,
        files_directory: this.config.filesDirectory,
        use_message_database: this.config.useMessageDatabase,
        use_secret_chats: this.config.useSecretChats,
        api_id: this.config.apiId,
        api_hash: this.config.apiHash,
        system_language_code: this.config.systemLanguageCode,
        device_model: this.config.deviceModel,
        application_version: this.config.applicationVersion,
        enable_storage_optimizer: this.config.enableStorageOptimizer,
        use_file_database: this.config.useFileDatabase,
        use_chat_info_database: this.config.useChatInfoDatabase
      }
    });
  }

  async handleUpdate(update) {
    const updateType = update['@type'];
    
    // Store update for debugging
    this.updates.push({
      type: updateType,
      data: update,
      timestamp: new Date()
    });

    // Keep only last 1000 updates
    if (this.updates.length > 1000) {
      this.updates.shift();
    }

    // Broadcast to WebSocket clients
    this.broadcastToWebsockets({
      type: 'tdlib_update',
      update: update
    });

    switch (updateType) {
      case 'updateAuthorizationState':
        await this.handleAuthorizationState(update.authorization_state);
        break;
        
      case 'updateNewMessage':
        await this.handleNewMessage(update.message);
        break;
        
      case 'updateMessageContent':
        await this.handleMessageUpdate(update);
        break;
        
      case 'updateFile':
        await this.handleFileUpdate(update.file);
        break;
        
      case 'updateNewChat':
        await this.handleNewChat(update.chat);
        break;
        
      case 'updateChatLastMessage':
        await this.handleChatUpdate(update);
        break;
        
      case 'updateUser':
        await this.handleUserUpdate(update.user);
        break;
        
      case 'updateSupergroup':
        await this.handleSupergroupUpdate(update.supergroup);
        break;
        
      default:
        this.logger.debug(`Unhandled update type: ${updateType}`);
    }
    
    this.emit('update', update);
  }

  async handleAuthorizationState(authState) {
    this.authState = authState['@type'];
    this.logger.info(`Authorization state: ${this.authState}`);
    
    switch (this.authState) {
      case 'authorizationStateWaitPhoneNumber':
        await this.requestPhoneNumber();
        break;
        
      case 'authorizationStateWaitCode':
        await this.requestAuthCode();
        break;
        
      case 'authorizationStateWaitOtherDeviceConfirmation':
        this.qrCodeLink = authState.link;
        this.logger.info('QR Code link generated:', this.qrCodeLink);
        this.emit('qrCode', this.qrCodeLink);
        this.broadcastToWebsockets({
          type: 'qr_code',
          link: this.qrCodeLink
        });
        break;
        
      case 'authorizationStateWaitPassword':
        await this.requestPassword();
        break;
        
      case 'authorizationStateReady':
        this.isAuthorized = true;
        this.logger.info('Successfully authorized!');
        await this.onAuthorized();
        break;
        
      case 'authorizationStateLoggingOut':
        this.isAuthorized = false;
        this.logger.info('Logging out...');
        break;
        
      case 'authorizationStateClosing':
        this.logger.info('TDLib closing...');
        break;
        
      case 'authorizationStateClosed':
        this.logger.info('TDLib closed');
        this.isAuthorized = false;
        break;
    }
    
    // Save session state
    await this.saveSession();
  }

  async requestPhoneNumber() {
    // Check if we have a saved phone number
    const savedPhone = await this.redis.get('tdlib:phone');
    if (savedPhone) {
      await this.setPhoneNumber(savedPhone);
    } else {
      // Request QR code login instead
      await this.client.invoke({
        '@type': 'requestQrCodeAuthentication',
        other_user_ids: []
      });
    }
  }

  async setPhoneNumber(phoneNumber) {
    this.phoneNumber = phoneNumber;
    await this.redis.set('tdlib:phone', phoneNumber);
    
    return this.client.invoke({
      '@type': 'setAuthenticationPhoneNumber',
      phone_number: phoneNumber
    });
  }

  async requestAuthCode() {
    this.logger.info('Authentication code required. Check your Telegram app.');
    this.emit('authCodeRequired');
    this.broadcastToWebsockets({
      type: 'auth_code_required'
    });
  }

  async setAuthCode(code) {
    return this.client.invoke({
      '@type': 'checkAuthenticationCode',
      code: code
    });
  }

  async requestPassword() {
    this.logger.info('2FA password required');
    this.emit('passwordRequired');
    this.broadcastToWebsockets({
      type: 'password_required'
    });
  }

  async setPassword(password) {
    return this.client.invoke({
      '@type': 'checkAuthenticationPassword',
      password: password
    });
  }

  async onAuthorized() {
    // Save successful auth state
    await this.saveSession();
    
    // Get current user info
    const me = await this.client.invoke({
      '@type': 'getMe'
    });
    this.logger.info('Logged in as:', me);
    
    // Start monitoring channels
    await this.startChannelMonitoring();
    
    // Load chats
    await this.loadChats();
    
    this.emit('authorized', me);
  }

  async startChannelMonitoring() {
    for (const channelUsername of this.monitoredChannels) {
      try {
        const chat = await this.searchPublicChat(channelUsername);
        if (chat) {
          this.channelMonitors.set(chat.id, {
            username: channelUsername,
            title: chat.title,
            chatId: chat.id
          });
          
          // Join channel if not already member
          await this.joinChat(chat.id);
          
          // Load recent messages
          await this.getChatHistory(chat.id, 0, 50);
          
          this.logger.info(`Monitoring channel: ${channelUsername} (${chat.title})`);
        }
      } catch (error) {
        this.logger.error(`Failed to monitor channel ${channelUsername}:`, error);
      }
    }
  }

  async searchPublicChat(username) {
    try {
      return await this.client.invoke({
        '@type': 'searchPublicChat',
        username: username.replace('@', '')
      });
    } catch (error) {
      this.logger.error(`Failed to search chat ${username}:`, error);
      return null;
    }
  }

  async joinChat(chatId) {
    try {
      return await this.client.invoke({
        '@type': 'joinChat',
        chat_id: chatId
      });
    } catch (error) {
      this.logger.warn(`Failed to join chat ${chatId}:`, error);
    }
  }

  async getChatHistory(chatId, fromMessageId = 0, limit = 50) {
    try {
      const messages = await this.client.invoke({
        '@type': 'getChatHistory',
        chat_id: chatId,
        from_message_id: fromMessageId,
        offset: 0,
        limit: limit,
        only_local: false
      });
      
      return messages.messages;
    } catch (error) {
      this.logger.error(`Failed to get chat history for ${chatId}:`, error);
      return [];
    }
  }

  async handleNewMessage(message) {
    const chatId = message.chat_id;
    
    // Check if this is from a monitored channel
    if (this.channelMonitors.has(chatId)) {
      const channel = this.channelMonitors.get(chatId);
      this.logger.info(`New message in ${channel.username}: ${message.id}`);
      
      // Process message based on content type
      await this.processMessage(message, channel);
      
      // Store in Redis
      await this.storeMessage(message, channel);
      
      // Emit event
      this.emit('channelMessage', {
        channel: channel,
        message: message
      });
      
      // Broadcast to WebSocket clients
      this.broadcastToWebsockets({
        type: 'channel_message',
        channel: channel,
        message: await this.formatMessage(message)
      });
    }
    
    // Call registered message handlers
    for (const [pattern, handler] of this.messageHandlers) {
      if (this.matchesPattern(message, pattern)) {
        try {
          await handler(message);
        } catch (error) {
          this.logger.error('Message handler error:', error);
        }
      }
    }
  }

  async processMessage(message, channel) {
    const content = message.content;
    
    switch (content['@type']) {
      case 'messageText':
        // Extract text and entities
        const text = content.text.text;
        const entities = content.text.entities || [];
        
        this.logger.info(`Text message: ${text.substring(0, 100)}...`);
        break;
        
      case 'messagePhoto':
        // Download photo
        const photo = content.photo;
        const largestPhoto = photo.sizes[photo.sizes.length - 1];
        if (largestPhoto) {
          await this.downloadFile(largestPhoto.photo.id);
        }
        break;
        
      case 'messageVideo':
        // Handle video
        const video = content.video;
        await this.downloadFile(video.video.id);
        break;
        
      case 'messageVoiceNote':
        // Transcribe voice note
        await this.transcribeVoiceNote(message, content.voice_note);
        break;
        
      case 'messageDocument':
        // Handle document
        const document = content.document;
        await this.downloadFile(document.document.id);
        break;
        
      default:
        this.logger.debug(`Unhandled message type: ${content['@type']}`);
    }
  }

  async transcribeVoiceNote(message, voiceNote) {
    // Add to transcription queue
    this.transcriptionQueue.push({
      messageId: message.id,
      chatId: message.chat_id,
      voiceNote: voiceNote,
      timestamp: new Date()
    });
    
    // Process queue
    if (!this.isProcessingTranscription) {
      await this.processTranscriptionQueue();
    }
  }

  async processTranscriptionQueue() {
    if (this.transcriptionQueue.length === 0) {
      this.isProcessingTranscription = false;
      return;
    }
    
    this.isProcessingTranscription = true;
    const item = this.transcriptionQueue.shift();
    
    try {
      // Download voice file
      const file = await this.downloadFile(item.voiceNote.voice.id);
      
      // Request transcription from OpenAI Whisper or similar service
      const transcription = await this.requestTranscription(file);
      
      // Store transcription
      await this.redis.set(
        `tdlib:transcription:${item.messageId}`,
        JSON.stringify({
          text: transcription,
          messageId: item.messageId,
          chatId: item.chatId,
          timestamp: item.timestamp
        })
      );
      
      // Emit transcription event
      this.emit('voiceTranscription', {
        messageId: item.messageId,
        chatId: item.chatId,
        transcription: transcription
      });
      
      this.logger.info(`Transcribed voice note: ${transcription.substring(0, 100)}...`);
    } catch (error) {
      this.logger.error('Transcription failed:', error);
    }
    
    // Process next item
    await this.processTranscriptionQueue();
  }

  async requestTranscription(file) {
    // TODO: Implement actual transcription service integration
    // This could use OpenAI Whisper, Google Speech-to-Text, etc.
    return 'Voice transcription placeholder';
  }

  async downloadFile(fileId, priority = 1) {
    try {
      const file = await this.client.invoke({
        '@type': 'downloadFile',
        file_id: fileId,
        priority: priority,
        offset: 0,
        limit: 0,
        synchronous: false
      });
      
      return file;
    } catch (error) {
      this.logger.error(`Failed to download file ${fileId}:`, error);
      return null;
    }
  }

  async handleFileUpdate(file) {
    if (file.local.is_downloading_completed) {
      this.logger.info(`File downloaded: ${file.local.path}`);
      this.emit('fileDownloaded', file);
      
      // Process downloaded file based on type
      await this.processDownloadedFile(file);
    }
  }

  async processDownloadedFile(file) {
    // Store file metadata in Redis
    await this.redis.set(
      `tdlib:file:${file.id}`,
      JSON.stringify({
        id: file.id,
        path: file.local.path,
        size: file.size,
        downloadedAt: new Date()
      })
    );
  }

  async storeMessage(message, channel) {
    const key = `tdlib:message:${message.chat_id}:${message.id}`;
    const data = {
      messageId: message.id,
      chatId: message.chat_id,
      channel: channel,
      content: message.content,
      date: message.date,
      senderUserId: message.sender_id?.user_id,
      views: message.interaction_info?.view_count || 0,
      forwards: message.interaction_info?.forward_count || 0,
      replies: message.interaction_info?.reply_info?.reply_count || 0
    };
    
    await this.redis.set(key, JSON.stringify(data));
    await this.redis.expire(key, 86400 * 7); // Keep for 7 days
  }

  async formatMessage(message) {
    const content = message.content;
    let formatted = {
      id: message.id,
      chatId: message.chat_id,
      date: new Date(message.date * 1000),
      type: content['@type']
    };
    
    switch (content['@type']) {
      case 'messageText':
        formatted.text = content.text.text;
        formatted.entities = content.text.entities;
        break;
        
      case 'messagePhoto':
        formatted.caption = content.caption?.text;
        formatted.photoSizes = content.photo.sizes.length;
        break;
        
      case 'messageVideo':
        formatted.caption = content.caption?.text;
        formatted.duration = content.video.duration;
        break;
        
      case 'messageVoiceNote':
        formatted.duration = content.voice_note.duration;
        formatted.waveform = content.voice_note.waveform;
        break;
    }
    
    return formatted;
  }

  async loadChats(limit = 100) {
    try {
      const chats = await this.client.invoke({
        '@type': 'getChats',
        offset_order: '9223372036854775807',
        offset_chat_id: 0,
        limit: limit
      });
      
      this.logger.info(`Loaded ${chats.chat_ids.length} chats`);
      return chats.chat_ids;
    } catch (error) {
      this.logger.error('Failed to load chats:', error);
      return [];
    }
  }

  async getChat(chatId) {
    try {
      return await this.client.invoke({
        '@type': 'getChat',
        chat_id: chatId
      });
    } catch (error) {
      this.logger.error(`Failed to get chat ${chatId}:`, error);
      return null;
    }
  }

  async sendMessage(chatId, text, options = {}) {
    try {
      const message = await this.client.invoke({
        '@type': 'sendMessage',
        chat_id: chatId,
        input_message_content: {
          '@type': 'inputMessageText',
          text: {
            '@type': 'formattedText',
            text: text
          }
        },
        ...options
      });
      
      this.logger.info(`Message sent to ${chatId}: ${message.id}`);
      return message;
    } catch (error) {
      this.logger.error(`Failed to send message to ${chatId}:`, error);
      throw error;
    }
  }

  registerMessageHandler(pattern, handler) {
    this.messageHandlers.set(pattern, handler);
  }

  matchesPattern(message, pattern) {
    if (typeof pattern === 'string') {
      const content = message.content;
      if (content['@type'] === 'messageText') {
        return content.text.text.includes(pattern);
      }
    } else if (pattern instanceof RegExp) {
      const content = message.content;
      if (content['@type'] === 'messageText') {
        return pattern.test(content.text.text);
      }
    } else if (typeof pattern === 'function') {
      return pattern(message);
    }
    
    return false;
  }

  async handleNewChat(chat) {
    this.logger.info(`New chat discovered: ${chat.title} (${chat.id})`);
    this.emit('newChat', chat);
  }

  async handleChatUpdate(update) {
    this.logger.debug(`Chat updated: ${update.chat_id}`);
    this.emit('chatUpdate', update);
  }

  async handleMessageUpdate(update) {
    this.logger.debug(`Message updated: ${update.message_id} in chat ${update.chat_id}`);
    this.emit('messageUpdate', update);
  }

  async handleUserUpdate(user) {
    this.logger.debug(`User updated: ${user.username || user.first_name}`);
    this.emit('userUpdate', user);
  }

  async handleSupergroupUpdate(supergroup) {
    this.logger.debug(`Supergroup updated: ${supergroup.username}`);
    this.emit('supergroupUpdate', supergroup);
  }

  handleError(error) {
    this.logger.error('TDLib error:', error);
    this.emit('error', error);
  }

  async saveSession() {
    const sessionData = {
      authState: this.authState,
      isAuthorized: this.isAuthorized,
      phoneNumber: this.phoneNumber,
      timestamp: new Date()
    };
    
    await this.redis.set('tdlib:session', JSON.stringify(sessionData));
  }

  async restoreSession(sessionData) {
    this.authState = sessionData.authState;
    this.isAuthorized = sessionData.isAuthorized;
    this.phoneNumber = sessionData.phoneNumber;
    
    if (this.isAuthorized) {
      await this.onAuthorized();
    }
  }

  // WebSocket support
  addWebSocketClient(ws) {
    this.websocketClients.add(ws);
    
    // Send initial state
    ws.send(JSON.stringify({
      type: 'connection',
      authState: this.authState,
      isAuthorized: this.isAuthorized,
      monitoredChannels: Array.from(this.channelMonitors.values())
    }));
    
    // Handle disconnection
    ws.on('close', () => {
      this.websocketClients.delete(ws);
    });
  }

  broadcastToWebsockets(data) {
    const message = JSON.stringify(data);
    
    for (const ws of this.websocketClients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }

  // API methods for external access
  async getRecentUpdates(limit = 100) {
    return this.updates.slice(-limit);
  }

  async getChannelMessages(channelUsername, limit = 50) {
    const channel = Array.from(this.channelMonitors.values())
      .find(ch => ch.username === channelUsername);
    
    if (!channel) {
      throw new Error(`Channel ${channelUsername} not monitored`);
    }
    
    return this.getChatHistory(channel.chatId, 0, limit);
  }

  async searchMessages(query, chatId = null) {
    try {
      const params = {
        '@type': 'searchMessages',
        query: query,
        offset_date: 0,
        offset_chat_id: 0,
        offset_message_id: 0,
        limit: 50
      };
      
      if (chatId) {
        params.chat_list = {
          '@type': 'chatListMain'
        };
        params.chat_id = chatId;
      }
      
      return await this.client.invoke(params);
    } catch (error) {
      this.logger.error('Search failed:', error);
      throw error;
    }
  }

  async logout() {
    try {
      await this.client.invoke({
        '@type': 'logOut'
      });
      
      await this.redis.del('tdlib:session');
      await this.redis.del('tdlib:phone');
      
      this.isAuthorized = false;
      this.logger.info('Logged out successfully');
    } catch (error) {
      this.logger.error('Logout failed:', error);
      throw error;
    }
  }

  async destroy() {
    try {
      await this.client.invoke({
        '@type': 'destroy'
      });
      
      this.websocketClients.clear();
      this.messageHandlers.clear();
      this.channelMonitors.clear();
      
      await this.redis.quit();
      
      this.logger.info('TDLib manager destroyed');
    } catch (error) {
      this.logger.error('Destroy failed:', error);
    }
  }
}

module.exports = TDLibManager;
