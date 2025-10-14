/**
 * TDLib Authentication Service
 * Manages persistent Telegram sessions with automatic state restoration
 */

const path = require('path');
const fs = require('fs').promises;
const readline = require('readline');
const EventEmitter = require('events');
const logger = require('../utils/logger');

class TDLibAuthService extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      // API credentials from https://my.telegram.org
      apiId: config.apiId || process.env.TELEGRAM_API_ID,
      apiHash: config.apiHash || process.env.TELEGRAM_API_HASH,
      
      // Session storage - THIS IS KEY FOR PERSISTENCE
      databaseDirectory: config.databaseDirectory || path.join(process.cwd(), 'tdlib-sessions'),
      filesDirectory: config.filesDirectory || path.join(process.cwd(), 'tdlib-files'),
      
      // Session configuration
      useMessageDatabase: config.useMessageDatabase !== false, // Store messages locally
      useSecretChats: config.useSecretChats || false,
      useFileDatabase: config.useFileDatabase !== false, // Store downloaded files
      useChatInfoDatabase: config.useChatInfoDatabase !== false, // Store chat info
      
      // Device identification
      systemLanguageCode: config.systemLanguageCode || 'en-AU',
      deviceModel: config.deviceModel || 'Zone News Server',
      systemVersion: config.systemVersion || '1.0.0',
      applicationVersion: config.applicationVersion || '1.0.0',
      
      // Session persistence
      enableStorageOptimizer: true, // Automatically manage storage
      ignoreFileNames: false,
      
      // Authentication helpers
      phoneNumber: config.phoneNumber || process.env.TELEGRAM_PHONE_NUMBER,
      password: config.password || process.env.TELEGRAM_2FA_PASSWORD,
      botToken: config.botToken || process.env.TELEGRAM_BOT_TOKEN,
      
      // Session mode
      mode: config.mode || 'user' // 'user' or 'bot'
    };
    
    this.client = null;
    this.isAuthenticated = false;
    this.authState = null;
    this.sessionExists = false;
  }

  /**
   * Initialize TDLib with persistent session support
   */
  async initialize() {
    try {
      // Ensure directories exist
      await this.ensureDirectories();
      
      // Check for existing session
      this.sessionExists = await this.checkExistingSession();
      
      if (this.sessionExists) {
        logger.info('🔐 Found existing TDLib session, attempting to restore...');
      } else {
        logger.info('🔑 No existing session found, will create new one');
      }
      
      // Initialize TDLib client
      const TDLib = await this.loadTDLib();
      
      this.client = new TDLib({
        api_id: this.config.apiId,
        api_hash: this.config.apiHash,
        database_directory: this.config.databaseDirectory,
        files_directory: this.config.filesDirectory,
        use_message_database: this.config.useMessageDatabase,
        use_secret_chats: this.config.useSecretChats,
        use_file_database: this.config.useFileDatabase,
        use_chat_info_database: this.config.useChatInfoDatabase,
        system_language_code: this.config.systemLanguageCode,
        device_model: this.config.deviceModel,
        system_version: this.config.systemVersion,
        application_version: this.config.applicationVersion,
        enable_storage_optimizer: this.config.enableStorageOptimizer,
        ignore_file_names: this.config.ignoreFileNames
      });
      
      // Set up update handlers
      this.setupUpdateHandlers();
      
      // Start authentication flow
      await this.authenticate();
      
      return this.client;
      
    } catch (error) {
      logger.error('Failed to initialize TDLib:', error);
      throw error;
    }
  }

  /**
   * Check if an existing session exists
   */
  async checkExistingSession() {
    try {
      const dbPath = path.join(this.config.databaseDirectory, 'td.db');
      await fs.access(dbPath);
      
      const stats = await fs.stat(dbPath);
      if (stats.size > 0) {
        logger.info(`📁 Found existing session database (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
        return true;
      }
      
      return false;
    } catch (error) {
      // Database doesn't exist yet
      return false;
    }
  }

  /**
   * Ensure required directories exist
   */
  async ensureDirectories() {
    const dirs = [
      this.config.databaseDirectory,
      this.config.filesDirectory,
      path.join(this.config.databaseDirectory, 'thumbnails'),
      path.join(this.config.databaseDirectory, 'profile_photos'),
      path.join(this.config.filesDirectory, 'documents'),
      path.join(this.config.filesDirectory, 'videos'),
      path.join(this.config.filesDirectory, 'voice'),
      path.join(this.config.filesDirectory, 'photos')
    ];
    
    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Handle authentication flow with session persistence
   */
  async authenticate() {
    return new Promise((resolve, reject) => {
      const authHandler = async (authState) => {
        this.authState = authState;
        
        logger.info(`🔐 Auth state: ${authState['@type']}`);
        
        switch (authState['@type']) {
          case 'authorizationStateWaitTdlibParameters':
            // TDLib is waiting for parameters - this happens on first run
            // Parameters are already set in constructor, so this should pass automatically
            logger.info('✅ TDLib parameters set, session initializing...');
            break;
            
          case 'authorizationStateWaitPhoneNumber':
            // Need phone number - only happens on first authentication
            await this.handlePhoneNumber();
            break;
            
          case 'authorizationStateWaitCode':
            // Need verification code
            await this.handleVerificationCode();
            break;
            
          case 'authorizationStateWaitPassword':
            // Need 2FA password
            await this.handle2FAPassword();
            break;
            
          case 'authorizationStateWaitRegistration':
            // New user registration required
            await this.handleRegistration();
            break;
            
          case 'authorizationStateReady':
            // Successfully authenticated!
            this.isAuthenticated = true;
            logger.info('🎉 Authentication successful! Session is now persistent.');
            
            // Save session info
            await this.saveSessionInfo();
            
            this.emit('authenticated');
            this.client.off('updateAuthorizationState', authHandler);
            resolve(true);
            break;
            
          case 'authorizationStateLoggingOut':
            logger.info('📤 Logging out...');
            this.isAuthenticated = false;
            break;
            
          case 'authorizationStateClosing':
            logger.info('🔒 TDLib closing...');
            break;
            
          case 'authorizationStateClosed':
            logger.info('🔐 TDLib closed');
            this.isAuthenticated = false;
            break;
            
          default:
            logger.warn(`Unknown authorization state: ${authState['@type']}`);
        }
      };
      
      this.client.on('updateAuthorizationState', authHandler);
      
      // Check initial state
      this.client.send({
        '@type': 'getAuthorizationState'
      });
    });
  }

  /**
   * Handle phone number input
   */
  async handlePhoneNumber() {
    if (this.config.mode === 'bot' && this.config.botToken) {
      // Bot authentication
      logger.info('🤖 Authenticating as bot...');
      await this.client.send({
        '@type': 'checkAuthenticationBotToken',
        token: this.config.botToken
      });
    } else {
      // User authentication
      let phoneNumber = this.config.phoneNumber;
      
      if (!phoneNumber) {
        phoneNumber = await this.promptUser('📱 Enter phone number (with country code, e.g., +61XXXXXXXXX): ');
      }
      
      await this.client.send({
        '@type': 'setAuthenticationPhoneNumber',
        phone_number: phoneNumber,
        settings: {
          '@type': 'phoneNumberAuthenticationSettings',
          allow_flash_call: false,
          allow_missed_call: false,
          is_current_phone_number: false,
          allow_sms_retriever_api: false
        }
      });
    }
  }

  /**
   * Handle verification code
   */
  async handleVerificationCode() {
    const code = await this.promptUser('📨 Enter verification code: ');
    
    await this.client.send({
      '@type': 'checkAuthenticationCode',
      code: code
    });
  }

  /**
   * Handle 2FA password
   */
  async handle2FAPassword() {
    let password = this.config.password;
    
    if (!password) {
      password = await this.promptUser('🔒 Enter 2FA password: ', true);
    }
    
    await this.client.send({
      '@type': 'checkAuthenticationPassword',
      password: password
    });
  }

  /**
   * Handle new user registration
   */
  async handleRegistration() {
    const firstName = await this.promptUser('Enter first name: ');
    const lastName = await this.promptUser('Enter last name (optional): ');
    
    await this.client.send({
      '@type': 'registerUser',
      first_name: firstName,
      last_name: lastName
    });
  }

  /**
   * Prompt user for input
   */
  async promptUser(question, hidden = false) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    return new Promise((resolve) => {
      if (hidden) {
        // Hide password input
        rl.stdoutMuted = true;
        rl.question(question, (answer) => {
          rl.stdoutMuted = false;
          rl.close();
          console.log(''); // New line after hidden input
          resolve(answer);
        });
        
        rl._writeToOutput = function _writeToOutput(stringToWrite) {
          if (rl.stdoutMuted) {
            rl.output.write('*');
          } else {
            rl.output.write(stringToWrite);
          }
        };
      } else {
        rl.question(question, (answer) => {
          rl.close();
          resolve(answer);
        });
      }
    });
  }

  /**
   * Save session information for quick access
   */
  async saveSessionInfo() {
    try {
      const sessionInfo = {
        authenticated: true,
        timestamp: new Date().toISOString(),
        mode: this.config.mode,
        deviceModel: this.config.deviceModel,
        databaseDirectory: this.config.databaseDirectory
      };
      
      // Get current user info
      if (this.config.mode === 'user') {
        const me = await this.client.send({
          '@type': 'getMe'
        });
        
        sessionInfo.user = {
          id: me.id,
          firstName: me.first_name,
          lastName: me.last_name,
          username: me.username,
          phoneNumber: me.phone_number
        };
        
        logger.info(`✅ Logged in as: ${me.first_name} ${me.last_name || ''} (@${me.username || 'no-username'})`);
      }
      
      await fs.writeFile(
        path.join(this.config.databaseDirectory, 'session.json'),
        JSON.stringify(sessionInfo, null, 2)
      );
      
    } catch (error) {
      logger.error('Failed to save session info:', error);
    }
  }

  /**
   * Load existing session information
   */
  async loadSessionInfo() {
    try {
      const sessionPath = path.join(this.config.databaseDirectory, 'session.json');
      const data = await fs.readFile(sessionPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  /**
   * Setup update handlers for monitoring
   */
  setupUpdateHandlers() {
    // Monitor connection state
    this.client.on('updateConnectionState', (update) => {
      logger.info(`📡 Connection state: ${update.state['@type']}`);
      this.emit('connectionStateChanged', update.state);
    });
    
    // Monitor new messages (if needed)
    this.client.on('updateNewMessage', (update) => {
      this.emit('newMessage', update.message);
    });
    
    // Monitor chat updates
    this.client.on('updateNewChat', (update) => {
      this.emit('newChat', update.chat);
    });
  }

  /**
   * Logout and clear session
   */
  async logout() {
    try {
      logger.info('🔓 Logging out and clearing session...');
      
      await this.client.send({
        '@type': 'logOut'
      });
      
      // Wait for logout to complete
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Clear session data
      await this.clearSession();
      
      this.isAuthenticated = false;
      logger.info('✅ Logged out successfully');
      
    } catch (error) {
      logger.error('Failed to logout:', error);
      throw error;
    }
  }

  /**
   * Clear all session data
   */
  async clearSession() {
    try {
      // Remove database directory
      await fs.rm(this.config.databaseDirectory, { recursive: true, force: true });
      
      // Remove files directory
      await fs.rm(this.config.filesDirectory, { recursive: true, force: true });
      
      logger.info('🗑️ Session data cleared');
      
    } catch (error) {
      logger.error('Failed to clear session:', error);
    }
  }

  /**
   * Check if currently authenticated
   */
  async isLoggedIn() {
    try {
      const state = await this.client.send({
        '@type': 'getAuthorizationState'
      });
      
      return state['@type'] === 'authorizationStateReady';
    } catch (error) {
      return false;
    }
  }

  /**
   * Get current session status
   */
  async getSessionStatus() {
    const sessionInfo = await this.loadSessionInfo();
    const isLoggedIn = await this.isLoggedIn();
    
    return {
      exists: this.sessionExists,
      authenticated: isLoggedIn,
      sessionInfo: sessionInfo,
      databaseSize: await this.getDatabaseSize()
    };
  }

  /**
   * Get database size
   */
  async getDatabaseSize() {
    try {
      const stats = await fs.stat(path.join(this.config.databaseDirectory, 'td.db'));
      return (stats.size / 1024 / 1024).toFixed(2) + ' MB';
    } catch (error) {
      return '0 MB';
    }
  }

  /**
   * Load TDLib library
   */
  async loadTDLib() {
    // This would load the actual TDLib binding
    // For now, returning a mock that shows the interface
    const { EventEmitter } = require('events');
    
    class TDLibMock extends EventEmitter {
      constructor(config) {
        super();
        this.config = config;
        
        // Simulate successful restoration of existing session
        setTimeout(() => {
          if (config.database_directory && this.hasExistingSession()) {
            this.emit('updateAuthorizationState', {
              '@type': 'authorizationStateReady'
            });
          } else {
            this.emit('updateAuthorizationState', {
              '@type': 'authorizationStateWaitPhoneNumber'
            });
          }
        }, 100);
      }
      
      hasExistingSession() {
        // Check if session exists
        const fs = require('fs');
        try {
          fs.accessSync(path.join(this.config.database_directory, 'td.db'));
          return true;
        } catch {
          return false;
        }
      }
      
      async send(request) {
        // Mock implementation
        return { '@type': 'ok' };
      }
    }
    
    return TDLibMock;
  }
}

module.exports = TDLibAuthService;
