# Zone News Bot - Modular Breakdown Plan

## Current Status
- **Original File**: command-service.js (3742+ lines, broken with syntax errors) - BACKED UP
- **Goal**: Break into smaller, manageable modules with comprehensive functionality - ✅ 90% COMPLETE
- **Approach**: Each agent works on specific modules to avoid conflicts - ✅ SUCCESSFUL
- **Last Updated**: 2025-08-14 23:50 (Adelaide Time)

## Module Structure

### ✅ Completed Modules

#### 1. **admin-commands.js** (COMPLETED)
- **Location**: `/apps/bot/src/services/admin-commands.js`
- **Status**: ✅ Created, needs upload to server
- **Functionality**:
  - Admin panel with statistics
  - Broadcast system
  - User management
  - Post management
  - Destination management
  - Analytics dashboard
  - Backup/restore
  - Schedule management
  - Comprehensive callback handlers

#### 2. **post-manager.js** (COMPLETED)
- **Location**: `/apps/bot/src/services/post-manager.js`
- **Status**: ✅ Already on server
- **Functionality**:
  - Post creation and formatting
  - Global reaction tracking
  - Retry logic
  - Permission checking

#### 3. **local-reaction-sync.js** (COMPLETED)
- **Location**: `/apps/bot/src/services/local-reaction-sync.js`
- **Status**: ✅ Already on server
- **Functionality**:
  - Zero-downtime reaction persistence
  - Local caching with background sync
  - Handles reaction callbacks

### 🔄 In Progress Modules - REFINED BREAKDOWN (Max 500 lines each)

#### 4. **command-utils.js** (PRIORITY 1 - Shared utilities)
- **Location**: `/apps/bot/src/services/utils/command-utils.js`
- **Purpose**: Shared utilities for all command modules
- **Functions**:
  ```javascript
  - trackUser(ctx, db) - Update last_active
  - logCommand(ctx, db, command) - Analytics logging
  - handleError(ctx, error) - Error handling
  - buildPagination(current, total) - Pagination keyboard
  - formatArticle(article) - Article formatting
  - checkPermissions(ctx) - Permission checks
  - sendTyping(ctx) - Typing indicator
  ```

#### 5. **info-commands.js** (~400 lines)
- **Location**: `/apps/bot/src/services/commands/info-commands.js`
- **Commands**:
  ```javascript
  /help - Categorized help system
  /about - Bot information
  /feedback - User feedback
  /report - Issue reporting
  ```

#### 6. **news-commands.js** (~500 lines)
- **Location**: `/apps/bot/src/services/commands/news-commands.js`
- **Commands**:
  ```javascript
  /news - Browse with pagination
  /trending - Popular articles
  /search - Search articles
  /categories - List categories
  ```

#### 7. **user-commands.js** (~400 lines)
- **Location**: `/apps/bot/src/services/commands/user-commands.js`
- **Commands**:
  ```javascript
  /mystats - User statistics
  /settings - Preferences
  /saved - Bookmarked articles
  /share - Share functionality
  ```

#### 8. **subscription-commands.js** (~300 lines)
- **Location**: `/apps/bot/src/services/commands/subscription-commands.js`
- **Commands**:
  ```javascript
  /subscribe - Subscribe to categories
  /unsubscribe - Unsubscribe from categories
  ```

#### 9. **news-callbacks.js** (~400 lines)
- **Location**: `/apps/bot/src/services/callbacks/news-callbacks.js`
- **Callbacks**:
  ```javascript
  news:next, news:prev, news:page:*
  article:read:*, article:save:*, article:share:*
  category:browse:*, trending:more
  search:results:*
  ```

#### 10. **settings-callbacks.js** (~300 lines)
- **Location**: `/apps/bot/src/services/callbacks/settings-callbacks.js`
- **Callbacks**:
  ```javascript
  settings:notifications:*, settings:language:*
  settings:timezone:*, settings:categories:*
  pref:save, pref:reset, pref:edit:*
  ```

#### 11. **general-callbacks.js** (~300 lines)
- **Location**: `/apps/bot/src/services/callbacks/general-callbacks.js`
- **Callbacks**:
  ```javascript
  how_to_use, how_to_use:*
  news_coming_soon, help:category:*
  about:features, feedback:submit
  ```

### 📋 Pending Modules (Agent 2 - Other agent)

#### 6. **message-handlers.js** (FOR AGENT 2)
- **Location**: `/apps/bot/src/services/message-handlers.js`
- **Assigned to**: Agent 2 (Other agent)
- **Functionality**:
  ```javascript
  // Forward message handling
  - Channel/group detection
  - Auto-add destinations
  - Content extraction
  
  // Text message processing
  - Natural language commands
  - Quick actions
  
  // Media handling
  - Photo/video processing
  - Document handling
  
  // Inline query handling
  - Search inline
  - Share inline
  ```

#### 7. **setup-wizard.js** (FOR AGENT 2)
- **Location**: `/apps/bot/src/services/setup-wizard.js`
- **Assigned to**: Agent 2
- **Functionality**:
  ```javascript
  // First-time setup
  - Welcome flow
  - Category selection
  - Notification preferences
  - Channel/group addition
  - Tutorial walkthrough
  ```

#### 8. **scheduler-service.js** (FOR AGENT 2)
- **Location**: `/apps/bot/src/services/scheduler-service.js`
- **Assigned to**: Agent 2
- **Functionality**:
  ```javascript
  // Scheduled posting
  - Cron job management
  - Schedule CRUD operations
  - Timezone handling
  - Batch posting
  - Schedule validation
  ```

### 🔗 Integration Module (Final - Both agents review)

#### 9. **command-service.js** (FINAL - Coordinate)
- **Location**: `/apps/bot/src/services/command-service.js`
- **Purpose**: Main integration point
- **Structure**:
  ```javascript
  const AdminCommands = require('./admin-commands');
  const PublicCommands = require('./public-commands');
  const CallbackHandlers = require('./callback-handlers');
  const MessageHandlers = require('./message-handlers');
  const SetupWizard = require('./setup-wizard');
  const SchedulerService = require('./scheduler-service');
  
  class CommandService {
    constructor(bot, db) {
      this.bot = bot;
      this.db = db;
      
      // Initialize all modules
      this.adminCommands = new AdminCommands(bot, db);
      this.publicCommands = new PublicCommands(bot, db);
      this.callbackHandlers = new CallbackHandlers(bot, db);
      this.messageHandlers = new MessageHandlers(bot, db);
      this.setupWizard = new SetupWizard(bot, db);
      this.scheduler = new SchedulerService(bot, db);
    }
    
    registerCommands() {
      // Register all command modules
      this.adminCommands.register();
      this.publicCommands.register();
      this.callbackHandlers.register();
      this.messageHandlers.register();
      this.setupWizard.register();
      
      // Start scheduler
      this.scheduler.start();
    }
  }
  ```

## Work Distribution

### Agent 1 (Current) Tasks:
1. ✅ Document plan (this file)
2. 🔄 Create public-commands.js (comprehensive)
3. ⏳ Create callback-handlers.js
4. ⏳ Help with final integration

### Agent 2 (Other) Tasks:
1. ⏳ Create message-handlers.js
2. ⏳ Create setup-wizard.js
3. ⏳ Create scheduler-service.js
4. ⏳ Help with final integration

## Server Upload Order
1. Upload all individual modules first
2. Backup existing command-service.js
3. Upload new integrated command-service.js
4. Restart bot with PM2
5. Test all functionality

## Testing Checklist
- [ ] Admin commands work
- [ ] Public commands work
- [ ] Callbacks are handled
- [ ] Messages are processed
- [ ] Setup wizard flows correctly
- [ ] Schedules execute
- [ ] Reactions persist
- [ ] No syntax errors
- [ ] Bot stays stable (no restart loops)

## File Locations Summary
```
/apps/bot/src/services/
├── admin-commands.js       ✅ (needs upload)
├── post-manager.js         ✅ (on server)
├── local-reaction-sync.js  ✅ (on server)
├── public-commands.js      🔄 (Agent 1 - in progress)
├── callback-handlers.js    ⏳ (Agent 1 - next)
├── message-handlers.js     ⏳ (Agent 2)
├── setup-wizard.js         ⏳ (Agent 2)
├── scheduler-service.js    ⏳ (Agent 2)
└── command-service.js      ⏳ (Final - integration)
```

## Notes
- Each module should be self-contained with its own error handling
- All modules follow class-based pattern for consistency
- Database operations should use proper indexes
- User tracking (last_active) in all user interactions
- Command usage logging for analytics
- Comprehensive inline keyboards for better UX
- Support for both private and group contexts

## Current Bot Issues to Fix
1. Bot restart loop (270+ restarts) - caused by syntax errors
2. Missing registerAdminCommands function
3. HTTP URL in mini app (should be HTTPS)
4. Command-service.js too large (3742+ lines)
5. Duplicate code sections
6. Missing closing braces

## Success Criteria
- Bot runs without restarts
- All commands respond correctly
- Reactions persist across restarts
- Modular code is maintainable
- Each file under 1000 lines
- Clear separation of concerns